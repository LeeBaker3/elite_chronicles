# Core System Design Index

This index maps long-lived system design docs to PRD sections and active
batch ownership.

Baseline note:
- Current-state starter sections were seeded through Batches 01-11 on
  2026-03-04.
- Code-truth verification snapshot is recorded in
  `implementation-audit-2026-03-04.md`.

| Core System | Design Doc | PRD Sections | Primary Batches |
|---|---|---|---|
| Accounts and Authentication | `core-auth-design.md` | 5.1, 6.1, 7.1, 7.8, 7.9 | 01, 20, 21 |
| Player and State Persistence | `core-player-state-design.md` | 5.2, 6.1, 6.3, 5.13 | 01, 19, 21 |
| Ship Flight and Navigation | `core-flight-navigation-design.md` | 5.3, 5.3.1, 5.3.2, 7.2 | 07, 08, 09, 10, 11 |
| Combat and Recovery | `core-combat-recovery-design.md` | 5.4, 5.5, 15.15 | 13, 19 |
| Economy and Markets | `core-economy-market-design.md` | 5.6, 6.4, 7.3, 9, 15.13 | 02, 16, 17 |
| Stations and Locations | `core-stations-locations-design.md` | 5.7, 6.2 | 07, 16 |
| Story and AI Interaction | `core-story-ai-design.md` | 5.8, 6.6, 8 | 18 |
| Communications and Messaging | `core-comms-design.md` | 5.9, 7.6 | 03, 14 |
| Missions, Factions, Reputation | `core-missions-factions-reputation-design.md` | 5.10, 6.5, 7.4 | 04, 17, 18 |
| Admin, Moderation, Observability | `core-admin-ops-design.md` | 5.11, 5.12, 7.7, 11, 13 | 20, 21 |
| Politics-Economy Coupling | `integration-politics-economy-design.md` | 5.6, 5.10, 9, 15.13 | 17 |

## Usage Rules

- Every batch plan in `prd/` that changes behavior must link to at least one
  design doc in this index.
- If a new core system emerges, add a new row and create the design doc in
  the same PR.
