"""add comms delivery timestamps

Revision ID: 0007_comms_delivery_timestamps
Revises: 0006_ship_flight_state
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_comms_delivery_timestamps"
down_revision = "0006_ship_flight_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "comms_messages",
        sa.Column("deliver_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "comms_messages",
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "comms_messages_deliver_at_idx",
        "comms_messages",
        ["deliver_at"],
    )


def downgrade() -> None:
    op.drop_index("comms_messages_deliver_at_idx", table_name="comms_messages")
    op.drop_column("comms_messages", "delivered_at")
    op.drop_column("comms_messages", "deliver_at")
