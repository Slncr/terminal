from fastapi import APIRouter

from app.routers import admin, appointments, doctors, health, slots, sync

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(doctors.router, prefix="/doctors", tags=["doctors"])
api_router.include_router(slots.router, prefix="/slots", tags=["slots"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["appointments"])
api_router.include_router(sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
