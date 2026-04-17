"""add list image transform fields to promo banners

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("promo_banners", sa.Column("list_image_url", sa.String(length=512), nullable=True))
    op.add_column("promo_banners", sa.Column("list_image_fit", sa.String(length=16), nullable=False, server_default="cover"))
    op.add_column("promo_banners", sa.Column("list_image_x", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("promo_banners", sa.Column("list_image_y", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("promo_banners", sa.Column("list_image_scale", sa.Integer(), nullable=False, server_default="100"))

    op.alter_column("promo_banners", "list_image_fit", server_default=None)
    op.alter_column("promo_banners", "list_image_x", server_default=None)
    op.alter_column("promo_banners", "list_image_y", server_default=None)
    op.alter_column("promo_banners", "list_image_scale", server_default=None)


def downgrade() -> None:
    op.drop_column("promo_banners", "list_image_scale")
    op.drop_column("promo_banners", "list_image_y")
    op.drop_column("promo_banners", "list_image_x")
    op.drop_column("promo_banners", "list_image_fit")
    op.drop_column("promo_banners", "list_image_url")
