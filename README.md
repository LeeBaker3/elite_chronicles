# Elite Chronicles

[![CI](https://github.com/LeeBaker3/elite_chronicles/actions/workflows/ci.yml/badge.svg)](https://github.com/LeeBaker3/elite_chronicles/actions/workflows/ci.yml)

Command clearance console for Elite Chronicles.

## Structure

- backend/ FastAPI services, migrations, and tests.
- frontend/ Next.js interface.
- prd/ Product notes and session history.

## Product Docs

- UI foundations checklist: [prd/ui-foundations-checklist.md](prd/ui-foundations-checklist.md)
- UI foundations implementation plan: [prd/ui-foundations-implementation-plan.md](prd/ui-foundations-implementation-plan.md)
- UI foundations migration notes: [prd/ui-foundations-migration-notes.md](prd/ui-foundations-migration-notes.md)
- Next implementation batch plan: [prd/batch-01-core-systems-plan.md](prd/batch-01-core-systems-plan.md)
- Following implementation batch plan: [prd/batch-02-economy-logs-plan.md](prd/batch-02-economy-logs-plan.md)
- Next MVP-completion batch plan: [prd/batch-03-comms-admin-mvp-plan.md](prd/batch-03-comms-admin-mvp-plan.md)
- End-to-end loop batch plan: [prd/batch-04-e2e-flight-trade-loop-plan.md](prd/batch-04-e2e-flight-trade-loop-plan.md)
- Flight visuals + traffic batch plan: [prd/batch-05-flight-scene-traffic-visuals-plan.md](prd/batch-05-flight-scene-traffic-visuals-plan.md)
- Celestials + scanner batch plan: [prd/batch-06-system-celestials-scanner-plan.md](prd/batch-06-system-celestials-scanner-plan.md)
- PRD review for MVP end-to-end track: [prd/mvp-e2e-prd-review-2026-02-16.md](prd/mvp-e2e-prd-review-2026-02-16.md)

## Migration Notes

- Backend migration troubleshooting (including `0002_comms_messages` stamp recovery) is documented in [backend/README.md](backend/README.md).

Quick check command:

```bash
cd backend && SITE_PACKAGES=$(../.venv/bin/python -c 'import site; print(site.getsitepackages()[0])') && export PYTHONPATH="$SITE_PACKAGES:$PWD" && set -a && source .env && set +a && ../.venv/bin/alembic -c alembic.ini current
```

Quick recovery command (if `0002_comms_messages` already exists in DB but Alembic is behind):

```bash
cd backend && SITE_PACKAGES=$(../.venv/bin/python -c 'import site; print(site.getsitepackages()[0])') && export PYTHONPATH="$SITE_PACKAGES:$PWD" && set -a && source .env && set +a && ../.venv/bin/alembic -c alembic.ini stamp 0002_comms_messages && ../.venv/bin/alembic -c alembic.ini current
```

## API Contract Note

- `GET /api/ships/{ship_id}/operations` returns human-readable `details`; dock/undock/jump entries resolve station names with `Station #<id>` fallback only if a name is unavailable.
- `POST /api/ships/{ship_id}/jump` now arrives in destination system deep-space (no auto-dock), so docking remains an explicit follow-up step before trading.
- `GET /api/ships/{ship_id}/local-contacts` and `GET /api/systems/{system_id}/local-chart` expose additive `snapshot_version` and `snapshot_generated_at` fields so the frontend can reject mixed scanner/chart state snapshots during active flight.
- Docking distance semantics are explicit in flight surfaces: scanner/list views remain stable on center/surface-style distance labels, while active docking approach UI may switch to `PORT` distance labeling for the current approach target.
