"""add target doctor for home tile

Revision ID: 0026
Revises: 0025
Create Date: 2026-05-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "home_tiles",
        sa.Column("target_employee_mis_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_home_tiles_target_employee_mis_id",
        "home_tiles",
        ["target_employee_mis_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_home_tiles_target_employee_mis_id", table_name="home_tiles")
    op.drop_column("home_tiles", "target_employee_mis_id")
