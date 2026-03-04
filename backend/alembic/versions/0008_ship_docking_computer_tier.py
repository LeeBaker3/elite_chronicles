"""add ship docking computer tier

Revision ID: 0008_ship_docking_computer_tier
Revises: 0007_comms_delivery_timestamps
Create Date: 2026-02-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_ship_docking_computer_tier"
down_revision = "0007_comms_delivery_timestamps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ships",
        sa.Column(
            "docking_computer_tier",
            sa.Text(),
            nullable=False,
            server_default="standard",
        ),
    )


def downgrade() -> None:
    op.drop_column("ships", "docking_computer_tier")
