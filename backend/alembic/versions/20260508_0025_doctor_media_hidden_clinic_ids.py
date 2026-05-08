"""add doctor hidden clinic ids list

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "doctor_media",
        sa.Column("hidden_clinic_ids_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("doctor_media", "hidden_clinic_ids_json")
