"""add missions and reputation tables

Revision ID: 0004_missions_reputation
Revises: 0003_ship_operations_log
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_missions_reputation"
down_revision = "0003_ship_operations_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "missions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("faction_id", sa.BigInteger(),
                  sa.ForeignKey("factions.id"), nullable=True),
        sa.Column("station_id", sa.BigInteger(),
                  sa.ForeignKey("stations.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("reward_credits", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("status", sa.Text(), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("missions_station_id_idx", "missions", ["station_id"])

    op.create_table(
        "mission_assignments",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "mission_id",
            sa.BigInteger(),
            sa.ForeignKey("missions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.Text(), nullable=False,
                  server_default="accepted"),
        sa.Column("accepted_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("mission_assignments_user_id_idx",
                    "mission_assignments", ["user_id"])
    op.create_index(
        "mission_assignments_mission_user_idx",
        "mission_assignments",
        ["mission_id", "user_id"],
        unique=True,
    )

    op.create_table(
        "reputation",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "faction_id",
            sa.BigInteger(),
            sa.ForeignKey("factions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("reputation_user_id_idx", "reputation", ["user_id"])
    op.create_index(
        "reputation_user_faction_idx",
        "reputation",
        ["user_id", "faction_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("reputation_user_faction_idx", table_name="reputation")
    op.drop_index("reputation_user_id_idx", table_name="reputation")
    op.drop_table("reputation")

    op.drop_index("mission_assignments_mission_user_idx",
                  table_name="mission_assignments")
    op.drop_index("mission_assignments_user_id_idx",
                  table_name="mission_assignments")
    op.drop_table("mission_assignments")

    op.drop_index("missions_station_id_idx", table_name="missions")
    op.drop_table("missions")
