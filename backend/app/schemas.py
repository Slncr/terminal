from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mis_id: str
    surname: str | None
    name: str | None
    patronymic: str | None
    phone: str | None
    specialty: str | None

    @computed_field
    def full_name(self) -> str:
        parts = [self.surname or "", self.name or "", self.patronymic or ""]
        return " ".join(p for p in parts if p).strip() or self.mis_id


class FreeSlotOut(BaseModel):
    start: datetime
    end: datetime
    clinic_mis_id: str | None = None


class DaySlotOut(BaseModel):
    start: datetime
    end: datetime
    clinic_mis_id: str | None = None
    status: str
    service_mis_id: str | None = None
    service_name: str | None = None


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mis_id: str
    name: str | None
    price: int | None
    clinic_id: str | None


class AppointmentCreate(BaseModel):
    employee_mis_id: str
    slot_start: datetime
    slot_end: datetime | None = None
    clinic_mis_id: str | None = None
    service_mis_id: str | None = None
    patient_surname: str = Field(..., min_length=1, max_length=255)
    patient_name: str = Field(..., min_length=1, max_length=255)
    patient_patronymic: str | None = Field(None, max_length=255)
    birthday: str = Field(..., description="YYYY-MM-DD")
    phone: str = Field(..., min_length=10, max_length=32)


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    mis_guid: str | None
    status: str
    slot_start: datetime
    employee_mis_id: str


class SyncStatusOut(BaseModel):
    last_sync_at: datetime | None
    last_ok: bool | None
    full_sync_done: bool | None
    message: str | None


class HomeTileIn(BaseModel):
    title: str
    tile_type: str
    size: str = "small"
    sort_order: int = 0
    specialty_filters: str | None = None
    image_url: str | None = None
    image_fit: str = "cover"
    image_x: int = 0
    image_y: int = 0
    image_scale: int = 100
    is_active: bool = True


class HomeTileOut(HomeTileIn):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class ConsumerDocumentIn(BaseModel):
    title: str
    file_url: str
    sort_order: int = 0
    is_active: bool = True


class ConsumerDocumentOut(ConsumerDocumentIn):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class PromoBannerIn(BaseModel):
    title: str
    image_url: str
    description: str | None = None
    card_image_url: str | None = None
    card_image_fit: str = "cover"
    card_image_x: int = 0
    card_image_y: int = 0
    card_image_scale: int = 100
    list_image_url: str | None = None
    list_image_fit: str = "cover"
    list_image_x: int = 0
    list_image_y: int = 0
    list_image_scale: int = 100
    target_url: str | None = None
    sort_order: int = 0
    is_active: bool = True


class PromoBannerOut(PromoBannerIn):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class DoctorMediaIn(BaseModel):
    employee_mis_id: str
    photo_url: str


class DoctorMediaOut(DoctorMediaIn):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
