import logging
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal
from app.routers import api_router
from app.services.sync import run_full_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=ZoneInfo("Europe/Moscow"))


async def _scheduled_full_sync() -> None:
    if not settings.mis_base_url.strip() or not settings.mis_user.strip():
        return
    db = SessionLocal()
    try:
        await run_full_sync(db)
    except Exception:
        logger.exception("scheduled sync")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        _scheduled_full_sync,
        "cron",
        hour=0,
        minute=30,
        id="mis_full_sync",
        replace_existing=True,
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Clinic terminal API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "clinic-terminal-api", "docs": "/docs"}
