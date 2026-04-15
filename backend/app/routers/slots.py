from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, OccupiedSlot, ScheduleSlot, Service, TerminalAppointment
from app.schemas import DaySlotOut, FreeSlotOut

router = APIRouter()


def _day_bounds(day: datetime) -> tuple[datetime, datetime]:
    if day.tzinfo is None:
        day = day.replace(tzinfo=timezone.utc)
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


def _overlaps(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> bool:
    return a0 < b1 and b0 < a1


@router.get("/{employee_mis_id}/free", response_model=list[FreeSlotOut])
def free_slots_for_doctor(
    employee_mis_id: str,
    day: datetime = Query(..., description="ISO date-time (any time on that day)"),
    db: Session = Depends(get_db),
) -> list[FreeSlotOut]:
    emp = db.get(Employee, employee_mis_id)
    if emp is None:
        raise HTTPException(status_code=404, detail="Врач не найден")
    day_start, day_end = _day_bounds(day)

    schedules = db.scalars(
        select(ScheduleSlot).where(
            ScheduleSlot.employee_mis_id == employee_mis_id,
            ScheduleSlot.slot_start >= day_start,
            ScheduleSlot.slot_start < day_end,
        )
    ).all()

    occupied = db.scalars(
        select(OccupiedSlot).where(
            OccupiedSlot.employee_mis_id == employee_mis_id,
            OccupiedSlot.slot_start < day_end,
            OccupiedSlot.slot_end > day_start,
        )
    ).all()

    terminal = db.scalars(
        select(TerminalAppointment).where(
            TerminalAppointment.employee_mis_id == employee_mis_id,
            TerminalAppointment.status.in_(("pending", "confirmed", "created", "success")),
            TerminalAppointment.slot_start < day_end,
            or_(
                TerminalAppointment.slot_end.is_(None),
                TerminalAppointment.slot_end > day_start,
            ),
        )
    ).all()

    free: list[FreeSlotOut] = []
    for s in schedules:
        end = s.slot_end
        blocked = False
        for o in occupied:
            if _overlaps(s.slot_start, end, o.slot_start, o.slot_end):
                blocked = True
                break
        if blocked:
            continue
        for t in terminal:
            te = t.slot_end or (t.slot_start + timedelta(minutes=30))
            if _overlaps(s.slot_start, end, t.slot_start, te):
                blocked = True
                break
        if not blocked:
            free.append(
                FreeSlotOut(
                    start=s.slot_start,
                    end=end,
                    clinic_mis_id=s.clinic_mis_id,
                )
            )
    free.sort(key=lambda x: x.start)
    return free


@router.get("/{employee_mis_id}/day", response_model=list[DaySlotOut])
def day_slots_for_doctor(
    employee_mis_id: str,
    day: datetime = Query(..., description="ISO date-time (any time on that day)"),
    db: Session = Depends(get_db),
) -> list[DaySlotOut]:
    emp = db.get(Employee, employee_mis_id)
    if emp is None:
        raise HTTPException(status_code=404, detail="Врач не найден")
    day_start, day_end = _day_bounds(day)

    schedules = db.scalars(
        select(ScheduleSlot).where(
            ScheduleSlot.employee_mis_id == employee_mis_id,
            ScheduleSlot.slot_start >= day_start,
            ScheduleSlot.slot_start < day_end,
        )
    ).all()

    occupied = db.scalars(
        select(OccupiedSlot).where(
            OccupiedSlot.employee_mis_id == employee_mis_id,
            OccupiedSlot.slot_start < day_end,
            OccupiedSlot.slot_end > day_start,
        )
    ).all()
    service_ids = {o.service_mis_id for o in occupied if o.service_mis_id}
    service_map: dict[str, str] = {}
    if service_ids:
        for s in db.scalars(select(Service).where(Service.mis_id.in_(service_ids))).all():
            service_map[s.mis_id] = s.name or s.mis_id

    terminal = db.scalars(
        select(TerminalAppointment).where(
            TerminalAppointment.employee_mis_id == employee_mis_id,
            TerminalAppointment.status.in_(("pending", "confirmed", "created", "success")),
            TerminalAppointment.slot_start < day_end,
            or_(
                TerminalAppointment.slot_end.is_(None),
                TerminalAppointment.slot_end > day_start,
            ),
        )
    ).all()

    out: list[DaySlotOut] = []
    for s in schedules:
        end = s.slot_end
        busy_service_id: str | None = None
        busy = False
        for o in occupied:
            if _overlaps(s.slot_start, end, o.slot_start, o.slot_end):
                busy = True
                busy_service_id = o.service_mis_id
                break
        if not busy:
            for t in terminal:
                te = t.slot_end or (t.slot_start + timedelta(minutes=30))
                if _overlaps(s.slot_start, end, t.slot_start, te):
                    busy = True
                    break
        out.append(
            DaySlotOut(
                start=s.slot_start,
                end=end,
                clinic_mis_id=s.clinic_mis_id,
                status="busy" if busy else "free",
                service_mis_id=busy_service_id,
                service_name=service_map.get(busy_service_id) if busy_service_id else None,
            )
        )
    out.sort(key=lambda x: x.start)
    return out
