"""add doctor branch-filter visibility flag

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "doctor_media",
        sa.Column("show_in_branch_filters", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("doctor_media", "show_in_branch_filters", server_default=None)


def downgrade() -> None:
    op.drop_column("doctor_media", "show_in_branch_filters")
