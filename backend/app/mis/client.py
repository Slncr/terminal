from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.config import settings
from app.mis.parsers import appointment_guid_from_response, appointment_success, safe_json_dumps

logger = logging.getLogger(__name__)
MIS_TZ = ZoneInfo("Europe/Moscow")


def _base_auth_body() -> dict[str, Any]:
    user = settings.mis_user.strip()
    password = settings.mis_password.strip()
    api_key = settings.mis_api_key.strip()
    body: dict[str, Any] = {"User": user, "Password": password}
    if api_key:
        body["Key"] = api_key
    return body


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    api_key = settings.mis_api_key.strip()
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def _auth() -> httpx.BasicAuth | None:
    user = settings.mis_user.strip()
    password = settings.mis_password.strip()
    if user and password:
        return httpx.BasicAuth(user, password)
    return None


def format_mis_period(start: datetime, end: datetime) -> tuple[str, str]:
    def fmt(dt: datetime) -> str:
        if dt.tzinfo:
            dt = dt.astimezone(MIS_TZ).replace(tzinfo=None)
        return dt.strftime("%d.%m.%Y %H:%M:%S")

    return fmt(start), fmt(end)


def format_appointment_date(d: datetime) -> str:
    if d.tzinfo:
        d = d.astimezone(MIS_TZ).replace(tzinfo=None)
    return d.strftime("%d.%m.%Y")


def format_time_begin(d: datetime) -> str:
    if d.tzinfo:
        d = d.astimezone(MIS_TZ).replace(tzinfo=None)
    return d.strftime("%Y%m%dT%H:%M:%S")


class MisClient:
    def __init__(self, timeout: float = 60.0) -> None:
        self._timeout = timeout

    @staticmethod
    def _schedule_urls() -> list[str]:
        base = settings.mis_base_url.rstrip("/")
        return [f"{base}/hs/bwi/Schedule", f"{base}/hs/bwi/GetShedule20"]

    @staticmethod
    def _dictionary_urls() -> list[str]:
        base = settings.mis_base_url.rstrip("/")
        primary = settings.mis_dictionary_url()
        # Some contours expose the same handler under alternate names.
        candidates = [primary, f"{base}/hs/bwi/ClinicData", f"{base}/hs/bwi/DictionaryData"]
        out: list[str] = []
        seen: set[str] = set()
        for u in candidates:
            if u not in seen:
                seen.add(u)
                out.append(u)
        return out

    @staticmethod
    def _normalize_payload(data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            raw = data.get("data")
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        return parsed
                except Exception:
                    pass
            return data
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                raw = first.get("data")
                if isinstance(raw, str):
                    try:
                        parsed = json.loads(raw)
                        if isinstance(parsed, dict):
                            return parsed
                    except Exception:
                        pass
                return first
        return {}

    async def _post_first_ok(self, urls: list[str], body: dict[str, Any]) -> dict[str, Any]:
        last_err: str | None = None
        method_name = str(body.get("Method") or "").strip()
        async with httpx.AsyncClient(timeout=self._timeout, verify=settings.mis_verify_tls) as client:
            for url in urls:
                try:
                    payload = {**_base_auth_body(), **body}
                    if method_name:
                        logger.info("MIS POST %s method=%s", url, method_name)
                    r = await client.post(url, json=payload, headers=_headers(), auth=_auth())
                    r.raise_for_status()
                    data = self._normalize_payload(r.json())
                    if data:
                        return data
                    last_err = "non-dict json"
                except Exception as e:
                    last_err = str(e)
                    logger.warning("MIS POST failed %s: %s", url, e)
        raise RuntimeError(last_err or "MIS request failed")

    async def get_enlargement_schedule(self, start: datetime, end: datetime) -> dict[str, Any]:
        sd, fd = format_mis_period(start, end)
        body = {
            "Method": "GetEnlargementSchedule",
            "StartDate": sd,
            "FinishDate": fd,
            "Format": "JSON",
        }
        return await self._post_first_ok(self._schedule_urls(), body)

    async def get_schedule20(
        self,
        employee_id: str,
        start: datetime,
        end: datetime,
        clinic_id: str | None = None,
    ) -> dict[str, Any]:
        sd, fd = format_mis_period(start, end)
        body = {
            "Method": "GetSchedule20",
            "Employees": employee_id,
            "StartDate": sd,
            "FinishDate": fd,
            "Format": "JSON",
            "OnlyFreeTime": False,
        }
        cid = (clinic_id or "").strip()
        if cid:
            body["Clinic"] = cid
            body["Сlinic"] = cid
        return await self._post_first_ok(self._schedule_urls(), body)

    async def list_employees(self) -> dict[str, Any]:
        body = {
            "Method": "GetListEmployees",
            "MainOnly": settings.mis_main_only,
        }
        return await self._post_first_ok(self._dictionary_urls(), body)

    async def list_employees_with_services(self) -> dict[str, Any]:
        # MainOnly=false is required in this contour to receive "ОсновныеУслуги".
        body = {
            "Method": "GetListEmployees",
            "MainOnly": False,
            "Photo": False,
        }
        return await self._post_first_ok(self._dictionary_urls(), body)

    async def patient_tickets(
        self,
        start: datetime,
        end: datetime,
        employee_id: str | None = None,
    ) -> dict[str, Any]:
        url = settings.mis_tickets_url()
        methods = ["PatientTickets", "GetPatientTickets", "GetPatientsTickets"]
        sd, fd = format_mis_period(start, end)
        last: Exception | None = None
        for method in methods:
            body = {**_base_auth_body(), "Method": method, "StartDate": sd, "FinishDate": fd}
            if employee_id:
                body["Employee"] = employee_id
            try:
                return await self._post_first_ok([url], body)
            except Exception as e:
                last = e
        raise last or RuntimeError("patient_tickets failed")

    async def get_nomenclature_and_prices(self, clinic_guid: str) -> dict[str, Any]:
        body = {
            "Method": "GetNomenclatureAndPrices",
            "GUID": clinic_guid,
            "Params": "",
        }
        return await self._post_first_ok(self._dictionary_urls(), body)

    async def create_appointment(self, payload: dict[str, Any]) -> dict[str, Any]:
        base = settings.mis_base_url.rstrip("/")
        urls = [f"{base}/hs/bwi/AppointmentCreate", f"{base}/hs/bwi/BookAnAppointmentWithParams"]
        body = {**_base_auth_body(), **payload}
        return await self._post_first_ok(urls, body)

    async def cancel_appointment(self, guid: str, reason: str = "Пациент отказался") -> dict[str, Any]:
        base = settings.mis_base_url.rstrip("/")
        url = f"{base}/hs/bwi/AppointmentCancel"
        body = {
            **_base_auth_body(),
            "Method": "CancelBookAnAppointment",
            "GUID": guid,
            "Reason": reason,
            "AdditionalInformation": "",
        }
        return await self._post_first_ok([url], body)

    @staticmethod
    def build_book_payload(
        employee_id: str,
        slot_start: datetime,
        patient_surname: str,
        patient_name: str,
        patient_patronymic: str | None,
        birthday: str,
        phone: str,
        clinic_id: str | None,
        service_id: str | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "Method": "BookAnAppointmentWithParams",
            "EmployeeID": employee_id,
            "Employee": employee_id,
            "PatientSurname": patient_surname,
            "PatientName": patient_name,
            "PatientFatherName": patient_patronymic or "",
            "Birthday": birthday,
            "Date": format_appointment_date(slot_start),
            "TimeBegin": format_time_begin(slot_start),
            "Phone": phone,
        }
        if clinic_id:
            payload["Clinic"] = clinic_id
        if service_id:
            payload["Service"] = service_id
        return payload

    @staticmethod
    def parse_create_result(data: dict[str, Any]) -> tuple[bool, str | None, str]:
        guid = appointment_guid_from_response(data)
        ok = appointment_success(data) or bool(guid)
        return ok, guid, safe_json_dumps(data)
