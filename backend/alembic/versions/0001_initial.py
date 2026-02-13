"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-02-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
# NOTE: keep as None to indicate first migration
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "factions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("alignment", sa.Text(), nullable=False,
                  server_default="neutral"),
        sa.Column("reputation_scale", sa.Integer(),
                  nullable=False, server_default="0"),
    )

    op.create_table(
        "star_systems",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("seed", sa.Text(), nullable=False),
        sa.Column("position_x", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("position_y", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("position_z", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("economy_type", sa.Text(),
                  nullable=False, server_default="mixed"),
        sa.Column("tech_level", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("faction_id", sa.BigInteger(), sa.ForeignKey("factions.id")),
    )

    op.create_table(
        "station_archetypes",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("size_class", sa.Text(), nullable=False,
                  server_default="medium"),
        sa.Column("shape", sa.Text(), nullable=False,
                  server_default="coriolis"),
        sa.Column("palette_json", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("features_json", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
    )

    op.create_table(
        "stations",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("system_id", sa.BigInteger(), sa.ForeignKey(
            "star_systems.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("archetype_id", sa.BigInteger(), sa.ForeignKey(
            "station_archetypes.id"), nullable=False),
        sa.Column("position_x", sa.Integer(), nullable=False),
        sa.Column("position_y", sa.Integer(), nullable=False),
        sa.Column("position_z", sa.Integer(), nullable=False),
        sa.Column("services_json", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("faction_id", sa.BigInteger(), sa.ForeignKey("factions.id")),
        sa.Column("tech_level", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("ai_story_available", sa.Boolean(),
                  nullable=False, server_default=sa.text("false")),
    )
    op.create_index("stations_system_id_idx", "stations", ["system_id"])

    op.create_table(
        "commodities",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("base_price", sa.Integer(), nullable=False),
        sa.Column("volatility", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("illegal_flag", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
    )

    op.create_table(
        "station_inventory",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("station_id", sa.BigInteger(),
                  sa.ForeignKey("stations.id"), nullable=False),
        sa.Column("commodity_id", sa.BigInteger(),
                  sa.ForeignKey("commodities.id"), nullable=False),
        sa.Column("quantity", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("max_capacity", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("buy_price", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("sell_price", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("version", sa.BigInteger(),
                  nullable=False, server_default="0"),
        sa.UniqueConstraint("station_id", "commodity_id",
                            name="station_inventory_station_id_commodity_id_key"),
    )
    op.create_index("station_inventory_station_id_idx",
                    "station_inventory", ["station_id"])

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False, server_default="user"),
        sa.Column("status", sa.Text(), nullable=False,
                  server_default="active"),
        sa.Column("is_alive", sa.Boolean(), nullable=False,
                  server_default=sa.text("true")),
        sa.Column("location_type", sa.Text()),
        sa.Column("location_id", sa.BigInteger()),
        sa.Column("credits", sa.BigInteger(),
                  nullable=False, server_default="0"),
        sa.Column("faction_id", sa.BigInteger(), sa.ForeignKey("factions.id")),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("email", name="users_email_key"),
        sa.UniqueConstraint("username", name="users_username_key"),
    )
    op.create_index("users_id_idx", "users", ["id"])

    op.create_table(
        "sessions",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey(
            "users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip_address", sa.Text()),
        sa.Column("user_agent", sa.Text()),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("sessions_user_id_idx", "sessions", ["user_id"])

    op.create_table(
        "ships",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("owner_user_id", sa.BigInteger(), sa.ForeignKey(
            "users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("hull_max", sa.Integer(), nullable=False),
        sa.Column("hull_current", sa.Integer(), nullable=False),
        sa.Column("shields_max", sa.Integer(), nullable=False),
        sa.Column("shields_current", sa.Integer(), nullable=False),
        sa.Column("energy_cap", sa.Integer(), nullable=False),
        sa.Column("energy_current", sa.Integer(), nullable=False),
        sa.Column("fuel_cap", sa.Integer(), nullable=False),
        sa.Column("fuel_current", sa.Integer(), nullable=False),
        sa.Column("cargo_capacity", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("position_x", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("position_y", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("position_z", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("velocity_x", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("velocity_y", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("velocity_z", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("status", sa.Text(), nullable=False,
                  server_default="in-space"),
        sa.Column("docked_station_id", sa.BigInteger(),
                  sa.ForeignKey("stations.id")),
        sa.Column("last_update_at", sa.DateTime(
            timezone=True), server_default=sa.func.now()),
        sa.Column("version", sa.BigInteger(),
                  nullable=False, server_default="0"),
    )
    op.create_index("ships_owner_user_id_idx", "ships", ["owner_user_id"])

    op.create_table(
        "ship_cargo",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("ship_id", sa.BigInteger(), sa.ForeignKey(
            "ships.id"), nullable=False),
        sa.Column("commodity_id", sa.BigInteger(), sa.ForeignKey(
            "commodities.id"), nullable=False),
        sa.Column("quantity", sa.Integer(),
                  nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("version", sa.BigInteger(),
                  nullable=False, server_default="0"),
        sa.UniqueConstraint("ship_id", "commodity_id",
                            name="ship_cargo_ship_id_commodity_id_key"),
    )
    op.create_index("ship_cargo_ship_id_idx", "ship_cargo", ["ship_id"])

    op.create_table(
        "story_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey(
            "users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("location_type", sa.Text(), nullable=False),
        sa.Column("location_id", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False,
                  server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )
    op.create_index("story_sessions_user_id_idx",
                    "story_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ship_cargo_ship_id_idx", table_name="ship_cargo")
    op.drop_table("ship_cargo")
    op.drop_index("story_sessions_user_id_idx", table_name="story_sessions")
    op.drop_table("story_sessions")
    op.drop_index("ships_owner_user_id_idx", table_name="ships")
    op.drop_table("ships")
    op.drop_index("sessions_user_id_idx", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("users_id_idx", table_name="users")
    op.drop_table("users")
    op.drop_index("station_inventory_station_id_idx",
                  table_name="station_inventory")
    op.drop_table("station_inventory")
    op.drop_table("commodities")
    op.drop_index("stations_system_id_idx", table_name="stations")
    op.drop_table("stations")
    op.drop_table("station_archetypes")
    op.drop_table("star_systems")
    op.drop_table("factions")
