"""add employee_services links

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "employee_services",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_mis_id", sa.String(length=64), nullable=False),
        sa.Column("service_mis_id", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["employee_mis_id"], ["employees.mis_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_mis_id", "service_mis_id", name="uq_employee_service"),
    )
    op.create_index(
        "ix_employee_services_employee_mis_id",
        "employee_services",
        ["employee_mis_id"],
        unique=False,
    )
    op.create_index(
        "ix_employee_services_service_mis_id",
        "employee_services",
        ["service_mis_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_employee_services_service_mis_id", table_name="employee_services")
    op.drop_index("ix_employee_services_employee_mis_id", table_name="employee_services")
    op.drop_table("employee_services")
