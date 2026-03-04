"""add ship archetypes, render seeds, and generic local target fields

Revision ID: 0011_ship_archetypes_render_seed_local_targets
Revises: 0010_celestial_bodies_simulation_state
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_ship_archetypes_render_seed_local_targets"
down_revision = "0010_celestial_bodies_simulation_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def table_exists(table_name: str) -> bool:
        return table_name in set(inspector.get_table_names())

    def column_exists(table_name: str, column_name: str) -> bool:
        columns = inspector.get_columns(table_name)
        return column_name in {column["name"] for column in columns}

    def index_exists(table_name: str, index_name: str) -> bool:
        indexes = inspector.get_indexes(table_name)
        return index_name in {index["name"] for index in indexes}

    def foreign_key_exists(table_name: str, foreign_key_name: str) -> bool:
        foreign_keys = inspector.get_foreign_keys(table_name)
        return foreign_key_name in {foreign_key["name"] for foreign_key in foreign_keys}

    if not table_exists("ship_archetypes"):
        op.create_table(
            "ship_archetypes",
            sa.Column("id", sa.BigInteger(), primary_key=True),
            sa.Column("key", sa.Text(), nullable=False, unique=True),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("hull_class", sa.Text(), nullable=False, server_default="light"),
            sa.Column("archetype_version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "render_profile_json",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'{}'::json"),
            ),
        )

    if not index_exists("ship_archetypes", "ship_archetypes_key_idx"):
        op.create_index("ship_archetypes_key_idx", "ship_archetypes", ["key"], unique=True)

    cobra_row = bind.execute(
        sa.text("SELECT id FROM ship_archetypes WHERE key = :key"),
        {"key": "cobra-mk1"},
    ).fetchone()
    if cobra_row is None:
        bind.execute(
            sa.text(
                """
                INSERT INTO ship_archetypes (key, name, hull_class, archetype_version, render_profile_json)
                VALUES (:key, :name, :hull_class, :archetype_version, :render_profile_json)
                """
            ),
            {
                "key": "cobra-mk1",
                "name": "Cobra Mk I",
                "hull_class": "light",
                "archetype_version": 1,
                "render_profile_json": "{}",
            },
        )
        cobra_row = bind.execute(
            sa.text("SELECT id FROM ship_archetypes WHERE key = :key"),
            {"key": "cobra-mk1"},
        ).fetchone()

    cobra_archetype_id = int(cobra_row[0]) if cobra_row is not None else 1

    if not column_exists("ships", "ship_archetype_id"):
        op.add_column("ships", sa.Column("ship_archetype_id", sa.BigInteger(), nullable=True))
    if not column_exists("ships", "render_seed"):
        op.add_column(
            "ships",
            sa.Column("render_seed", sa.BigInteger(), nullable=False, server_default="0"),
        )
    if not column_exists("ships", "flight_locked_destination_contact_type"):
        op.add_column(
            "ships",
            sa.Column("flight_locked_destination_contact_type", sa.Text(), nullable=True),
        )
    if not column_exists("ships", "flight_locked_destination_contact_id"):
        op.add_column(
            "ships",
            sa.Column("flight_locked_destination_contact_id", sa.BigInteger(), nullable=True),
        )
    if not foreign_key_exists("ships", "ships_ship_archetype_id_fkey"):
        op.create_foreign_key(
            "ships_ship_archetype_id_fkey",
            "ships",
            "ship_archetypes",
            ["ship_archetype_id"],
            ["id"],
        )
    if not index_exists("ships", "ships_ship_archetype_id_idx"):
        op.create_index("ships_ship_archetype_id_idx", "ships", ["ship_archetype_id"])

    if not column_exists("stations", "render_seed"):
        op.add_column(
            "stations",
            sa.Column("render_seed", sa.BigInteger(), nullable=False, server_default="0"),
        )

    if table_exists("celestial_bodies") and not column_exists("celestial_bodies", "render_seed"):
        op.add_column(
            "celestial_bodies",
            sa.Column("render_seed", sa.BigInteger(), nullable=False, server_default="0"),
        )

    ship_rows = bind.execute(
        sa.text(
            """
            SELECT id, ship_archetype_id, render_seed, flight_locked_destination_station_id,
                   flight_locked_destination_contact_type, flight_locked_destination_contact_id
            FROM ships
            """
        )
    ).fetchall()
    for row in ship_rows:
        ship_id = int(row[0])
        ship_archetype_id = row[1]
        render_seed = int(row[2] or 0)
        locked_station_id = row[3]
        locked_contact_type = row[4]
        locked_contact_id = row[5]

        patch: dict[str, int | str] = {}
        if ship_archetype_id is None:
            patch["ship_archetype_id"] = cobra_archetype_id
        if render_seed <= 0:
            patch["render_seed"] = ((ship_id * 1103515245) + 12345) % 2147483647 or 1
        if locked_station_id is not None and not locked_contact_type:
            patch["flight_locked_destination_contact_type"] = "station"
        if locked_station_id is not None and locked_contact_id is None:
            patch["flight_locked_destination_contact_id"] = int(locked_station_id)

        if patch:
            set_clause = ", ".join(f"{key} = :{key}" for key in patch)
            bind.execute(
                sa.text(f"UPDATE ships SET {set_clause} WHERE id = :ship_id"),
                {**patch, "ship_id": ship_id},
            )

    station_rows = bind.execute(
        sa.text("SELECT id, system_id, render_seed FROM stations")
    ).fetchall()
    for row in station_rows:
        station_id = int(row[0])
        system_id = int(row[1] or 0)
        render_seed = int(row[2] or 0)
        if render_seed > 0:
            continue
        seed = ((station_id * 2654435761) ^ (system_id * 40503)) % 2147483647 or 1
        bind.execute(
            sa.text("UPDATE stations SET render_seed = :render_seed WHERE id = :station_id"),
            {"render_seed": seed, "station_id": station_id},
        )

    if table_exists("celestial_bodies"):
        body_rows = bind.execute(
            sa.text("SELECT id, seed_fragment, render_seed FROM celestial_bodies")
        ).fetchall()
        for row in body_rows:
            body_id = int(row[0])
            seed_fragment = int(row[1] or 0)
            render_seed = int(row[2] or 0)
            if render_seed > 0:
                continue
            seed = seed_fragment if seed_fragment > 0 else ((body_id * 48271) % 2147483647 or 1)
            bind.execute(
                sa.text("UPDATE celestial_bodies SET render_seed = :render_seed WHERE id = :body_id"),
                {"render_seed": seed, "body_id": body_id},
            )

    bind.execute(
        sa.text(
            """
            UPDATE ships
            SET ship_archetype_id = :cobra_archetype_id
            WHERE ship_archetype_id IS NULL
            """
        ),
        {"cobra_archetype_id": cobra_archetype_id},
    )


def downgrade() -> None:
    op.drop_index("ships_ship_archetype_id_idx", table_name="ships")
    op.drop_constraint("ships_ship_archetype_id_fkey", "ships", type_="foreignkey")
    op.drop_column("ships", "flight_locked_destination_contact_id")
    op.drop_column("ships", "flight_locked_destination_contact_type")
    op.drop_column("ships", "render_seed")
    op.drop_column("ships", "ship_archetype_id")

    op.drop_column("stations", "render_seed")
    op.drop_column("celestial_bodies", "render_seed")

    op.drop_index("ship_archetypes_key_idx", table_name="ship_archetypes")
    op.drop_table("ship_archetypes")
