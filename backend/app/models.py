import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Employee(Base):
    __tablename__ = "employees"

    mis_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    surname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    patronymic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    specialty: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_main: Mapped[bool] = mapped_column(Boolean, default=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    schedule_slots: Mapped[list["ScheduleSlot"]] = relationship(back_populates="employee")


class Service(Base):
    __tablename__ = "services"

    mis_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class EmployeeService(Base):
    __tablename__ = "employee_services"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_mis_id: Mapped[str] = mapped_column(String(64), ForeignKey("employees.mis_id"), index=True)
    service_mis_id: Mapped[str] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(32), default="employees")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_mis_id", "service_mis_id", name="uq_employee_service"),
    )


class NomenclatureItem(Base):
    __tablename__ = "nomenclature_items"

    mis_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ScheduleSlot(Base):
    __tablename__ = "schedule_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_mis_id: Mapped[str] = mapped_column(String(64), ForeignKey("employees.mis_id"), index=True)
    slot_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    slot_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    clinic_mis_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(32), default="mis")

    employee: Mapped["Employee"] = relationship(back_populates="schedule_slots")

    __table_args__ = (
        UniqueConstraint("employee_mis_id", "slot_start", "slot_end", name="uq_schedule_slot"),
    )


class OccupiedSlot(Base):
    __tablename__ = "occupied_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_mis_id: Mapped[str] = mapped_column(String(64), ForeignKey("employees.mis_id"), index=True)
    slot_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    slot_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    appointment_guid: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    patient_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_mis_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="tickets")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class TerminalAppointment(Base):
    __tablename__ = "terminal_appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mis_guid: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    employee_mis_id: Mapped[str] = mapped_column(String(64), index=True)
    clinic_mis_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    service_mis_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    slot_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    slot_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    patient_surname: Mapped[str] = mapped_column(String(255))
    patient_name: Mapped[str] = mapped_column(String(255))
    patient_patronymic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    birthday: Mapped[str] = mapped_column(String(32))
    phone: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    mis_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean, default=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)


class SyncState(Base):
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    full_sync_done: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
