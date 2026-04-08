# Batch 12.5 Contract-Test Matrix

Date: 2026-03-12  
Owner: Backend + Frontend + Desktop

Status update 2026-03-13:

- Priority rows 1-5 now have explicit automated backend or desktop-adapter
  coverage.
- The long-term flight boundary has improved since this matrix was drafted:
  backend-owned `flight-snapshot`, jump-plan, navigation-intent, and
  `flight-control` are the preferred shared direction.
- Legacy `flight-state` and `position-sync` remain transitional and should not
  be expanded as shared desktop-facing contracts.

## Objective

- Define the minimum shared-contract checks that must pass before desktop
  client implementation expands beyond scaffold work.
- Catch backend drift and hidden web-only assumptions before they are copied
  into the desktop runtime.
- Keep the backend authoritative while allowing desktop-favoring client
  decisions and web compatibility layers where needed.

## Scope

- In scope:
  - auth/session contract behavior,
  - player bootstrap,
  - ship bootstrap and core telemetry,
  - local contacts snapshot behavior,
  - local chart snapshot behavior,
  - flight-related error and status transitions that currently create the most
    client risk.
- Out of scope:
  - story and mission contracts for the first desktop slice,
  - packaging and installer checks,
  - renderer-specific performance tests.

## Test Matrix

| Area | Endpoint / Surface | Required Cases | Assertions | Existing Evidence |
|---|---|---|---|---|
| Auth register | `POST /api/auth/register` | success; duplicate-email rejection; starter-session issuance | Returns token and `user_id`; creates usable starter state; duplicate identity does not silently overwrite user data | `backend/tests/test_auth_starter_ship.py` |
| Auth login | `POST /api/auth/login` | success; invalid-credentials rejection; legacy-user starter-ship backfill still occurs | Returns token and `user_id`; invalid credentials return `401`; login preserves starter-ship/bootstrap expectations | `backend/tests/test_auth_starter_ship.py` |
| Auth on protected routes | any protected endpoint, anchored on `GET /api/players/me` | missing auth; malformed bearer header; invalid token; expired/revoked session | Returns consistent `401` semantics and stable error-envelope/detail behavior suitable for both clients | `backend/app/api/deps.py`, `backend/tests/test_players_ships_markets.py` |
| Player bootstrap | `GET /api/players/me` | authenticated success; unauthorized rejection | Returns persistent commander identity and baseline state fields; unauthorized returns `401` | `backend/tests/test_players_ships_markets.py` |
| Ship bootstrap | `GET /api/ships/{ship_id}` | authenticated owner success; non-owner rejection; bootstrap telemetry fields present | Returns stable ship identity/telemetry fields needed by both clients, including render-facing fields already exposed by backend | `backend/tests/test_players_ships_markets.py` |
| Local contacts | `GET /api/ships/{ship_id}/local-contacts` | success while in space; contact identity formatting; target/contact distances after transfer; snapshot metadata present | Contact IDs preserve `<type>-<id>` format; payload includes `snapshot_version` and `snapshot_generated_at`; distances and contact types remain stable | `backend/tests/test_players_ships_markets.py`, `backend/tests/test_systems_local_chart.py` |
| Scanner observability | `POST /api/ships/{ship_id}/scanner-selection` | successful logging from selected visible contact set | Accepts shared scanner-selection payload shape and returns a stable success contract for desktop/web adapters | `backend/tests/test_players_ships_markets.py` |
| Local chart | `GET /api/systems/{system_id}/local-chart` | success; contract version present; mutable state present; target metadata exposed; snapshot metadata present | Payload includes `system.contract_version`, `mutable_state`, chart body ordering/identity invariants, and snapshot compatibility fields | `backend/tests/test_systems_local_chart.py` |
| Snapshot compatibility | combined `local-contacts` + `local-chart` reads | matching-snapshot happy path; incompatible snapshot detection at adapter layer | Backend exposes enough snapshot metadata for both clients to reject mixed local-space snapshots without inventing client-specific semantics | `backend/README.md`, frontend normalization logic in `frontend/src/app/page.tsx` |
| Dock / undock baseline | `POST /api/ships/{ship_id}/undock`; `POST /api/ships/{ship_id}/dock` | undock success; dock success; out-of-range dock rejection | Status transitions are authoritative and stable; rejection remains `409` with actionable error messaging | `backend/tests/test_players_ships_markets.py`, `backend/README.md` |
| Jump baseline | `POST /api/ships/{ship_id}/jump` | success when clear; `409` on blocked clearance or invalid state | Jump remains backend-authoritative; arrival state and follow-up docking flow remain consistent for both clients | `backend/tests/test_players_ships_markets.py`, `backend/README.md` |
| Flight snapshot | `GET /api/ships/{ship_id}/flight-snapshot` | success in docked/in-space states; suggested poll interval present; local snapshot metadata exposed; refresh hints present | Desktop/web can bootstrap and refresh local-space state from one authoritative snapshot surface without inventing client semantics | `backend/tests/test_players_ships_markets.py`, `desktop/tests/test_network_client.py` |
| Flight control | `POST /api/ships/{ship_id}/flight-control` + `GET /api/ships/{ship_id}/flight-snapshot` | valid persisted control update; docked rejection; snapshot-driven motion advance | Manual flight control stays backend-owned and production-tunable; clients send bounded intent/control state rather than absolute browser-owned position writes | `backend/tests/test_players_ships_markets.py`, `backend/README.md` |
| Flight state persistence | `POST /api/ships/{ship_id}/flight-state` + `GET /api/ships/{ship_id}` | valid persisted update; invalid phase `422`; normalization on dock/refuel/manual-arrived cases | Current low-level surface is stable enough to wrap behind adapters without clients redefining phase meaning | `backend/tests/test_players_ships_markets.py` |
| Position sync guardrails | `POST /api/ships/{ship_id}/position-sync` | in-space success; docked rejection `409` | Current low-level surface stays explicitly provisional and guarded; desktop must treat it as adapter-internal, not final contract truth | `backend/tests/test_players_ships_markets.py` |
| Local targeting | `POST /api/ships/{ship_id}/local-target` | lock success; transfer success; station/planet target handling | Returns authoritative ship state updates and preserves shared local-target identity semantics | `backend/tests/test_players_ships_markets.py`, `backend/tests/test_systems_local_chart.py` |

## Priority Order

1. Auth and `players/me`
2. `ships/{ship_id}`
3. `local-contacts`
4. `local-chart`
5. Dock / undock / jump baseline
6. Flight snapshot / local targeting / intent-oriented flight surface
7. Legacy flight-state / position-sync compatibility only

## Rules for Desktop Implementation

- Desktop adapters may wrap or normalize payloads, but the matrix above is the
  minimum shared behavior they are allowed to depend on.
- If a check fails because a client was relying on undocumented semantics,
  either:
  - promote the rule into backend/core docs and tests, or
  - keep it explicitly adapter-local and do not treat it as shared contract.
- `flight-snapshot` and backend-owned control/intents are the preferred shared
  cross-client direction.
- `flight-state` and `position-sync` are transitional surfaces:
  - allowed for short-term integration behind adapters,
  - not approved as the long-term desktop-facing contract boundary.

## Recommended Automation Layout

- Backend contract tests:
  - keep authoritative endpoint/status checks in `backend/tests/`.
- Web adapter checks:
  - add targeted frontend tests only for normalization and snapshot
    compatibility logic that is not already enforced server-side.
- Desktop adapter checks:
  - add unit tests under `desktop/tests/` for payload normalization, auth
    handling, and any temporary wrapping of lower-level flight endpoints.

## Exit Criteria

- The matrix has explicit automated coverage or an assigned follow-up test for
  every row above.
- Desktop scaffold work does not proceed into parity features until priority
  rows 1-5 are covered.
- Any use of provisional low-level flight endpoints in desktop code is tracked
  as technical debt against the long-term intent-oriented contract direction.
