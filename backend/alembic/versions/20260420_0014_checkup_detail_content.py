"""add configurable checkup detail content fields

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("checkup_items", sa.Column("included_left", sa.Text(), nullable=True))
    op.add_column("checkup_items", sa.Column("included_right", sa.Text(), nullable=True))
    op.add_column("checkup_items", sa.Column("post_info_text", sa.Text(), nullable=True))
    op.add_column("checkup_items", sa.Column("cta_text", sa.Text(), nullable=True))
    op.add_column("checkup_items", sa.Column("registry_note", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("checkup_items", "registry_note")
    op.drop_column("checkup_items", "cta_text")
    op.drop_column("checkup_items", "post_info_text")
    op.drop_column("checkup_items", "included_right")
    op.drop_column("checkup_items", "included_left")
