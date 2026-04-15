import logging
from datetime import timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.mis.client import MisClient
from app.models import TerminalAppointment
from app.schemas import AppointmentCreate, AppointmentOut
from app.services.sync import run_quick_sync_for_employee

logger = logging.getLogger(__name__)
router = APIRouter()


def _slot_end(start, body_end):
    if body_end:
        return body_end
    return start + timedelta(minutes=30)


async def _post_book_and_sync(db: Session, ta_id: str) -> None:
    ta = db.get(TerminalAppointment, UUID(ta_id))
    if ta is None:
        return
    client = MisClient()
    payload = MisClient.build_book_payload(
        employee_id=ta.employee_mis_id,
        slot_start=ta.slot_start,
        patient_surname=ta.patient_surname,
        patient_name=ta.patient_name,
        patient_patronymic=ta.patient_patronymic,
        birthday=ta.birthday,
        phone=ta.phone,
        clinic_id=ta.clinic_mis_id,
        service_id=ta.service_mis_id,
    )
    try:
        data = await client.create_appointment(payload)
        ok, guid, raw = MisClient.parse_create_result(data)
        ta.mis_response = raw
        if ok:
            ta.mis_guid = guid
            ta.status = "success"
        else:
            ta.status = "mis_error"
    except Exception as e:
        logger.exception("MIS create appointment")
        ta.status = "error"
        ta.mis_response = str(e)
    db.commit()
    await run_quick_sync_for_employee(db, ta.employee_mis_id)


async def _background_book(ta_id: str) -> None:
    db = SessionLocal()
    try:
        await _post_book_and_sync(db, ta_id)
    finally:
        db.close()


@router.post("", response_model=AppointmentOut)
async def create_appointment(
    body: AppointmentCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> TerminalAppointment:
    if body.slot_start.tzinfo is None:
        slot_start = body.slot_start.replace(tzinfo=timezone.utc)
    else:
        slot_start = body.slot_start
    slot_end = _slot_end(slot_start, body.slot_end)

    ta = TerminalAppointment(
        employee_mis_id=body.employee_mis_id,
        clinic_mis_id=body.clinic_mis_id,
        service_mis_id=body.service_mis_id,
        slot_start=slot_start,
        slot_end=slot_end,
        patient_surname=body.patient_surname.strip(),
        patient_name=body.patient_name.strip(),
        patient_patronymic=(body.patient_patronymic or "").strip() or None,
        birthday=body.birthday.strip(),
        phone=body.phone.strip(),
        status="pending",
    )
    db.add(ta)
    db.commit()
    db.refresh(ta)

    background.add_task(_background_book, str(ta.id))
    return ta


@router.get("/{appointment_id}", response_model=AppointmentOut)
def get_appointment(appointment_id: str, db: Session = Depends(get_db)) -> TerminalAppointment:
    try:
        uid = UUID(appointment_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор") from e
    ta = db.get(TerminalAppointment, uid)
    if ta is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return ta
