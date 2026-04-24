"""add feature flags table

Revision ID: 0019
Revises: 0018
Create Date: 2026-04-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.execute(
        sa.text(
            "INSERT INTO feature_flags (key, enabled, updated_at) VALUES (:key, :enabled, now())"
        ).bindparams(key="checkups_enabled", enabled=True)
    )
    op.alter_column("feature_flags", "enabled", server_default=None)


def downgrade() -> None:
    op.drop_table("feature_flags")
