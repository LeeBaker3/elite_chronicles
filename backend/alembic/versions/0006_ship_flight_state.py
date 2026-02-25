"""add persisted ship flight state fields

Revision ID: 0006_ship_flight_state
Revises: 0005_comms_channel_reads
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_ship_flight_state"
down_revision = "0005_comms_channel_reads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ships",
        sa.Column(
            "flight_phase",
            sa.Text(),
            nullable=False,
            server_default="idle",
        ),
    )
    op.add_column(
        "ships",
        sa.Column(
            "flight_locked_destination_station_id",
            sa.BigInteger(),
            nullable=True,
        ),
    )
    op.add_column(
        "ships",
        sa.Column(
            "flight_phase_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "ships_flight_locked_destination_station_id_fkey",
        "ships",
        "stations",
        ["flight_locked_destination_station_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "ships_flight_locked_destination_station_id_fkey",
        "ships",
        type_="foreignkey",
    )
    op.drop_column("ships", "flight_phase_started_at")
    op.drop_column("ships", "flight_locked_destination_station_id")
    op.drop_column("ships", "flight_phase")
