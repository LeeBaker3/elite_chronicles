"""add backend-owned ship flight control state

Revision ID: 0012_ship_flight_control_state
Revises: 0011_ship_archetypes_render_seed_local_targets
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_ship_flight_control_state"
down_revision = "0011_ship_archetypes_render_seed_local_targets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("ships")}

    additions: list[tuple[str, sa.Column]] = [
        (
            "flight_heading_yaw_deg",
            sa.Column("flight_heading_yaw_deg", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_heading_pitch_deg",
            sa.Column("flight_heading_pitch_deg", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_heading_roll_deg",
            sa.Column("flight_heading_roll_deg", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_velocity_x",
            sa.Column("flight_control_velocity_x", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_velocity_y",
            sa.Column("flight_control_velocity_y", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_velocity_z",
            sa.Column("flight_control_velocity_z", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_thrust_input",
            sa.Column("flight_control_thrust_input", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_yaw_input",
            sa.Column("flight_control_yaw_input", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_pitch_input",
            sa.Column("flight_control_pitch_input", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_roll_input",
            sa.Column("flight_control_roll_input", sa.Float(), nullable=False, server_default="0"),
        ),
        (
            "flight_control_brake_active",
            sa.Column("flight_control_brake_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        ),
        (
            "flight_control_updated_at",
            sa.Column("flight_control_updated_at", sa.DateTime(timezone=True), nullable=True),
        ),
    ]

    for column_name, column in additions:
        if column_name not in columns:
            op.add_column("ships", column)


def downgrade() -> None:
    op.drop_column("ships", "flight_control_updated_at")
    op.drop_column("ships", "flight_control_brake_active")
    op.drop_column("ships", "flight_control_roll_input")
    op.drop_column("ships", "flight_control_pitch_input")
    op.drop_column("ships", "flight_control_yaw_input")
    op.drop_column("ships", "flight_control_thrust_input")
    op.drop_column("ships", "flight_control_velocity_z")
    op.drop_column("ships", "flight_control_velocity_y")
    op.drop_column("ships", "flight_control_velocity_x")
    op.drop_column("ships", "flight_heading_roll_deg")
    op.drop_column("ships", "flight_heading_pitch_deg")
    op.drop_column("ships", "flight_heading_yaw_deg")