"""add doctor section visibility flag

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "doctor_media",
        sa.Column("show_in_sections", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("doctor_media", "show_in_sections", server_default=None)


def downgrade() -> None:
    op.drop_column("doctor_media", "show_in_sections")
