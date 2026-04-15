"""add sync_state flag table

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sync_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("full_sync_done", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text(
            "INSERT INTO sync_state (id, full_sync_done, updated_at) VALUES (1, false, NOW()) "
            "ON CONFLICT (id) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.drop_table("sync_state")
