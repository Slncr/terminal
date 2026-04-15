"""add nomenclature_items table

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nomenclature_items",
        sa.Column("mis_id", sa.String(length=64), nullable=False),
        sa.Column("clinic_id", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=512), nullable=True),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("mis_id"),
    )
    op.create_index("ix_nomenclature_items_clinic_id", "nomenclature_items", ["clinic_id"], unique=False)
    op.create_index("ix_nomenclature_items_name", "nomenclature_items", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_nomenclature_items_name", table_name="nomenclature_items")
    op.drop_index("ix_nomenclature_items_clinic_id", table_name="nomenclature_items")
    op.drop_table("nomenclature_items")
