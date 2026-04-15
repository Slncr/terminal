"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "employees",
        sa.Column("mis_id", sa.String(length=64), nullable=False),
        sa.Column("surname", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("patronymic", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("specialty", sa.String(length=512), nullable=True),
        sa.Column("is_main", sa.Boolean(), nullable=False),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("mis_id"),
    )
    op.create_table(
        "services",
        sa.Column("mis_id", sa.String(length=64), nullable=False),
        sa.Column("clinic_id", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=512), nullable=True),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("mis_id"),
    )
    op.create_index("ix_services_clinic_id", "services", ["clinic_id"], unique=False)
    op.create_table(
        "sync_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "terminal_appointments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mis_guid", sa.String(length=64), nullable=True),
        sa.Column("employee_mis_id", sa.String(length=64), nullable=False),
        sa.Column("clinic_mis_id", sa.String(length=64), nullable=True),
        sa.Column("service_mis_id", sa.String(length=64), nullable=True),
        sa.Column("slot_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("slot_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("patient_surname", sa.String(length=255), nullable=False),
        sa.Column("patient_name", sa.String(length=255), nullable=False),
        sa.Column("patient_patronymic", sa.String(length=255), nullable=True),
        sa.Column("birthday", sa.String(length=32), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("mis_response", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_terminal_appointments_mis_guid", "terminal_appointments", ["mis_guid"], unique=False)
    op.create_index("ix_terminal_appointments_employee_mis_id", "terminal_appointments", ["employee_mis_id"], unique=False)
    op.create_table(
        "schedule_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_mis_id", sa.String(length=64), nullable=False),
        sa.Column("slot_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("slot_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clinic_mis_id", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["employee_mis_id"], ["employees.mis_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_mis_id", "slot_start", "slot_end", name="uq_schedule_slot"),
    )
    op.create_index("ix_schedule_slots_employee_mis_id", "schedule_slots", ["employee_mis_id"], unique=False)
    op.create_index("ix_schedule_slots_slot_start", "schedule_slots", ["slot_start"], unique=False)
    op.create_index("ix_schedule_slots_clinic_mis_id", "schedule_slots", ["clinic_mis_id"], unique=False)
    op.create_table(
        "occupied_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_mis_id", sa.String(length=64), nullable=False),
        sa.Column("slot_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("slot_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("appointment_guid", sa.String(length=64), nullable=True),
        sa.Column("patient_label", sa.String(length=255), nullable=True),
        sa.Column("service_mis_id", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["employee_mis_id"], ["employees.mis_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_occupied_slots_employee_mis_id", "occupied_slots", ["employee_mis_id"], unique=False)
    op.create_index("ix_occupied_slots_slot_start", "occupied_slots", ["slot_start"], unique=False)
    op.create_index("ix_occupied_slots_appointment_guid", "occupied_slots", ["appointment_guid"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_occupied_slots_appointment_guid", table_name="occupied_slots")
    op.drop_index("ix_occupied_slots_slot_start", table_name="occupied_slots")
    op.drop_index("ix_occupied_slots_employee_mis_id", table_name="occupied_slots")
    op.drop_table("occupied_slots")
    op.drop_index("ix_schedule_slots_clinic_mis_id", table_name="schedule_slots")
    op.drop_index("ix_schedule_slots_slot_start", table_name="schedule_slots")
    op.drop_index("ix_schedule_slots_employee_mis_id", table_name="schedule_slots")
    op.drop_table("schedule_slots")
    op.drop_index("ix_terminal_appointments_employee_mis_id", table_name="terminal_appointments")
    op.drop_index("ix_terminal_appointments_mis_guid", table_name="terminal_appointments")
    op.drop_table("terminal_appointments")
    op.drop_table("sync_runs")
    op.drop_index("ix_services_clinic_id", table_name="services")
    op.drop_table("services")
    op.drop_table("employees")
