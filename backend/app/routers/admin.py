from __future__ import annotations

import uuid
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from PIL import Image

from app.database import get_db
from app.models import CheckupGroupTile, CheckupItem, ConsumerDocument, DoctorMedia, Employee, FeatureFlag, HomeTile, PromoBanner
from app.schemas import (
    ConsumerDocumentIn,
    ConsumerDocumentOut,
    DoctorMediaIn,
    DoctorMediaOut,
    EmployeeNameIn,
    HomeTileIn,
    HomeTileOut,
    CheckupGroupTileIn,
    CheckupGroupTileOut,
    CheckupItemIn,
    CheckupItemOut,
    FeatureFlagIn,
    FeatureFlagOut,
    PromoBannerIn,
    PromoBannerOut,
)

router = APIRouter()

MEDIA_ROOT = Path("/app/uploads")
MAX_IMAGE_DIMENSION = 1920


def _save_upload(file: UploadFile, folder: str) -> str:
    ext = Path(file.filename or "").suffix.lower() or ".bin"
    image_exts = {".jpg", ".jpeg", ".png", ".webp"}
    content = file.file.read()
    out_ext = ext
    if ext in image_exts:
        try:
            content, out_ext = _optimize_image(content)
        except Exception:
            out_ext = ext
    name = f"{uuid.uuid4().hex}{out_ext}"
    target_dir = MEDIA_ROOT / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / name
    with target.open("wb") as f:
        f.write(content)
    return f"/media/{folder}/{name}"


def _optimize_image(raw: bytes) -> tuple[bytes, str]:
    with Image.open(BytesIO(raw)) as img:
        src = img.convert("RGBA")
        src.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
        out = BytesIO()
        src.save(out, format="WEBP", quality=82, method=6)
        return out.getvalue(), ".webp"


@router.post("/upload")
def upload_media(file: UploadFile = File(...), folder: str = "misc") -> dict[str, str]:
    return {"url": _save_upload(file, folder)}


@router.get("/tiles", response_model=list[HomeTileOut])
def list_tiles(db: Session = Depends(get_db)) -> list[HomeTile]:
    return list(db.scalars(select(HomeTile).order_by(HomeTile.sort_order, HomeTile.title)).all())


@router.post("/tiles", response_model=HomeTileOut)
def create_tile(payload: HomeTileIn, db: Session = Depends(get_db)) -> HomeTile:
    existing = db.scalars(select(HomeTile).where(HomeTile.title == payload.title)).first()
    if existing is None:
        row = HomeTile(**payload.model_dump())
        db.add(row)
    else:
        row = existing
        row.tile_type = payload.tile_type
        row.size = payload.size
        row.sort_order = payload.sort_order
        row.specialty_filters = payload.specialty_filters
        row.image_url = payload.image_url
        row.image_fit = payload.image_fit
        row.image_x = payload.image_x
        row.image_y = payload.image_y
        row.image_scale = payload.image_scale
        row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


@router.delete("/tiles/{tile_id}")
def delete_tile(tile_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(delete(HomeTile).where(HomeTile.id == tile_id))
    db.commit()
    return {"ok": True}


@router.get("/documents", response_model=list[ConsumerDocumentOut])
def list_documents(db: Session = Depends(get_db)) -> list[ConsumerDocument]:
    return list(
        db.scalars(select(ConsumerDocument).order_by(ConsumerDocument.sort_order, ConsumerDocument.title)).all()
    )


@router.post("/documents", response_model=ConsumerDocumentOut)
def create_document(payload: ConsumerDocumentIn, db: Session = Depends(get_db)) -> ConsumerDocument:
    row = ConsumerDocument(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(delete(ConsumerDocument).where(ConsumerDocument.id == doc_id))
    db.commit()
    return {"ok": True}


@router.get("/banners", response_model=list[PromoBannerOut])
def list_banners(db: Session = Depends(get_db)) -> list[PromoBanner]:
    return list(db.scalars(select(PromoBanner).order_by(PromoBanner.sort_order, PromoBanner.title)).all())


@router.post("/banners", response_model=PromoBannerOut)
def create_banner(payload: PromoBannerIn, db: Session = Depends(get_db)) -> PromoBanner:
    row = PromoBanner(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/banners/{banner_id}", response_model=PromoBannerOut)
def update_banner(banner_id: str, payload: PromoBannerIn, db: Session = Depends(get_db)) -> PromoBanner:
    row = db.get(PromoBanner, banner_id)
    if row is None:
        raise HTTPException(status_code=404, detail="banner not found")
    row.title = payload.title
    row.image_url = payload.image_url
    row.description = payload.description
    row.card_image_url = payload.card_image_url
    row.card_image_fit = payload.card_image_fit
    row.card_image_x = payload.card_image_x
    row.card_image_y = payload.card_image_y
    row.card_image_scale = payload.card_image_scale
    row.list_image_url = payload.list_image_url
    row.list_image_fit = payload.list_image_fit
    row.list_image_x = payload.list_image_x
    row.list_image_y = payload.list_image_y
    row.list_image_scale = payload.list_image_scale
    row.target_url = payload.target_url
    row.sort_order = payload.sort_order
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


@router.delete("/banners/{banner_id}")
def delete_banner(banner_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(delete(PromoBanner).where(PromoBanner.id == banner_id))
    db.commit()
    return {"ok": True}


@router.get("/doctor-media", response_model=list[DoctorMediaOut])
def list_doctor_media(db: Session = Depends(get_db)) -> list[DoctorMedia]:
    return list(db.scalars(select(DoctorMedia).order_by(DoctorMedia.employee_mis_id)).all())


@router.post("/doctor-media", response_model=DoctorMediaOut)
def upsert_doctor_media(payload: DoctorMediaIn, db: Session = Depends(get_db)) -> DoctorMedia:
    existing = db.scalars(select(DoctorMedia).where(DoctorMedia.employee_mis_id == payload.employee_mis_id)).first()
    if existing is None:
        existing = DoctorMedia(**payload.model_dump())
        db.add(existing)
    else:
        existing.photo_url = payload.photo_url
        existing.experience_label = payload.experience_label
        existing.badge1_label = payload.badge1_label
        existing.badge2_label = payload.badge2_label
        existing.badge3_label = payload.badge3_label
        existing.show_in_sections = payload.show_in_sections
    if existing.employee_mis_id and db.get(Employee, existing.employee_mis_id) is None:
        raise HTTPException(status_code=404, detail="doctor not found")
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("/doctor-media/{employee_mis_id}")
def delete_doctor_media(employee_mis_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(delete(DoctorMedia).where(DoctorMedia.employee_mis_id == employee_mis_id))
    db.commit()
    return {"ok": True}


@router.put("/doctors/{employee_mis_id}/name")
def update_doctor_name(employee_mis_id: str, payload: EmployeeNameIn, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = db.get(Employee, employee_mis_id)
    if row is None:
        raise HTTPException(status_code=404, detail="doctor not found")
    row.surname = payload.surname.strip() or row.surname
    row.name = payload.name.strip() or row.name
    row.patronymic = (payload.patronymic or "").strip() or None
    db.commit()
    return {"ok": True}


@router.get("/checkups", response_model=list[CheckupItemOut])
def list_checkups(db: Session = Depends(get_db)) -> list[CheckupItem]:
    return list(db.scalars(select(CheckupItem).order_by(CheckupItem.sort_order, CheckupItem.title)).all())


@router.post("/checkups", response_model=CheckupItemOut)
def create_checkup(payload: CheckupItemIn, db: Session = Depends(get_db)) -> CheckupItem:
    row = CheckupItem(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/checkups/{checkup_id}", response_model=CheckupItemOut)
def update_checkup(checkup_id: str, payload: CheckupItemIn, db: Session = Depends(get_db)) -> CheckupItem:
    row = db.get(CheckupItem, checkup_id)
    if row is None:
        raise HTTPException(status_code=404, detail="checkup not found")
    row.title = payload.title
    row.subtitle = payload.subtitle
    row.group_title = payload.group_title
    row.price_label = payload.price_label
    row.list_image_url = payload.list_image_url
    row.image_url = payload.image_url
    row.image_fit = payload.image_fit
    row.image_x = payload.image_x
    row.image_y = payload.image_y
    row.image_scale = payload.image_scale
    row.description = payload.description
    row.included_left = payload.included_left
    row.included_right = payload.included_right
    row.post_info_text = payload.post_info_text
    row.cta_text = payload.cta_text
    row.registry_note = payload.registry_note
    row.content_json = payload.content_json
    row.sort_order = payload.sort_order
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


@router.delete("/checkups/{checkup_id}")
def delete_checkup(checkup_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(delete(CheckupItem).where(CheckupItem.id == checkup_id))
    db.commit()
    return {"ok": True}


@router.get("/checkup-groups", response_model=list[CheckupGroupTileOut])
def list_checkup_groups(db: Session = Depends(get_db)) -> list[CheckupGroupTile]:
    return list(db.scalars(select(CheckupGroupTile).order_by(CheckupGroupTile.sort_order, CheckupGroupTile.title)).all())


@router.post("/checkup-groups", response_model=CheckupGroupTileOut)
def create_or_update_checkup_group(payload: CheckupGroupTileIn, db: Session = Depends(get_db)) -> CheckupGroupTile:
    row = db.scalars(select(CheckupGroupTile).where(CheckupGroupTile.title == payload.title)).first()
    if row is None:
        row = CheckupGroupTile(**payload.model_dump())
        db.add(row)
    else:
        row.description = payload.description
        row.image_url = payload.image_url
        row.image_fit = payload.image_fit
        row.image_x = payload.image_x
        row.image_y = payload.image_y
        row.image_scale = payload.image_scale
        row.sort_order = payload.sort_order
        row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


@router.put("/checkup-groups/{group_id}", response_model=CheckupGroupTileOut)
def update_checkup_group(group_id: str, payload: CheckupGroupTileIn, db: Session = Depends(get_db)) -> CheckupGroupTile:
    row = db.get(CheckupGroupTile, group_id)
    if row is None:
        raise HTTPException(status_code=404, detail="checkup group not found")
    row.title = payload.title
    row.description = payload.description
    row.image_url = payload.image_url
    row.image_fit = payload.image_fit
    row.image_x = payload.image_x
    row.image_y = payload.image_y
    row.image_scale = payload.image_scale
    row.sort_order = payload.sort_order
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


@router.delete("/checkup-groups/{group_id}")
def delete_checkup_group(group_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(delete(CheckupGroupTile).where(CheckupGroupTile.id == group_id))
    db.commit()
    return {"ok": True}


@router.get("/features/checkups", response_model=FeatureFlagOut)
def get_checkups_feature(db: Session = Depends(get_db)) -> FeatureFlag:
    row = db.get(FeatureFlag, "checkups_enabled")
    if row is None:
        row = FeatureFlag(key="checkups_enabled", enabled=True)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("/features/checkups", response_model=FeatureFlagOut)
def update_checkups_feature(payload: FeatureFlagIn, db: Session = Depends(get_db)) -> FeatureFlag:
    row = db.get(FeatureFlag, "checkups_enabled")
    if row is None:
        row = FeatureFlag(key="checkups_enabled", enabled=payload.enabled)
        db.add(row)
    else:
        row.enabled = payload.enabled
    db.commit()
    db.refresh(row)
    return row
