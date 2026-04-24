from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.mis.client import MisClient
from app.mis.parsers import (
    find_employee_list,
    find_schedule_items,
    find_ticket_items,
    parse_datetime_any,
    parse_employee_id,
    safe_json_dumps,
    slot_bounds,
    employee_names,
)
from app.models import (
    Employee,
    EmployeeService,
    NomenclatureItem,
    OccupiedSlot,
    ScheduleSlot,
    Service,
    SyncRun,
    SyncState,
)

logger = logging.getLogger(__name__)
_FULL_SYNC_LOCK = threading.Lock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _compact_error_message(err: Exception, max_len: int = 1200) -> str:
    message = str(err).strip()
    if len(message) <= max_len:
        return message
    return f"{message[:max_len]}... [truncated]"


def _ensure_sync_state_row(db: Session) -> SyncState:
    row = db.get(SyncState, 1)
    if row is None:
        row = SyncState(id=1, full_sync_done=False, updated_at=_utcnow())
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def is_full_sync_done(db: Session) -> bool:
    return bool(_ensure_sync_state_row(db).full_sync_done)


def _range() -> tuple[datetime, datetime]:
    start = _utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    # Keep sync window predictable and fast for kiosk workloads.
    days = max(1, min(int(settings.sync_days_ahead), 31))
    end = start + timedelta(days=days)
    return start, end


def _prune_expired_slots(db: Session, keep_days: int = 1) -> None:
    cutoff = _utcnow() - timedelta(days=max(0, keep_days))
    db.execute(delete(ScheduleSlot).where(ScheduleSlot.slot_end < cutoff))
    db.execute(delete(OccupiedSlot).where(OccupiedSlot.slot_end < cutoff))
    db.commit()


def _split_interval(start: datetime, end: datetime, step_minutes: int) -> list[tuple[datetime, datetime]]:
    if end <= start:
        return []
    delta = (end - start).total_seconds() / 60
    if delta <= step_minutes * 1.5:
        return [(start, end)]
    out: list[tuple[datetime, datetime]] = []
    cur = start
    step = timedelta(minutes=step_minutes)
    while cur + step <= end:
        out.append((cur, cur + step))
        cur += step
    if cur < end:
        out.append((cur, end))
    return out


def _extract_clinic_id(row: dict[str, Any]) -> str | None:
    clinic = row.get("Клиника") or row.get("Clinic") or row.get("clinic") or row.get("Филиал")
    if isinstance(clinic, dict):
        v = clinic.get("УИД") or clinic.get("UID") or clinic.get("GUID")
        return str(v).strip() if v else None
    return str(clinic).strip() if clinic else None


def _clinic_allowed(clinic_id: str | None) -> bool:
    target = (settings.mis_target_clinic_guid or "").strip()
    if not target:
        return True
    return (clinic_id or "").strip().lower() == target.lower()


def _extract_service_id(row: dict[str, Any]) -> str | None:
    svc = row.get("Услуга") or row.get("Service") or row.get("service")
    if svc is None:
        works = row.get("СписокРабот") or row.get("Services") or row.get("services")
        if isinstance(works, list) and works and isinstance(works[0], dict):
            svc = works[0]
        elif isinstance(works, dict):
            svc = works
    if isinstance(svc, dict):
        for k in ("УИД", "UID", "GUID", "Ref"):
            v = svc.get(k)
            if v:
                return str(v).strip() or None
        return None
    if svc is None:
        return None
    s = str(svc).strip()
    if not s or len(s) > 120:
        return None
    return s


def _extract_service_name(row: dict[str, Any]) -> str | None:
    svc = row.get("Услуга") or row.get("Service") or row.get("service")
    if svc is None:
        works = row.get("СписокРабот") or row.get("Services") or row.get("services")
        if isinstance(works, list) and works and isinstance(works[0], dict):
            svc = works[0]
        elif isinstance(works, dict):
            svc = works
    if isinstance(svc, dict):
        name = svc.get("Наименование") or svc.get("Name") or svc.get("name")
        return str(name).strip() if name else None
    if isinstance(svc, str):
        return svc.strip() or None
    return None


def _extract_service_price(row: dict[str, Any]) -> int | None:
    price = row.get("Цена") or row.get("Price") or row.get("Стоимость")
    if price is None:
        works = row.get("СписокРабот") or row.get("Services") or row.get("services")
        w = None
        if isinstance(works, list) and works and isinstance(works[0], dict):
            w = works[0]
        elif isinstance(works, dict):
            w = works
        if isinstance(w, dict):
            price = w.get("Цена") or w.get("Price") or w.get("Стоимость")
    try:
        return int(float(price)) if price is not None else None
    except (TypeError, ValueError):
        return None


def _normalize_service_name(name: str | None) -> str:
    if not name:
        return ""
    return " ".join(name.strip().lower().split())


def _extract_main_service_ids(row: dict[str, Any]) -> list[str]:
    block = row.get("ОсновныеУслуги") or row.get("MainServices") or row.get("main_services")
    if not block:
        return []

    items: list[dict[str, Any]] = []
    if isinstance(block, dict):
        ms = block.get("ОсновнаяУслуга") or block.get("MainService")
        if isinstance(ms, list):
            items = [x for x in ms if isinstance(x, dict)]
        elif isinstance(ms, dict):
            items = [ms]
        else:
            items = [block]
    elif isinstance(block, list):
        items = [x for x in block if isinstance(x, dict)]

    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        sid = item.get("УИД") or item.get("UID") or item.get("GUID") or item.get("Ref")
        if not sid:
            continue
        sid_s = str(sid).strip().lower()
        if not sid_s or sid_s in seen:
            continue
        seen.add(sid_s)
        out.append(sid_s)
    return out


def _extract_schedule_intervals(row: dict[str, Any], step: int) -> list[tuple[datetime, datetime]]:
    def _period_items(container: Any) -> list[dict[str, Any]]:
        if isinstance(container, list):
            return [x for x in container if isinstance(x, dict)]
        if isinstance(container, dict):
            pg = container.get("ПериодГрафика")
            if isinstance(pg, list):
                return [x for x in pg if isinstance(x, dict)]
            if isinstance(pg, dict):
                return [pg]
            return [container]
        return []

    intervals: list[tuple[datetime, datetime]] = []
    periods = row.get("ПериодыГрафика") or row.get("SchedulePeriods") or {}
    # If periods are present, ONLY free intervals should become available slots.
    if isinstance(periods, dict):
        for key in ("СвободноеВремя", "FreeTime"):
            for item in _period_items(periods.get(key)):
                is_, ie = slot_bounds(item)
                if is_ is None:
                    base_date = parse_datetime_any(item.get("Дата") or item.get("Date"))
                    t0 = parse_datetime_any(item.get("ВремяНачала") or item.get("TimeBegin"))
                    t1 = parse_datetime_any(item.get("ВремяОкончания") or item.get("TimeEnd"))
                    is_ = t0 or base_date
                    ie = t1
                    if is_ and ie is None:
                        ie = is_ + timedelta(minutes=step)
                if is_ is None:
                    continue
                if ie is None:
                    ie = is_ + timedelta(minutes=step)
                intervals.extend(_split_interval(is_, ie, step))
        return intervals

    # Flat payload fallback (treat as free only when no periods section exists).
    s, e = slot_bounds(row)
    if s is None:
        s = parse_datetime_any(row.get("Дата") or row.get("Date"))
    if s is not None:
        if e is None:
            e = s + timedelta(minutes=step)
        intervals.extend(_split_interval(s, e, step))
    return intervals


def _extract_busy_intervals(row: dict[str, Any], step: int) -> list[tuple[datetime, datetime]]:
    def _period_items(container: Any) -> list[dict[str, Any]]:
        if isinstance(container, list):
            return [x for x in container if isinstance(x, dict)]
        if isinstance(container, dict):
            pg = container.get("ПериодГрафика")
            if isinstance(pg, list):
                return [x for x in pg if isinstance(x, dict)]
            if isinstance(pg, dict):
                return [pg]
            return [container]
        return []

    out: list[tuple[datetime, datetime]] = []
    periods = row.get("ПериодыГрафика") or row.get("SchedulePeriods") or {}
    if not isinstance(periods, dict):
        return out
    for key in ("ЗанятоеВремя", "BusyTime"):
        for item in _period_items(periods.get(key)):
            s, e = slot_bounds(item)
            if s is None:
                base_date = parse_datetime_any(item.get("Дата") or item.get("Date"))
                t0 = parse_datetime_any(item.get("ВремяНачала") or item.get("TimeBegin"))
                t1 = parse_datetime_any(item.get("ВремяОкончания") or item.get("TimeEnd"))
                s = t0 or base_date
                e = t1
            if s is None:
                continue
            if e is None:
                e = s + timedelta(minutes=step)
            out.extend(_split_interval(s, e, step))
    return out


async def _sync_employees(db: Session, client: MisClient) -> int:
    data = await client.list_employees()
    rows = find_employee_list(data)
    n = 0
    for row in rows:
        eid = parse_employee_id(row)
        if not eid:
            continue
        sn, fn, pn = employee_names(row)
        phone = row.get("Телефон") or row.get("Phone") or row.get("phone")
        spec = row.get("Специальность") or row.get("Specialty") or row.get("Должность")
        emp = db.get(Employee, eid)
        if emp is None:
            emp = Employee(mis_id=eid)
            db.add(emp)
        emp.surname = sn or emp.surname
        emp.name = fn or emp.name
        emp.patronymic = pn or emp.patronymic
        emp.phone = str(phone).strip() if phone else emp.phone
        emp.specialty = str(spec).strip() if spec else emp.specialty
        emp.is_main = True
        emp.raw_json = safe_json_dumps(row)
        emp.updated_at = _utcnow()
        n += 1
    db.commit()
    return n


def _target_clinic_id() -> str:
    return (settings.mis_target_clinic_guid or settings.mis_clinic_guid or "").strip()


def _filter_rows_by_target_clinic(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    target = _target_clinic_id().lower()
    if not target:
        return rows
    out: list[dict[str, Any]] = []
    for row in rows:
        if (_extract_clinic_id(row) or "").strip().lower() == target:
            out.append(row)
    return out


def _sync_employees_from_enlargement_rows(db: Session, rows: list[dict[str, Any]]) -> int:
    rows = _filter_rows_by_target_clinic(rows)
    keep_ids: set[str] = set()
    n = 0
    for row in rows:
        eid = parse_employee_id(row)
        if not eid:
            continue
        keep_ids.add(eid)
        fio = str(row.get("СотрудникФИО") or "").strip()
        parts = fio.split()
        sn = parts[0] if len(parts) > 0 else None
        fn = parts[1] if len(parts) > 1 else None
        pn = " ".join(parts[2:]) if len(parts) > 2 else None
        spec = row.get("Специализация") or row.get("Specialty") or row.get("Должность")
        emp = db.get(Employee, eid)
        if emp is None:
            emp = Employee(mis_id=eid)
            db.add(emp)
        emp.surname = sn or emp.surname
        emp.name = fn or emp.name
        emp.patronymic = pn or emp.patronymic
        emp.specialty = str(spec).strip() if spec else emp.specialty
        emp.is_main = True
        emp.raw_json = safe_json_dumps(row)
        emp.updated_at = _utcnow()
        n += 1
    # NOTE: do not hard-delete employees here; deleting referenced doctors can break
    # FK integrity for availability tables during sync races.
    db.commit()
    return n


def _ingest_schedule_rows(
    db: Session,
    rows: list[dict[str, Any]],
    default_employee_id: str | None,
) -> int:
    step = settings.slot_step_minutes
    existing_employee_ids = {
        str(x).strip().lower()
        for x in db.scalars(select(Employee.mis_id)).all()
        if str(x).strip()
    }
    seen: set[tuple[str, datetime, datetime]] = set()
    payload: list[dict[str, Any]] = []
    for row in rows:
        eid = parse_employee_id(row) or default_employee_id
        if not eid:
            continue
        if str(eid).strip().lower() not in existing_employee_ids:
            continue
        for a, b in _extract_schedule_intervals(row, step):
            key = (eid, a, b)
            if key in seen:
                continue
            seen.add(key)
            cid = _extract_clinic_id(row)
            if not _clinic_allowed(cid):
                continue
            payload.append(
                {
                    "employee_mis_id": eid,
                    "slot_start": a,
                    "slot_end": b,
                    "clinic_mis_id": cid,
                    "source": "mis",
                }
            )
    if not payload:
        return 0
    stmt = pg_insert(ScheduleSlot).values(payload)
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["employee_mis_id", "slot_start", "slot_end"]
    )
    db.execute(stmt)
    db.commit()
    return len(payload)


def _ingest_busy_from_schedule_rows(
    db: Session,
    rows: list[dict[str, Any]],
    default_employee_id: str | None,
) -> int:
    step = settings.slot_step_minutes
    existing_employee_ids = {
        str(x).strip().lower()
        for x in db.scalars(select(Employee.mis_id)).all()
        if str(x).strip()
    }
    seen: set[tuple[str, datetime, datetime]] = set()
    payload: list[dict[str, Any]] = []
    for row in rows:
        eid = parse_employee_id(row) or default_employee_id
        if not eid:
            continue
        if str(eid).strip().lower() not in existing_employee_ids:
            continue
        cid = _extract_clinic_id(row)
        if not _clinic_allowed(cid):
            continue
        for a, b in _extract_busy_intervals(row, step):
            key = (eid, a, b)
            if key in seen:
                continue
            seen.add(key)
            payload.append(
                {
                    "employee_mis_id": eid,
                    "slot_start": a,
                    "slot_end": b,
                    "appointment_guid": None,
                    "patient_label": None,
                    "service_mis_id": None,
                    "source": "schedule_busy",
                    "updated_at": _utcnow(),
                }
            )
    if not payload:
        return 0
    stmt = pg_insert(OccupiedSlot).values(payload)
    db.execute(stmt)
    db.commit()
    return len(payload)


async def _sync_schedule_enlargement(db: Session, client: MisClient, start: datetime, end: datetime) -> int:
    try:
        data = await client.get_enlargement_schedule(start, end)
    except Exception as e:
        logger.warning("enlargement schedule: %s", e)
        return 0
    items = _filter_rows_by_target_clinic(find_schedule_items(data))
    if not items:
        items = find_ticket_items(data)
    inserted = _ingest_schedule_rows(db, items, default_employee_id=None)
    _ingest_busy_from_schedule_rows(db, items, default_employee_id=None)
    return inserted


async def _sync_schedule_per_employee(db: Session, client: MisClient, start: datetime, end: datetime) -> int:
    emps = db.scalars(select(Employee.mis_id)).all()
    total = 0
    clinic_id = _target_clinic_id()
    for eid in emps:
        try:
            data = await client.get_schedule20(str(eid), start, end, clinic_id=clinic_id)
        except Exception as ex:
            logger.debug("schedule20 %s: %s", eid, ex)
            continue
        items = _filter_rows_by_target_clinic(find_schedule_items(data))
        total += _ingest_schedule_rows(db, items, default_employee_id=None)
        _ingest_busy_from_schedule_rows(db, items, default_employee_id=None)
        await asyncio.sleep(0.05)
    return total


async def _sync_tickets(db: Session, client: MisClient, start: datetime, end: datetime) -> int:
    total = 0
    rows: list[dict[str, Any]] = []
    try:
        # Prefer one global request to avoid hammering MIS per doctor.
        data = await client.patient_tickets(start, end, employee_id=None)
        rows = find_ticket_items(data)
    except Exception as ex:
        logger.debug("tickets global failed: %s", ex)
        rows = []

    # Fallback: if global endpoint is empty/incompatible, query only known doctors.
    if not rows:
        emps = db.scalars(select(Employee.mis_id)).all()
        for eid in emps:
            try:
                data = await client.patient_tickets(start, end, employee_id=str(eid))
                rows.extend(find_ticket_items(data))
            except Exception as ex:
                logger.debug("tickets %s: %s", eid, ex)
                continue
            await asyncio.sleep(0.05)

    occ_payload: list[dict[str, Any]] = []
    occ_seen: set[tuple[str, datetime, datetime, str | None]] = set()
    service_payload: list[dict[str, Any]] = []
    service_seen: set[str] = set()
    existing_employee_ids = {
        str(x).strip().lower()
        for x in db.scalars(select(Employee.mis_id)).all()
        if str(x).strip()
    }
    for row in rows:
        s, e = slot_bounds(row)
        if s is None:
            continue
        if e is None:
            e = s + timedelta(minutes=settings.slot_step_minutes)
        emp = parse_employee_id(row)
        if not emp:
            continue
        if str(emp).strip().lower() not in existing_employee_ids:
            continue
        if not _clinic_allowed(_extract_clinic_id(row)):
            continue
        guid = (
            row.get("УИД")
            or row.get("UID")
            or row.get("GUID")
            or row.get("Номер")
        )
        guid_s = str(guid).strip() if guid else None
        sn, fn, _ = employee_names(row)
        label = " ".join(x for x in (sn, fn) if x) or None
        svc_id = _extract_service_id(row)
        occ_key = (emp, s, e, guid_s)
        if occ_key in occ_seen:
            continue
        occ_seen.add(occ_key)
        occ_payload.append(
            {
                "employee_mis_id": emp,
                "slot_start": s,
                "slot_end": e,
                "appointment_guid": guid_s,
                "patient_label": label,
                "service_mis_id": svc_id,
                "source": "tickets",
                "updated_at": _utcnow(),
            }
        )
        total += 1
        # Build service directory from tickets as fallback.
        if svc_id:
            svc_id = svc_id.strip().lower()
            name = _extract_service_name(row)
            price = _extract_service_price(row)
            if svc_id not in service_seen:
                service_seen.add(svc_id)
                service_payload.append(
                    {
                        "mis_id": svc_id,
                        "clinic_id": _extract_clinic_id(row),
                        "name": name,
                        "price": price,
                        "raw_json": None,
                        "updated_at": _utcnow(),
                    }
                )

    if occ_payload:
        stmt = pg_insert(OccupiedSlot).values(occ_payload)
        db.execute(stmt)
    if service_payload:
        stmt = pg_insert(Service).values(service_payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=["mis_id"],
            set_={
                "clinic_id": stmt.excluded.clinic_id,
                "name": stmt.excluded.name,
                "price": stmt.excluded.price,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        db.execute(stmt)
    db.commit()
    return total


async def _sync_nomenclature(db: Session, client: MisClient) -> int:
    clinic_ids: list[str] = []
    candidates = [
        (settings.mis_target_clinic_guid or "").strip(),
        (settings.mis_clinic_guid or "").strip(),
    ]
    candidates.extend(
        [str(c).strip() for c in db.scalars(select(ScheduleSlot.clinic_mis_id).distinct()).all() if c]
    )
    seen: set[str] = set()
    for cid in candidates:
        if not cid:
            continue
        key = cid.lower()
        if key in seen:
            continue
        seen.add(key)
        clinic_ids.append(cid)
    if not clinic_ids:
        logger.warning("nomenclature skipped: no clinic ids resolved")
        return 0

    n = 0
    batch_size = 500
    for clinic_id in clinic_ids:
        try:
            logger.info("sync nomenclature start clinic=%s", clinic_id)
            data = await client.get_nomenclature_and_prices(clinic_id)
        except Exception as e:
            logger.warning("nomenclature clinic %s: %s", clinic_id, e)
            continue
        items: list[dict[str, Any]] = []
        roots: list[dict[str, Any]] = [data] if isinstance(data, dict) else []
        if isinstance(data, dict):
            inner = data.get("Ответ")
            if isinstance(inner, dict):
                roots.append(inner)
        for root in roots:
            for key in ("Номенклатура", "Services", "Услуги", "Items", "НоменклатураИЦены", "Каталог"):
                v = root.get(key)
                if isinstance(v, list):
                    items = [x for x in v if isinstance(x, dict)]
                    if items:
                        break
            if items:
                break
        payload: list[dict[str, Any]] = []
        for row in items:
            mid = row.get("УИД") or row.get("UID") or row.get("GUID") or row.get("Ref")
            if not mid:
                continue
            kind = str(row.get("Вид") or row.get("Kind") or "").strip().lower()
            if kind and kind not in {"услуга", "service"}:
                continue
            is_folder = str(row.get("ЭтоПапка") or row.get("IsFolder") or "").strip().lower()
            if is_folder in {"true", "1", "yes"}:
                continue
            mid_s = str(mid).strip().lower()
            name = row.get("Наименование") or row.get("Name") or row.get("name") or row.get("Услуга")
            price = row.get("Цена") or row.get("Price") or row.get("price") or row.get("Стоимость")
            try:
                price_i = int(float(price)) if price is not None else None
            except (TypeError, ValueError):
                price_i = None
            payload.append(
                {
                    "mis_id": mid_s,
                    "clinic_id": clinic_id,
                    "name": str(name).strip() if name else None,
                    "price": price_i,
                    # Keep payload compact because source can be very large.
                    "raw_json": None,
                    "updated_at": _utcnow(),
                }
            )
            n += 1
        for i in range(0, len(payload), batch_size):
            batch = payload[i : i + batch_size]
            if not batch:
                continue
            stmt = pg_insert(NomenclatureItem).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["mis_id"],
                set_={
                    "clinic_id": stmt.excluded.clinic_id,
                    "name": stmt.excluded.name,
                    "price": stmt.excluded.price,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            db.execute(stmt)
        logger.info("sync nomenclature done clinic=%s items=%s", clinic_id, len(payload))
    db.commit()
    return n


async def _sync_employee_service_links(db: Session, client: MisClient) -> int:
    try:
        data = await client.list_employees_with_services()
    except Exception as e:
        logger.warning("employee service links: %s", e)
        return 0

    rows = find_employee_list(data)
    employee_ids = set(db.scalars(select(Employee.mis_id)).all())
    payload: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for row in rows:
        eid = parse_employee_id(row)
        if not eid or eid not in employee_ids:
            continue
        for sid in _extract_main_service_ids(row):
            key = (eid, sid)
            if key in seen:
                continue
            seen.add(key)
            payload.append(
                {
                    "employee_mis_id": eid,
                    "service_mis_id": sid,
                    "source": "employees_main_services",
                    "updated_at": _utcnow(),
                }
            )

    db.execute(delete(EmployeeService))
    if payload:
        stmt = pg_insert(EmployeeService).values(payload)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["employee_mis_id", "service_mis_id"]
        )
        db.execute(stmt)
    db.commit()
    logger.info("employee service links synced: %s", len(payload))
    return len(payload)


def _apply_prices_from_nomenclature(db: Session) -> int:
    name_to_price: dict[str, int] = {}
    rows = db.execute(
        select(NomenclatureItem.name, NomenclatureItem.price).where(
            NomenclatureItem.name.is_not(None),
            NomenclatureItem.price.is_not(None),
        )
    ).all()
    for name, price in rows:
        if not name or price is None:
            continue
        normalized = _normalize_service_name(name)
        if not normalized:
            continue
        if normalized not in name_to_price:
            name_to_price[normalized] = int(price)

    if not name_to_price:
        return 0

    updated = 0
    services = db.scalars(select(Service)).all()
    for service in services:
        normalized = _normalize_service_name(service.name)
        if not normalized:
            continue
        price = name_to_price.get(normalized)
        if price is None:
            continue
        if service.price != price:
            service.price = price
            service.updated_at = _utcnow()
            updated += 1
    if updated:
        db.commit()
    logger.info("services prices matched from nomenclature: %s", updated)
    return updated


def _hydrate_services_from_nomenclature_for_links(db: Session) -> int:
    linked_ids = [x for x in db.scalars(select(EmployeeService.service_mis_id).distinct()).all() if x]
    if not linked_ids:
        return 0

    payload: list[dict[str, Any]] = []
    for sid in linked_ids:
        item = db.get(NomenclatureItem, sid)
        if item is None:
            continue
        payload.append(
            {
                "mis_id": sid,
                "clinic_id": item.clinic_id,
                "name": item.name,
                "price": item.price,
                "raw_json": None,
                "updated_at": _utcnow(),
            }
        )

    if not payload:
        logger.warning("services hydrate from nomenclature: 0 matched rows")
        return 0

    stmt = pg_insert(Service).values(payload)
    stmt = stmt.on_conflict_do_update(
        index_elements=["mis_id"],
        set_={
            "clinic_id": stmt.excluded.clinic_id,
            "name": stmt.excluded.name,
            "price": stmt.excluded.price,
            "updated_at": stmt.excluded.updated_at,
        },
    )
    db.execute(stmt)
    db.commit()
    logger.info(
        "services hydrated from nomenclature for employee links: %s of %s",
        len(payload),
        len(linked_ids),
    )
    return len(payload)


def _purge_range(db: Session, start: datetime, end: datetime) -> None:
    db.execute(
        delete(ScheduleSlot).where(
            and_(ScheduleSlot.slot_start >= start, ScheduleSlot.slot_start < end),
        )
    )
    db.execute(
        delete(OccupiedSlot).where(
            and_(OccupiedSlot.slot_start >= start, OccupiedSlot.slot_start < end),
        )
    )
    db.commit()


async def run_full_sync(db: Session) -> SyncRun:
    sync_state = _ensure_sync_state_row(db)
    run = SyncRun(started_at=_utcnow(), ok=False, message=None)
    db.add(run)
    db.commit()
    if not _FULL_SYNC_LOCK.acquire(blocking=False):
        run.ok = False
        run.message = "sync already running"
        run.finished_at = _utcnow()
        db.commit()
        return run
    start, end = _range()
    client = MisClient()
    try:
        _prune_expired_slots(db, keep_days=1)
        raw_enl = await client.get_enlargement_schedule(start, end)
        enl_rows = find_schedule_items(raw_enl)
        if not enl_rows:
            enl_rows = find_ticket_items(raw_enl)
        _sync_employees_from_enlargement_rows(db, enl_rows)
        _purge_range(db, start, end)
        n_s = _ingest_schedule_rows(db, _filter_rows_by_target_clinic(enl_rows), default_employee_id=None)
        _ingest_busy_from_schedule_rows(db, _filter_rows_by_target_clinic(enl_rows), default_employee_id=None)
        if n_s < 5:
            await _sync_schedule_per_employee(db, client, start, end)
        else:
            await _sync_schedule_per_employee(db, client, start, end)
        await _sync_tickets(db, client, start, end)
        await _sync_nomenclature(db, client)
        await _sync_employee_service_links(db, client)
        _hydrate_services_from_nomenclature_for_links(db)
        _apply_prices_from_nomenclature(db)
        run.ok = True
        run.message = "ok"
        sync_state.full_sync_done = True
        sync_state.updated_at = _utcnow()
    except Exception as e:
        logger.exception("sync failed")
        db.rollback()
        run.ok = False
        run.message = _compact_error_message(e)
    finally:
        run.finished_at = _utcnow()
        try:
            db.commit()
        except Exception:
            db.rollback()
        _FULL_SYNC_LOCK.release()
    return run


async def run_slots_sync(db: Session) -> SyncRun:
    run = SyncRun(started_at=_utcnow(), ok=False, message=None)
    db.add(run)
    db.commit()
    if not _FULL_SYNC_LOCK.acquire(blocking=False):
        run.ok = False
        run.message = "sync already running"
        run.finished_at = _utcnow()
        db.commit()
        return run

    start, end = _range()
    client = MisClient()
    try:
        _prune_expired_slots(db, keep_days=1)
        # Lightweight refresh: update only availability tables.
        _purge_range(db, start, end)
        inserted = await _sync_schedule_enlargement(db, client, start, end)
        # Safety fallback if enlargement returned too little data.
        if inserted < 5:
            await _sync_schedule_per_employee(db, client, start, end)
        await _sync_tickets(db, client, start, end)
        run.ok = True
        run.message = "slots_only_ok"
    except Exception as e:
        logger.exception("slots-only sync failed")
        db.rollback()
        run.ok = False
        run.message = _compact_error_message(e)
    finally:
        run.finished_at = _utcnow()
        try:
            db.commit()
        except Exception:
            db.rollback()
        _FULL_SYNC_LOCK.release()
    return run


def _purge_employee_range(db: Session, employee_mis_id: str, start: datetime, end: datetime) -> None:
    db.execute(
        delete(ScheduleSlot).where(
            and_(
                ScheduleSlot.employee_mis_id == employee_mis_id,
                ScheduleSlot.slot_start >= start,
                ScheduleSlot.slot_start < end,
            ),
        )
    )
    db.execute(
        delete(OccupiedSlot).where(
            and_(
                OccupiedSlot.employee_mis_id == employee_mis_id,
                OccupiedSlot.slot_start >= start,
                OccupiedSlot.slot_start < end,
            ),
        )
    )
    db.commit()


async def run_quick_sync_for_employee(db: Session, employee_mis_id: str) -> None:
    start, end = _range()
    client = MisClient()
    _purge_employee_range(db, employee_mis_id, start, end)
    try:
        data = await client.get_schedule20(
            employee_mis_id,
            start,
            end,
            clinic_id=_target_clinic_id(),
        )
        items = _filter_rows_by_target_clinic(find_schedule_items(data))
        _ingest_schedule_rows(db, items, default_employee_id=employee_mis_id)
        _ingest_busy_from_schedule_rows(db, items, default_employee_id=employee_mis_id)
    except Exception as e:
        logger.warning("quick sync schedule20: %s", e)
    try:
        data = await client.patient_tickets(start, end, employee_id=employee_mis_id)
        rows = find_ticket_items(data)
        for row in rows:
            s, e = slot_bounds(row)
            if s is None:
                continue
            if e is None:
                e = s + timedelta(minutes=settings.slot_step_minutes)
            occ = OccupiedSlot(
                employee_mis_id=parse_employee_id(row) or employee_mis_id,
                slot_start=s,
                slot_end=e,
                appointment_guid=str(row.get("GUID") or "").strip() or None,
                patient_label=None,
                service_mis_id=None,
                source="tickets",
                updated_at=_utcnow(),
            )
            db.add(occ)
        db.commit()
    except Exception as e:
        logger.warning("quick sync tickets: %s", e)
