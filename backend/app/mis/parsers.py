from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from dateutil import parser as date_parser

MIS_TZ = ZoneInfo("Europe/Moscow")


def _unwrap_response(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    for key in ("Ответ", "Answer", "answer", "result", "Result"):
        if key in data and isinstance(data[key], dict):
            return data[key]
    return data


def find_employee_list(data: Any) -> list[dict[str, Any]]:
    root = data if isinstance(data, dict) else {}
    inner = _unwrap_response(root)
    for container in (inner, root):
        for key in ("Сотрудник", "Employees", "employees", "Сотрудники"):
            val = container.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
            if isinstance(val, dict):
                return [val]
    for key in ("Ответы", "Responses"):
        val = root.get(key) or inner.get(key)
        if isinstance(val, list):
            out: list[dict[str, Any]] = []
            for item in val:
                if isinstance(item, dict):
                    out.extend(find_employee_list(item))
            if out:
                return out
    return []


def find_schedule_items(data: Any) -> list[dict[str, Any]]:
    root = data if isinstance(data, dict) else {}
    inner = _unwrap_response(root)
    for container in (inner, root):
        for key in (
            "ГрафикДляСайта",
            "График",
            "Schedule",
            "schedule",
            "Слоты",
            "Slots",
            "Расписание",
        ):
            val = container.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
            if isinstance(val, dict):
                return [val]
    if isinstance(root.get("Items"), list):
        return [x for x in root["Items"] if isinstance(x, dict)]
    return []


def find_ticket_items(data: Any) -> list[dict[str, Any]]:
    root = data if isinstance(data, dict) else {}
    inner = _unwrap_response(root)
    for container in (inner, root):
        for key in ("Талоны", "Tickets", "tickets", "Записи", "Records"):
            val = container.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
            if isinstance(val, dict):
                return [val]
        for key in ("Ответ", "Ответы", "Result", "result", "data"):
            val = container.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
            if isinstance(val, dict):
                return [val]
    return find_schedule_items(data)


def find_clinic_list(data: Any) -> list[dict[str, Any]]:
    root = data if isinstance(data, dict) else {}
    inner = _unwrap_response(root)
    for container in (inner, root):
        for key in ("Клиника", "Клиники", "Clinics", "Clinic"):
            val = container.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
            if isinstance(val, dict):
                return [val]
    return []


def _get_first(d: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def parse_employee_id(row: dict[str, Any]) -> str | None:
    raw = _get_first(
        row,
        (
            "СотрудникID",
            "EmployeeID",
            "Employee",
            "employee",
            "Сотрудник",
            "УИД",
            "UID",
            "GUID",
            "Ref",
            "Ссылка",
        ),
    )
    if raw is None:
        return None
    if isinstance(raw, dict):
        for key in ("УИД", "UID", "GUID", "Ref", "Ссылка"):
            v = raw.get(key)
            if v:
                return str(v).strip() or None
        return None
    return str(raw).strip() or None


def parse_datetime_any(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=MIS_TZ)
    s = str(val).strip()
    if not s:
        return None
    for fmt in (
        "%d.%m.%Y %H:%M:%S",
        "%d.%m.%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y%m%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(s[:19] if len(s) >= 19 else s, fmt[: len(s)])
            return dt.replace(tzinfo=MIS_TZ)
        except ValueError:
            continue
    try:
        dt = date_parser.parse(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=MIS_TZ)
        return dt
    except (ValueError, TypeError, OverflowError):
        return None


def slot_bounds(row: dict[str, Any]) -> tuple[datetime | None, datetime | None]:
    start = _get_first(
        row,
        (
            "Начало",
            "Start",
            "start",
            "ДатаВремяНачала",
            "TimeBegin",
            "ВремяНачала",
            "SlotStart",
            "DateBegin",
            "ДатаНачала",
            "DateStart",
        ),
    )
    end = _get_first(
        row,
        (
            "Окончание",
            "Finish",
            "End",
            "end",
            "ДатаВремяОкончания",
            "TimeEnd",
            "ВремяОкончания",
            "SlotEnd",
            "DateEnd",
            "ДатаОкончания",
            "DateFinish",
        ),
    )
    ds = parse_datetime_any(start)
    de = parse_datetime_any(end)
    # 1C may send "time-only" values as year 0001; combine with "Дата" instead.
    if ds is not None and ds.year <= 1901:
        base_date = _get_first(row, ("Дата", "Date", "Day"))
        d = parse_datetime_any(base_date)
        if d is not None:
            ds = d.replace(hour=ds.hour, minute=ds.minute, second=ds.second, microsecond=0)
            if de is not None and de.year <= 1901:
                de = d.replace(hour=de.hour, minute=de.minute, second=de.second, microsecond=0)
    if ds is not None:
        return ds, de

    base_date = _get_first(row, ("Дата", "Date", "Day"))
    d = parse_datetime_any(base_date)
    if d is not None:
        ts = parse_datetime_any(_get_first(row, ("ВремяНачала", "TimeBegin")))
        te = parse_datetime_any(_get_first(row, ("ВремяОкончания", "TimeEnd")))
        if ts is not None:
            ds = d.replace(hour=ts.hour, minute=ts.minute, second=ts.second, microsecond=0)
        if te is not None:
            de = d.replace(hour=te.hour, minute=te.minute, second=te.second, microsecond=0)
        if ds is not None:
            return ds, de
    return None, None


def employee_names(row: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    surname = _get_first(row, ("Фамилия", "Surname", "PatientSurname", "фамилия"))
    name = _get_first(row, ("Имя", "Name", "PatientName", "имя"))
    pat = _get_first(row, ("Отчество", "Patronymic", "FatherName", "PatientFatherName", "отчество"))
    if not surname and not name:
        fio = _get_first(row, ("ФИО", "FIO", "Пациент", "Patient"))
        if fio and isinstance(fio, str):
            parts = fio.split()
            if len(parts) >= 3:
                return parts[0], parts[1], " ".join(parts[2:])
            if len(parts) == 2:
                return parts[0], parts[1], None
            if len(parts) == 1:
                return parts[0], None, None
    return (
        str(surname).strip() if surname else None,
        str(name).strip() if name else None,
        str(pat).strip() if pat else None,
    )


def appointment_guid_from_response(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for key in ("УИД", "UID", "GUID", "Guid", "guid"):
        v = data.get(key)
        if v:
            return str(v).strip()
    inner = _unwrap_response(data)
    for key in ("УИД", "UID", "GUID"):
        v = inner.get(key)
        if v:
            return str(v).strip()
    return None


def appointment_success(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    for key in ("Результат", "Result", "result", "Success", "success"):
        v = data.get(key)
        if isinstance(v, bool):
            return v
    inner = _unwrap_response(data)
    for key in ("Результат", "Result"):
        v = inner.get(key)
        if isinstance(v, bool):
            return v
    return appointment_guid_from_response(data) is not None


def safe_json_dumps(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False, default=str)
    except TypeError:
        return "{}"


_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)


def extract_guids(text: str) -> list[str]:
    return _UUID_RE.findall(text or "")
