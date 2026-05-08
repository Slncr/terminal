import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.mis.client import MisClient
from app.mis.parsers import find_clinic_list
from app.models import Employee, EmployeeService, ScheduleSlot, Service
from app.schemas import BranchOut, EmployeeOut, ServiceOut

router = APIRouter()
_EXCLUDED_CLINIC_TITLES = {"евродон чалтырь 2", "евродон суворовский", "чалтырь 2", "суворовский"}
_EXCLUDED_CLINIC_IDS = {"38540652-401d-11ee-8302-3a1bcc6c939a"}


def _split_clinic_tokens(raw: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for token in (raw or "").replace(",", ";").split(";"):
        s = token.strip()
        if not s:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _extract_employee_clinic_ids_from_raw(raw_json: str | None) -> set[str]:
    if not raw_json:
        return set()
    try:
        row = json.loads(raw_json)
    except Exception:
        return set()
    if not isinstance(row, dict):
        return set()

    clinic = row.get("Клиника") or row.get("Clinic") or row.get("clinic") or row.get("Филиал")
    out: set[str] = set()
    if isinstance(clinic, dict):
        cid = clinic.get("УИД") or clinic.get("UID") or clinic.get("GUID")
        if cid:
            out.add(str(cid).strip())
        return {x for x in out if x}
    if isinstance(clinic, list):
        for item in clinic:
            if isinstance(item, dict):
                cid = item.get("УИД") or item.get("UID") or item.get("GUID")
                if cid:
                    out.add(str(cid).strip())
            elif isinstance(item, str):
                out.update(_split_clinic_tokens(item))
        return {x for x in out if x}
    if isinstance(clinic, str):
        out.update(_split_clinic_tokens(clinic))
    return {x for x in out if x}


def _employee_ids_for_clinic(db: Session, clinic_id: str) -> set[str]:
    cid = clinic_id.strip()
    if not cid:
        return set()
    from_schedule = {
        str(x).strip()
        for x in db.scalars(
            select(ScheduleSlot.employee_mis_id)
            .where(
                ScheduleSlot.clinic_mis_id == cid,
                ScheduleSlot.employee_mis_id.is_not(None),
            )
            .distinct()
        ).all()
        if str(x or "").strip()
    }
    from_services = {
        str(x).strip()
        for x in db.scalars(
            select(EmployeeService.employee_mis_id)
            .join(Service, Service.mis_id == EmployeeService.service_mis_id)
            .where(
                Service.clinic_id == cid,
                EmployeeService.employee_mis_id.is_not(None),
            )
            .distinct()
        ).all()
        if str(x or "").strip()
    }
    from_employees_raw: set[str] = set()
    for emp in db.scalars(select(Employee)).all():
        clinic_ids = {x.lower() for x in _extract_employee_clinic_ids_from_raw(emp.raw_json)}
        if cid.lower() in clinic_ids:
            from_employees_raw.add(emp.mis_id)
    return from_schedule | from_services | from_employees_raw


def _clinics_with_doctors(db: Session) -> set[str]:
    schedule_clinics = {
        str(x).strip()
        for x in db.scalars(
            select(ScheduleSlot.clinic_mis_id).where(ScheduleSlot.clinic_mis_id.is_not(None)).distinct()
        ).all()
        if str(x or "").strip()
    }
    service_clinics = {
        str(x).strip()
        for x in db.scalars(
            select(Service.clinic_id)
            .join(EmployeeService, EmployeeService.service_mis_id == Service.mis_id)
            .where(Service.clinic_id.is_not(None))
            .distinct()
        ).all()
        if str(x or "").strip()
    }
    employee_clinics: set[str] = set()
    for raw in db.scalars(select(Employee.raw_json)).all():
        employee_clinics.update(_extract_employee_clinic_ids_from_raw(raw))
    return schedule_clinics | service_clinics | employee_clinics


@router.get("", response_model=list[EmployeeOut])
def list_doctors(
    clinic_mis_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Employee]:
    cid = (clinic_mis_id or "").strip()
    q = select(Employee)
    if cid:
        ids = _employee_ids_for_clinic(db, cid)
        if not ids:
            return []
        q = q.where(Employee.mis_id.in_(ids))
    return list(db.scalars(q.order_by(Employee.surname, Employee.name)).all())


@router.get("/branches", response_model=list[BranchOut])
async def list_branches(db: Session = Depends(get_db)) -> list[BranchOut]:
    out: list[BranchOut] = []
    seen: set[str] = set()
    active_clinics = {x.lower() for x in _clinics_with_doctors(db)}
    try:
        data = await MisClient().list_clinics()
        for row in find_clinic_list(data):
            hidden = bool(row.get("НеВыгружатьНаСайте"))
            deleted = bool(row.get("ПометкаУдаления"))
            if hidden or deleted:
                continue
            cid = str(row.get("УИД") or row.get("UID") or row.get("GUID") or "").strip()
            if not cid:
                continue
            low_id = cid.lower()
            if low_id in _EXCLUDED_CLINIC_IDS:
                continue
            if active_clinics and low_id not in active_clinics:
                continue
            title = str(row.get("Наименование") or row.get("Name") or "").strip() or cid
            if title.lower() in _EXCLUDED_CLINIC_TITLES:
                continue
            if low_id in seen:
                continue
            seen.add(low_id)
            out.append(BranchOut(mis_id=cid, title=title))
    except Exception:
        out = []

    if out:
        return sorted(out, key=lambda x: x.title.lower())

    # Fallback from local schedule slots when MIS dictionary endpoint is unavailable.
    ids = [
        str(x).strip()
        for x in _clinics_with_doctors(db)
        if str(x or "").strip()
    ]
    fallback = []
    for cid in ids:
        if cid.lower() in _EXCLUDED_CLINIC_IDS:
            continue
        fallback.append(BranchOut(mis_id=cid, title=cid))
    return sorted(fallback, key=lambda x: x.title.lower())


@router.get("/services", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)) -> list[Service]:
    return list(db.scalars(select(Service).order_by(Service.name)).all())


@router.get("/{employee_mis_id}/services", response_model=list[ServiceOut])
def list_services_for_doctor(employee_mis_id: str, db: Session = Depends(get_db)) -> list[Service]:
    service_ids = db.scalars(
        select(EmployeeService.service_mis_id)
        .where(
            EmployeeService.employee_mis_id == employee_mis_id,
            EmployeeService.service_mis_id.is_not(None),
        )
        .distinct()
    ).all()
    ids = [x for x in service_ids if x]
    if not ids:
        return []
    return list(db.scalars(select(Service).where(Service.mis_id.in_(ids)).order_by(Service.name)).all())


@router.get("/{employee_mis_id}/branches", response_model=list[BranchOut])
async def list_branches_for_doctor(employee_mis_id: str, db: Session = Depends(get_db)) -> list[BranchOut]:
    schedule_clinic_ids = [
        str(x).strip()
        for x in db.scalars(
            select(ScheduleSlot.clinic_mis_id)
            .where(
                ScheduleSlot.employee_mis_id == employee_mis_id,
                ScheduleSlot.clinic_mis_id.is_not(None),
            )
            .distinct()
        ).all()
        if str(x or "").strip()
    ]
    service_clinic_ids = [
        str(x).strip()
        for x in db.scalars(
            select(Service.clinic_id)
            .join(EmployeeService, EmployeeService.service_mis_id == Service.mis_id)
            .where(
                EmployeeService.employee_mis_id == employee_mis_id,
                Service.clinic_id.is_not(None),
            )
            .distinct()
        ).all()
        if str(x or "").strip()
    ]
    raw_clinic_ids: list[str] = []
    emp = db.get(Employee, employee_mis_id)
    if emp is not None:
        raw_clinic_ids = sorted(_extract_employee_clinic_ids_from_raw(emp.raw_json))
    clinic_ids = sorted(set(schedule_clinic_ids) | set(service_clinic_ids) | set(raw_clinic_ids))
    if not clinic_ids:
        return []

    name_by_id: dict[str, str] = {}
    try:
        data = await MisClient().list_clinics()
        for row in find_clinic_list(data):
            hidden = bool(row.get("НеВыгружатьНаСайте"))
            deleted = bool(row.get("ПометкаУдаления"))
            if hidden or deleted:
                continue
            cid = str(row.get("УИД") or row.get("UID") or row.get("GUID") or "").strip()
            if not cid:
                continue
            title = str(row.get("Наименование") or row.get("Name") or "").strip() or cid
            if cid.lower() in _EXCLUDED_CLINIC_IDS or title.lower() in _EXCLUDED_CLINIC_TITLES:
                continue
            name_by_id[cid.lower()] = title
    except Exception:
        name_by_id = {}

    out: list[BranchOut] = []
    for cid in clinic_ids:
        if cid.lower() in _EXCLUDED_CLINIC_IDS:
            continue
        title = name_by_id.get(cid.lower(), cid)
        if title.lower() in _EXCLUDED_CLINIC_TITLES:
            continue
        out.append(BranchOut(mis_id=cid, title=title))
    return sorted(out, key=lambda x: x.title.lower())
