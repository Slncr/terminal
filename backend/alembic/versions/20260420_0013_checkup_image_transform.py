"""add checkup image transform fields

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("checkup_items", sa.Column("image_fit", sa.String(length=16), nullable=False, server_default="cover"))
    op.add_column("checkup_items", sa.Column("image_x", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("checkup_items", sa.Column("image_y", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("checkup_items", sa.Column("image_scale", sa.Integer(), nullable=False, server_default="100"))
    op.alter_column("checkup_items", "image_fit", server_default=None)
    op.alter_column("checkup_items", "image_x", server_default=None)
    op.alter_column("checkup_items", "image_y", server_default=None)
    op.alter_column("checkup_items", "image_scale", server_default=None)

    op.add_column("checkup_group_tiles", sa.Column("image_fit", sa.String(length=16), nullable=False, server_default="cover"))
    op.add_column("checkup_group_tiles", sa.Column("image_x", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("checkup_group_tiles", sa.Column("image_y", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("checkup_group_tiles", sa.Column("image_scale", sa.Integer(), nullable=False, server_default="100"))
    op.alter_column("checkup_group_tiles", "image_fit", server_default=None)
    op.alter_column("checkup_group_tiles", "image_x", server_default=None)
    op.alter_column("checkup_group_tiles", "image_y", server_default=None)
    op.alter_column("checkup_group_tiles", "image_scale", server_default=None)


def downgrade() -> None:
    op.drop_column("checkup_group_tiles", "image_scale")
    op.drop_column("checkup_group_tiles", "image_y")
    op.drop_column("checkup_group_tiles", "image_x")
    op.drop_column("checkup_group_tiles", "image_fit")
    op.drop_column("checkup_items", "image_scale")
    op.drop_column("checkup_items", "image_y")
    op.drop_column("checkup_items", "image_x")
    op.drop_column("checkup_items", "image_fit")
