# Elite Chronicles Backend

## Setup

1. Create a virtual environment and install dependencies.
2. Copy `.env.example` to `.env` and adjust settings.
3. Create the database defined by `DATABASE_URL`.

## Run Migrations

```bash
alembic -c alembic.ini upgrade head
```

## Run API

```bash
uvicorn app.main:app --reload
```

## Health Check

`GET /health`

## Trade + Cargo Notes

- `POST /api/stations/{station_id}/trade` accepts optional `ship_id` and enforces cargo capacity/cargo availability when provided.
- `GET /api/ships/{ship_id}/cargo` returns cargo capacity, used/free totals, and current cargo contents.

## Core Systems Notes

- `GET /api/players/me` returns authenticated commander profile/state fields.
- `POST /api/ships/{ship_id}/dock` docks a user-owned ship at a target station.
- `POST /api/ships/{ship_id}/undock` transitions a docked ship to in-space.
- `POST /api/ships/{ship_id}/refuel` refuels a docked ship (full or partial via `amount`).
- `GET /api/markets/{system_id}/summary` returns per-station aggregate market summary rows.
