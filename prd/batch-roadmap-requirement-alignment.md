# PRD Requirement-to-Batch Alignment Matrix

Date: 2026-02-25  
Owner: Product + Engineering

## Purpose

Provide a single checklist proving `prd/prd.md` requirements are mapped to batch plans.

## PRD Coverage Matrix

| PRD Area | PRD Sections | Primary Batch Coverage |
|---|---|---|
| Authentication and account management | 5.1, 7.1 | Batch 01, Batch 20, Batch 21 |
| Player and ship persistence | 5.2, 5.3, 5.13 | Batch 01, Batch 04, Batch 08, Batch 10 |
| Jump mechanics and travel risk | 5.3.1, 7.2, 7.10 | Batch 10, Batch 11, Batch 16 |
| Tactical scanner range and scale | 5.3.2 | Batch 09 |
| Space combat | 5.4, 6.7 | Batch 08, Batch 13, Batch 19 |
| Ship upgrades and archetypes | 5.5 | Batch 07, Batch 16 |
| Economy and trading dynamics | 5.6, 9 | Batch 02, Batch 16, Batch 17 |
| Stations and location identity | 5.7, Appendix A | Batch 05, Batch 06, Batch 07, Batch 16 |
| Text adventure and AI confirmation | 5.8, 8 | Batch 03, Batch 10, Batch 18, Batch 20 |
| Communication systems | 5.9, 6.8, 7.6 | Batch 03, Batch 14 |
| Multiplayer state safeguards (conflict/idempotency) | 6.10, 7.8, 7.9, 11 | Batch 14, Batch 19, Batch 21 |
| Sound effects and audio event mapping | 5.14, 6.10 | Batch 12, Batch 13, Batch 14, Batch 15, Batch 16, Batch 17, Batch 18, Batch 19, Batch 20, Batch 21 |
| Missions and reputation | 5.10, 7.4 | Batch 03, Batch 17, Batch 18 |
| Admin panel and governance | 5.11, 7.7 | Batch 02, Batch 03, Batch 20 |
| Logging and error handling | 5.12, 6.9, 7.9 | Batch 02, Batch 12, Batch 20, Batch 21 |
| Non-functional requirements | 11 | Batch 11, Batch 14, Batch 20, Batch 21 |
| Analytics and success metrics | 12 | Batch 21 |
| Risks and mitigations hardening | 13 | Batch 13, Batch 20, Batch 21 |
| Delivery phase completion and acceptance closure | 15, 16 | Batch 14–21 sequence + Batch 21 closure |

## Remaining Gaps Check (2026-02-25)

- No uncovered PRD major section identified at planning level.
- Remaining risk is execution status, not mapping coverage (several batches still `Planned`/`In Progress`).
- SFX implementation planning is now standardized in template and explicit in Batch 14 through Batch 21.

## Maintenance Rule

- Whenever a new PRD section is added or changed, update this matrix in the same PR.
