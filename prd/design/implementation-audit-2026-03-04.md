# Implementation Audit Snapshot (2026-03-04)

This document records the current implementation state verified from code,
to complement batch-plan-derived starter sections.

## Scope and Method

- Backend source audited under `backend/app/api/`, `backend/app/models/`,
  and router wiring in `backend/app/api/router.py`.
- Frontend source audited in `frontend/src/app/page.tsx` for active API usage.
- Goal: confirm implemented behavior for core systems and identify immediate
  doc-to-code gaps.

## Verified Platform Baseline

- API root: `/api` mounted in `backend/app/main.py`.
- Router modules enabled: auth, players, ships, systems, stations, markets,
  missions, story, comms, admin.
- Error envelope in place from global handlers with
  `{ error: { code, message, details, trace_id } }`.

## Core Systems: Code-Truth Status

### 1) Accounts and Authentication

- Implemented backend endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
- Frontend actively calls both auth endpoints.
- Status: **Implemented (MVP)**.

### 2) Player and State Persistence

- Implemented backend endpoint:
  - `GET /api/players/me`
- Persistent state models present for user/session/ship/cargo and related
  world entities.
- Frontend actively calls `GET /api/players/me`.
- Status: **Implemented (MVP)**.

### 3) Ship Flight and Navigation

- Implemented backend ship endpoints include:
  - `GET /api/ships/{ship_id}`
  - `GET /api/ships/{ship_id}/local-contacts`
  - `GET /api/ships/{ship_id}/operations`
  - `POST /api/ships/{ship_id}/scanner-selection`
  - `POST /api/ships/{ship_id}/dock`
  - `POST /api/ships/{ship_id}/undock`
  - `POST /api/ships/{ship_id}/refuel`
  - `POST /api/ships/{ship_id}/repair`
  - `POST /api/ships/{ship_id}/recharge`
  - `POST /api/ships/{ship_id}/jump`
  - `POST /api/ships/{ship_id}/local-target`
  - `POST /api/ships/{ship_id}/collision-check`
  - `POST /api/ships/{ship_id}/crash-recovery`
  - `POST /api/ships/{ship_id}/flight-state`
  - `POST /api/ships/{ship_id}/position-sync`
  - `GET /api/ships/{ship_id}/cargo`
- Implemented backend systems endpoints include:
  - `GET /api/systems/galaxy/systems`
  - `GET /api/systems/galaxy/systems/{system_id}/overview`
  - `GET /api/systems/{system_id}/local-chart`
- Frontend actively calls all major flight/navigation endpoints above.
- Status: **Implemented (advanced MVP)**.

### 4) Combat and Recovery

- Implemented backend endpoints:
  - `POST /api/ships/{ship_id}/collision-check`
  - `POST /api/ships/{ship_id}/crash-recovery`
- Ship model includes persisted safe-state and crash recovery fields.
- Frontend actively calls collision-check and displays flow controls.
- Status: **Implemented (MVP)**.

### 5) Economy and Markets

- Implemented backend endpoints:
  - `GET /api/markets/{system_id}/summary`
  - `POST /api/markets/tick`
- Implemented trade endpoint:
  - `POST /api/stations/{station_id}/trade`
- Frontend actively calls summary/tick and station trade.
- Status: **Implemented (MVP)**.

### 6) Stations and Locations

- Implemented backend endpoints:
  - `GET /api/stations`
  - `GET /api/stations/{station_id}/inventory`
  - `POST /api/stations/{station_id}/trade`
- Frontend actively calls station list/inventory/trade.
- Status: **Implemented (MVP)**.

### 7) Story and AI Interaction

- Implemented backend endpoints:
  - `GET /api/story/sessions`
  - `POST /api/story/start/{location_id}`
  - `POST /api/story/interpret`
  - `POST /api/story/confirm`
  - `POST /api/story/proceed`
- Frontend actively calls all story endpoints above.
- Status: **Implemented (MVP)**.

### 8) Communications and Messaging

- Implemented backend endpoints:
  - `GET /api/comms/channels`
  - `GET /api/comms/channels/{channel_id}/messages`
  - `POST /api/comms/channels/{channel_id}/messages`
  - `POST /api/comms/channels/{channel_id}/read`
- Comms message and read-state models are present.
- Frontend actively calls channel list/messages/read/send flows.
- Status: **Implemented (MVP)**.

### 9) Missions, Factions, Reputation

- Implemented backend endpoints:
  - `POST /api/missions/dev/dummy`
  - `GET /api/missions/available`
  - `POST /api/missions/{mission_id}/accept`
  - `POST /api/missions/{mission_id}/complete`
  - `POST /api/missions/{mission_id}/abandon`
  - `GET /api/missions/me`
- Mission assignment and reputation models are present.
- Frontend actively calls missions list/accept/complete/abandon/dummy.
- Status: **Implemented (MVP)**.

### 10) Admin, Moderation, Observability

- Implemented backend endpoints:
  - `GET /api/admin/users`
  - `PATCH /api/admin/users/{user_id}`
  - `GET /api/admin/logs`
  - `GET /api/admin/starter-location`
- Frontend actively calls users/logs and patches user status/role.
- Status: **Implemented (MVP)**.

## Immediate Gaps and Follow-Ups

1. Design docs were seeded from batch plans (01-11); this snapshot confirms
   broad implementation is now beyond that baseline in several systems.
2. Frontend API integration is currently concentrated in one large file
   (`frontend/src/app/page.tsx`), which raises maintainability risk for future
   cross-batch parity changes.
3. Next documentation pass should copy relevant verified facts from this
   snapshot into each `core-*.md` as versioned changelog updates.

## Evidence Files

- `backend/app/main.py`
- `backend/app/api/router.py`
- `backend/app/api/auth.py`
- `backend/app/api/players.py`
- `backend/app/api/ships.py`
- `backend/app/api/systems.py`
- `backend/app/api/stations.py`
- `backend/app/api/markets.py`
- `backend/app/api/missions.py`
- `backend/app/api/story.py`
- `backend/app/api/comms.py`
- `backend/app/api/admin.py`
- `backend/app/models/`
- `frontend/src/app/page.tsx`