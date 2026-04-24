"""add checkup layout builder fields

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("checkup_items", sa.Column("builder_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("checkup_items", sa.Column("layout_json", sa.Text(), nullable=True))
    op.alter_column("checkup_items", "builder_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("checkup_items", "layout_json")
    op.drop_column("checkup_items", "builder_enabled")
