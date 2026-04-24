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


class HomeTile(Base):
    __tablename__ = "home_tiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(128))
    tile_type: Mapped[str] = mapped_column(String(32), index=True)
    size: Mapped[str] = mapped_column(String(32), default="small")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    specialty_filters: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_fit: Mapped[str] = mapped_column(String(16), default="cover")
    image_x: Mapped[int] = mapped_column(Integer, default=0)
    image_y: Mapped[int] = mapped_column(Integer, default=0)
    image_scale: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ConsumerDocument(Base):
    __tablename__ = "consumer_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    file_url: Mapped[str] = mapped_column(String(512))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class PromoBanner(Base):
    __tablename__ = "promo_banners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    image_url: Mapped[str] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    card_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    card_image_fit: Mapped[str] = mapped_column(String(16), default="cover")
    card_image_x: Mapped[int] = mapped_column(Integer, default=0)
    card_image_y: Mapped[int] = mapped_column(Integer, default=0)
    card_image_scale: Mapped[int] = mapped_column(Integer, default=100)
    list_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    list_image_fit: Mapped[str] = mapped_column(String(16), default="cover")
    list_image_x: Mapped[int] = mapped_column(Integer, default=0)
    list_image_y: Mapped[int] = mapped_column(Integer, default=0)
    list_image_scale: Mapped[int] = mapped_column(Integer, default=100)
    target_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class DoctorMedia(Base):
    __tablename__ = "doctor_media"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_mis_id: Mapped[str] = mapped_column(String(64), ForeignKey("employees.mis_id"), index=True)
    photo_url: Mapped[str] = mapped_column(String(512))
    experience_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    badge1_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    badge2_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    badge3_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    show_in_sections: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class CheckupItem(Base):
    __tablename__ = "checkup_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    group_title: Mapped[str] = mapped_column(String(128), default="Общий", index=True)
    price_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    list_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_fit: Mapped[str] = mapped_column(String(16), default="cover")
    image_x: Mapped[int] = mapped_column(Integer, default=0)
    image_y: Mapped[int] = mapped_column(Integer, default=0)
    image_scale: Mapped[int] = mapped_column(Integer, default=100)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    included_left: Mapped[str | None] = mapped_column(Text, nullable=True)
    included_right: Mapped[str | None] = mapped_column(Text, nullable=True)
    post_info_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cta_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    registry_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class CheckupGroupTile(Base):
    __tablename__ = "checkup_group_tiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_fit: Mapped[str] = mapped_column(String(16), default="cover")
    image_x: Mapped[int] = mapped_column(Integer, default=0)
    image_y: Mapped[int] = mapped_column(Integer, default=0)
    image_scale: Mapped[int] = mapped_column(Integer, default=100)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
