import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SyncRun
from app.schemas import SyncStatusOut
from app.services.sync import is_full_sync_done, run_full_sync

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/run")
async def trigger_sync(db: Session = Depends(get_db)) -> dict[str, str]:
    run = await run_full_sync(db)
    return {"ok": str(run.ok), "message": run.message or ""}


@router.get("/status", response_model=SyncStatusOut)
def sync_status(db: Session = Depends(get_db)) -> SyncStatusOut:
    row = db.scalars(select(SyncRun).order_by(SyncRun.started_at.desc()).limit(1)).first()
    done = is_full_sync_done(db)
    if row is None:
        return SyncStatusOut(last_sync_at=None, last_ok=None, full_sync_done=done, message=None)
    return SyncStatusOut(
        last_sync_at=row.finished_at or row.started_at,
        last_ok=row.ok,
        full_sync_done=done,
        message=row.message,
    )
