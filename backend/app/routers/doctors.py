from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, EmployeeService, Service
from app.schemas import EmployeeOut, ServiceOut

router = APIRouter()


@router.get("", response_model=list[EmployeeOut])
def list_doctors(db: Session = Depends(get_db)) -> list[Employee]:
    return list(db.scalars(select(Employee).order_by(Employee.surname, Employee.name)).all())


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
