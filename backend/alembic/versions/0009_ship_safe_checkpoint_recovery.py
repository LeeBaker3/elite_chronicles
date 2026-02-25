"""add ship safe checkpoint recovery fields

Revision ID: 0009_ship_safe_checkpoint
Revises: 0008_ship_docking_computer_tier
Create Date: 2026-02-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_ship_safe_checkpoint"
down_revision = "0008_ship_docking_computer_tier"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ships",
        sa.Column("last_safe_status", sa.Text(), nullable=True),
    )
    op.add_column(
        "ships",
        sa.Column(
            "last_safe_docked_station_id",
            sa.BigInteger(),
            nullable=True,
        ),
    )
    op.add_column(
        "ships",
        sa.Column("last_safe_position_x", sa.Integer(), nullable=True),
    )
    op.add_column(
        "ships",
        sa.Column("last_safe_position_y", sa.Integer(), nullable=True),
    )
    op.add_column(
        "ships",
        sa.Column("last_safe_position_z", sa.Integer(), nullable=True),
    )
    op.add_column(
        "ships",
        sa.Column("last_safe_location_type", sa.Text(), nullable=True),
    )
    op.add_column(
        "ships",
        sa.Column("last_safe_location_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "ships",
        sa.Column("last_safe_recorded_at", sa.DateTime(
            timezone=True), nullable=True),
    )
    op.add_column(
        "ships",
        sa.Column(
            "crash_recovery_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.create_foreign_key(
        "fk_ships_last_safe_docked_station_id",
        "ships",
        "stations",
        ["last_safe_docked_station_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_ships_last_safe_docked_station_id",
        "ships",
        type_="foreignkey",
    )
    op.drop_column("ships", "crash_recovery_count")
    op.drop_column("ships", "last_safe_recorded_at")
    op.drop_column("ships", "last_safe_location_id")
    op.drop_column("ships", "last_safe_location_type")
    op.drop_column("ships", "last_safe_position_z")
    op.drop_column("ships", "last_safe_position_y")
    op.drop_column("ships", "last_safe_position_x")
    op.drop_column("ships", "last_safe_docked_station_id")
    op.drop_column("ships", "last_safe_status")
