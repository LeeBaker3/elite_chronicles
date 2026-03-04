# Elite Chronicles Backend

## Setup

1. Create a virtual environment and install dependencies.
2. Copy `.env.example` to `.env` and adjust settings.
3. Create the database defined by `DATABASE_URL`.

## Run Migrations

```bash
alembic -c alembic.ini upgrade head
```

If your shell cannot resolve `alembic`, run it from the repo root with the venv binary:

```bash
cd ..
./.venv/bin/alembic -c backend/alembic.ini upgrade head
```

If migration `0002_comms_messages` fails with `DuplicateTable` because
`comms_messages` already exists, align Alembic history with:

```bash
cd backend
SITE_PACKAGES=$(../.venv/bin/python -c 'import site; print(site.getsitepackages()[0])')
export PYTHONPATH="$SITE_PACKAGES:$PWD"
set -a && source .env && set +a
../.venv/bin/alembic -c alembic.ini stamp 0002_comms_messages
../.venv/bin/alembic -c alembic.ini current
```

Expected `current` output:

```text
0002_comms_messages (head)
```

## Run API

```bash
uvicorn app.main:app --reload
```

## Maintenance scripts

Developer ship tools (quick status + top-up):

```bash
cd backend
../.venv/bin/python scripts/dev_ship_tools.py status --ship-id 1
../.venv/bin/python scripts/dev_ship_tools.py top-up --ship-id 1
```

End-to-end jump-modes smoke (single integrated flow for local transfer and
hyperspace behavior):

```bash
cd backend
../.venv/bin/python scripts/smoke_jump_modes.py
```

Bootstrap known-star inspired galactic systems (deterministic + idempotent):

```bash
cd backend
../.venv/bin/python scripts/bootstrap_known_star_systems.py
```

Optional flags:

- `--dry-run`: print changes without writing data.
- `--skip-regenerate`: only upsert systems/stations and skip celestial regeneration.
- `--disable-online-names`: skip online Milky Way name ingestion and use procedural fallback names only.
- `--dataset-url <url>`: override star-name dataset source URL.
- `--dataset-timeout-seconds <int>`: set HTTP timeout for dataset download (default `20`).
- `--max-real-names <int>`: cap ingested unique real-star names (default `3000`).

Default dataset source:

- `https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv`

If online ingestion is unavailable, the script safely falls back to deterministic procedural naming.

Batch-11 deterministic regeneration/backfill sequence:

```bash
cd backend
../.venv/bin/python scripts/bootstrap_known_star_systems.py
../.venv/bin/python scripts/generate_galaxy_system_details.py
../.venv/bin/python scripts/backfill_station_orbits.py
```

This sequence supports:

- initial generation for systems/stations,
- idempotent regeneration for celestial body details,
- station host-orbit backfill operations.

Backfill legacy celestial body orbit scales to realistic million-km ranges:

```bash
cd backend
../.venv/bin/python scripts/backfill_celestial_orbits.py
```

Optional flags:

- `--system-id <id>`: process one specific system.
- `--all-systems`: process all systems even if already upgraded.

## Flight Collision Tuning (Environment)

These optional environment variables tune Batch 08 collision behavior:

- `FLIGHT_COLLISION_ENABLED` (`true`/`false`): toggle collision checks.
- `DOCK_APPROACH_ENABLED` (`true`/`false`): toggle docking approach phase logs/state before final dock.
- `FLIGHT_COLLISION_COOLDOWN_SECONDS` (int): minimum seconds between processed collision events.
- `FLIGHT_COLLISION_RADIUS_SCALE` (float): scales collision envelope radii.
- `FLIGHT_COLLISION_DAMAGE_SCALE` (float): scales applied collision damage.
- `FLIGHT_COLLISION_GLANCING_MULTIPLIER` (float): glancing impact threshold multiplier.
- `FLIGHT_COLLISION_CRITICAL_MULTIPLIER` (float): critical impact threshold multiplier.

## Batch 04 Live Smoke Flow

Use this to validate the end-to-end loop (trade -> undock -> jump -> dock -> trade)
against a running local API at `http://127.0.0.1:8000`.

```bash
cd backend
../.venv/bin/python scripts/smoke_batch04_flow.py
```

Notes:
- The script is local-dev oriented and self-seeds minimum prerequisites if missing
	(second station, baseline commodity inventory, smoke-user credits).
- Keep `uvicorn app.main:app --reload` running in another terminal while executing.

## Docking Range Live Smoke Flow

Use this to validate docking computer range behavior against a running local API
at `http://127.0.0.1:8000`.

```bash
cd backend
../.venv/bin/python scripts/smoke_docking_range.py
```

Notes:
- Verifies that in-range docking succeeds.
- Verifies out-of-range docking returns `409` with range-exceeded messaging.
- Falls back to a controlled out-of-range setup when local station geometry has no
	natural out-of-range target.

## Station Orbit Backfill

Use this to force-refresh station host assignments and station world positions
onto host-planet orbits for local chart/scanner realism.

```bash
cd backend
../.venv/bin/python scripts/backfill_station_orbits.py
```

Optional: target one system only.

```bash
cd backend
../.venv/bin/python scripts/backfill_station_orbits.py --system-id 1
```

## Local Admin Account Bootstrap

For local development, do not hard-seed a shared default admin credential.
Instead:

1. Register a normal user via the app/API.
2. Promote that user with the helper script:

```bash
cd backend
../.venv/bin/python scripts/promote_admin.py --email your-user@example.com --activate
```

Optional: set role explicitly (`user`, `moderator`, `admin`):

```bash
cd backend
../.venv/bin/python scripts/promote_admin.py --email your-user@example.com --role admin --activate
```

Quick sanity check to list elevated-access users:

```bash
cd backend
../.venv/bin/python scripts/list_admins.py
```

## Health Check

`GET /health`

## Trade + Cargo Notes

- `POST /api/stations/{station_id}/trade` requires auth and a user-owned `ship_id`, enforces docking/ownership checks, and applies credit debits/credits.
- `GET /api/ships/{ship_id}/cargo` returns cargo capacity, used/free totals, and current cargo contents.
- Auth flow auto-provisions a starter ship (or backfills cargo hold) so new/legacy users can trade without manual ship setup.

## Core Systems Notes

- `GET /api/players/me` returns authenticated commander profile/state fields.
- `POST /api/ships/{ship_id}/dock` docks a user-owned ship at a target station.
- `POST /api/ships/{ship_id}/undock` transitions a docked ship to in-space.
- `POST /api/ships/{ship_id}/refuel` refuels a docked ship (full or partial via `amount`).
- `POST /api/ships/{ship_id}/jump` consumes fuel and moves an in-space ship into destination system deep-space (supports `destination_station_id` and/or `destination_system_id`), requiring an explicit follow-up dock action for station services/trade.
- `POST /api/ships/{ship_id}/crash-recovery` restores ship and player location to the latest safe checkpoint captured on safe events (dock, undock, jump).
- `GET /api/ships/{ship_id}/operations` returns recent operation log entries; `details` is a human-readable message and now resolves station names for dock/undock/jump events (with `Station #<id>` fallback only when a name is unavailable).
- `GET /api/markets/{system_id}/summary` returns per-station aggregate market summary rows, including freshness fields (`updated_seconds_ago`, `stale`) and supports optional `simulate_ticks` read-only projection.
- Interstellar comms messages are now queued with delivery timestamps and automatically transition from `queued` to `delivered` when due (`/api/comms` message/channel reads trigger due-message release).

## Economy + Admin Logs Notes

- `POST /api/markets/tick` runs deterministic inventory tick updates (admin-only).
- `GET /api/admin/logs` returns filtered operational logs (admin-only) with optional `level`, `tail`, `contains`, `regex`, and `since` cursor query filters for follow-style polling.
- `GET /api/admin/users` returns paginated user management rows (admin-only).
- `PATCH /api/admin/users/{id}` updates user `role` and/or `status` with self-lockout safety guards (admin-only).
