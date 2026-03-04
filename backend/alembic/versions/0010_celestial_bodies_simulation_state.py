"""add deterministic celestial bodies and system simulation state

Revision ID: 0010_celestial_bodies_simulation_state
Revises: 0009_ship_safe_checkpoint
Create Date: 2026-02-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_celestial_bodies_simulation_state"
down_revision = "0009_ship_safe_checkpoint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    def table_exists(table_name: str) -> bool:
        return table_name in set(sa.inspect(bind).get_table_names())

    def column_exists(table_name: str, column_name: str) -> bool:
        columns = sa.inspect(bind).get_columns(table_name)
        return column_name in {column["name"] for column in columns}

    def index_exists(table_name: str, index_name: str) -> bool:
        indexes = sa.inspect(bind).get_indexes(table_name)
        return index_name in {index["name"] for index in indexes}

    def foreign_key_exists(table_name: str, foreign_key_name: str) -> bool:
        foreign_keys = sa.inspect(bind).get_foreign_keys(table_name)
        return foreign_key_name in {foreign_key["name"] for foreign_key in foreign_keys}

    if not column_exists("star_systems", "generation_version"):
        op.add_column(
            "star_systems",
            sa.Column("generation_version", sa.Integer(),
                      nullable=False, server_default="1"),
        )

    if not table_exists("celestial_bodies"):
        op.create_table(
            "celestial_bodies",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column(
                "system_id",
                sa.BigInteger(),
                sa.ForeignKey("star_systems.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("body_kind", sa.Text(), nullable=False),
            sa.Column("body_type", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("seed_fragment", sa.BigInteger(), nullable=False),
            sa.Column("generation_version", sa.Integer(),
                      nullable=False, server_default="1"),
            sa.Column(
                "parent_body_id",
                sa.BigInteger(),
                sa.ForeignKey("celestial_bodies.id"),
                nullable=True,
            ),
            sa.Column("orbit_index", sa.Integer(),
                      nullable=False, server_default="0"),
            sa.Column("orbit_radius_km", sa.Integer(),
                      nullable=False, server_default="0"),
            sa.Column("radius_km", sa.Integer(),
                      nullable=False, server_default="0"),
            sa.Column("mass_kg", sa.BigInteger(), nullable=True),
            sa.Column("axial_tilt_deg", sa.Integer(), nullable=True),
            sa.Column("position_x", sa.Integer(),
                      nullable=False, server_default="0"),
            sa.Column("position_y", sa.Integer(),
                      nullable=False, server_default="0"),
            sa.Column("position_z", sa.Integer(),
                      nullable=False, server_default="0"),
            sa.Column("render_profile", sa.JSON(), nullable=False,
                      server_default=sa.text("'{}'::json")),
        )

    if not index_exists("celestial_bodies", "celestial_bodies_system_id_idx"):
        op.create_index(
            "celestial_bodies_system_id_idx",
            "celestial_bodies",
            ["system_id"],
        )
    if not index_exists("celestial_bodies", "celestial_bodies_system_kind_idx"):
        op.create_index(
            "celestial_bodies_system_kind_idx",
            "celestial_bodies",
            ["system_id", "body_kind"],
        )
    if not index_exists("celestial_bodies", "celestial_bodies_system_parent_idx"):
        op.create_index(
            "celestial_bodies_system_parent_idx",
            "celestial_bodies",
            ["system_id", "parent_body_id"],
        )
    if not index_exists("celestial_bodies", "celestial_bodies_unique_generation_idx"):
        op.create_index(
            "celestial_bodies_unique_generation_idx",
            "celestial_bodies",
            [
                "system_id",
                "generation_version",
                "body_kind",
                "parent_body_id",
                "orbit_index",
            ],
            unique=True,
        )

    if not column_exists("stations", "host_body_id"):
        op.add_column(
            "stations",
            sa.Column("host_body_id", sa.BigInteger(), nullable=True),
        )
    if not column_exists("stations", "orbit_radius_km"):
        op.add_column(
            "stations",
            sa.Column("orbit_radius_km", sa.Integer(), nullable=True),
        )
    if not column_exists("stations", "orbit_phase_deg"):
        op.add_column(
            "stations",
            sa.Column("orbit_phase_deg", sa.Integer(), nullable=True),
        )
    if table_exists("celestial_bodies") and not foreign_key_exists("stations", "stations_host_body_id_fkey"):
        op.create_foreign_key(
            "stations_host_body_id_fkey",
            "stations",
            "celestial_bodies",
            ["host_body_id"],
            ["id"],
        )
    if not index_exists("stations", "stations_system_host_body_idx"):
        op.create_index(
            "stations_system_host_body_idx",
            "stations",
            ["system_id", "host_body_id"],
        )

    if not table_exists("system_simulation_state"):
        op.create_table(
            "system_simulation_state",
            sa.Column(
                "system_id",
                sa.BigInteger(),
                sa.ForeignKey("star_systems.id", ondelete="CASCADE"),
                primary_key=True,
                nullable=False,
            ),
            sa.Column(
                "last_economy_tick_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
            sa.Column(
                "last_politics_tick_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
            sa.Column("economy_tick_cursor", sa.BigInteger(),
                      nullable=False, server_default="0"),
            sa.Column("politics_tick_cursor", sa.BigInteger(),
                      nullable=False, server_default="0"),
            sa.Column("version", sa.BigInteger(),
                      nullable=False, server_default="0"),
        )

    if not table_exists("system_political_state"):
        op.create_table(
            "system_political_state",
            sa.Column(
                "system_id",
                sa.BigInteger(),
                sa.ForeignKey("star_systems.id", ondelete="CASCADE"),
                primary_key=True,
                nullable=False,
            ),
            sa.Column("faction_control_json", sa.JSON(), nullable=False,
                      server_default=sa.text("'{}'::json")),
            sa.Column("security_level", sa.Text(),
                      nullable=False, server_default="medium"),
            sa.Column("stability_score", sa.Integer(),
                      nullable=False, server_default="50"),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )


def downgrade() -> None:
    op.drop_table("system_political_state")
    op.drop_table("system_simulation_state")

    op.drop_index("stations_system_host_body_idx", table_name="stations")
    op.drop_constraint("stations_host_body_id_fkey",
                       "stations", type_="foreignkey")
    op.drop_column("stations", "orbit_phase_deg")
    op.drop_column("stations", "orbit_radius_km")
    op.drop_column("stations", "host_body_id")

    op.drop_index("celestial_bodies_unique_generation_idx",
                  table_name="celestial_bodies")
    op.drop_index("celestial_bodies_system_parent_idx",
                  table_name="celestial_bodies")
    op.drop_index("celestial_bodies_system_kind_idx",
                  table_name="celestial_bodies")
    op.drop_index("celestial_bodies_system_id_idx",
                  table_name="celestial_bodies")
    op.drop_table("celestial_bodies")

    op.drop_column("star_systems", "generation_version")
