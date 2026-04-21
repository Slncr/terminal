"""add checkup grouping and list image

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "checkup_items",
        sa.Column("group_title", sa.String(length=128), nullable=False, server_default="Общий"),
    )
    op.add_column(
        "checkup_items",
        sa.Column("list_image_url", sa.String(length=512), nullable=True),
    )
    op.create_index("ix_checkup_items_group_title", "checkup_items", ["group_title"], unique=False)
    op.execute("UPDATE checkup_items SET group_title = 'Общий' WHERE group_title IS NULL")
    op.alter_column("checkup_items", "group_title", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_checkup_items_group_title", table_name="checkup_items")
    op.drop_column("checkup_items", "list_image_url")
    op.drop_column("checkup_items", "group_title")
