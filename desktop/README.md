# Desktop Client

Panda3D desktop client scaffold for Elite Chronicles.

## Purpose

- Run as a parallel first-party client beside the existing web client.
- Reuse the existing FastAPI backend contracts.
- Keep rendering, camera, controls, scene management, and local audio routing
  in the desktop runtime.

## Structure

- `pyproject.toml` desktop package metadata and dependencies
- `desktop_client/` runtime package
- `tests/` desktop-client tests and smoke scaffolding
- `assets/` desktop-client placeholder and future runtime assets

## Quick Start

Environment model:

- The desktop client is expected to use its own Python virtual environment.
- It does not share the backend environment by default.
- The backend and desktop runtime communicate over HTTP using `ELITE_API_URL`.

Create a local environment inside `desktop/` and install dependencies:

```bash
cd desktop
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .
```

Run the starter application:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main status
```

Register a desktop session:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main register --email pilot@example.com --username pilot --password pilot123
```

Run the Batch 12.5 smoke path:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main smoke
```

Bootstrap the desktop runtime from the saved session:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main run --headless
```

Open the first Panda3D cockpit shell if Panda3D is installed in the active
desktop environment:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main run --hud-theme acorn-classic
```

Run authoritative headless runtime ticks against `flight-snapshot` refresh
hints:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main run --headless --ticks 3
```

Render the presenter/debug scene payload that the future Panda3D layer can
consume:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main run --headless --ticks 1 --debug-scene --json
```

Render the retro-modern cockpit HUD spec with an arched lower console shell
and a comms-ready lower-right pane:

```bash
cd desktop
source .venv/bin/activate
python -m desktop_client.main run --headless --ticks 1 --debug-scene --debug-hud --json
```

Available HUD theme variants:

- `acorn-classic` default cream/olive shell inspired by the original Acorn
  Elite cockpit with grey-beveled gauges
- `circuit-teal` teal phosphor shell with the deeper arch profile
- `merchant-amber` warmer amber/brass shell with a heavier bezel and flatter
  cockpit lip

Typical local workflow:

1. Start the backend from the backend environment.
2. Start the desktop client from `desktop/.venv`.
3. Point the desktop client at the backend with `ELITE_API_URL` when needed.

## Environment

- `ELITE_API_URL`
  - Base URL for the FastAPI backend
  - Default: `http://localhost:8000`
- `ELITE_DESKTOP_SESSION_PATH`
  - Optional override for local session storage path
- `ELITE_DESKTOP_HTTP_TIMEOUT`
  - Optional HTTP timeout in seconds
  - Default: `10`
- `ELITE_DESKTOP_USER_AGENT`
  - Optional desktop user-agent override
  - Default: `EliteChroniclesDesktop/0.1`

## Current Status

- The desktop client now includes:
  - typed backend adapter models
  - session persistence helpers
  - login/register CLI commands
  - saved-session runtime bootstrap via `run --headless` using
    `players/me` plus authoritative `flight-snapshot` reads
  - snapshot-driven headless runtime ticks that only refresh local contacts
    and chart state when backend snapshot hints require it
  - a stable debug scene presenter that emits local-space entities for chart
    bodies, stations, and scanner contacts as a bridge into Panda3D
  - a desktop-only retro cockpit HUD presenter with live backend comms data,
    an arched lower console, and two shell themes for Panda3D inspection
  - a first Panda3D overlay shell that renders the cockpit HUD and refreshes
    it from authoritative runtime ticks while the window is open
  - a smoke command for:
    `login/register -> load player -> load ship -> undock -> flight snapshot -> local contacts/chart -> jump -> arrival snapshot -> dock -> trade`
  - deterministic smoke controls via `--ship-id` and `--destination-station-id`
- Panda3D scene ownership, full gameplay parity, and packaging remain follow-up
  work.
