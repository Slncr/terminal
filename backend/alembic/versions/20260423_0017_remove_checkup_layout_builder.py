"""remove checkup layout builder fields

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("checkup_items")}
    if "layout_json" in columns:
        op.drop_column("checkup_items", "layout_json")
    if "builder_enabled" in columns:
        op.drop_column("checkup_items", "builder_enabled")


def downgrade() -> None:
    op.add_column("checkup_items", sa.Column("builder_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("checkup_items", sa.Column("layout_json", sa.Text(), nullable=True))
    op.alter_column("checkup_items", "builder_enabled", server_default=None)
