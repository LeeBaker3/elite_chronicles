# UI Foundations Migration Notes

Date: 2026-02-13  
Owner: Frontend Engineering (Lee)

## Scope Audited

- `frontend/src/app/page.tsx`
- `frontend/src/app/page.module.css`
- `frontend/src/components/ui/Tooltip.tsx`
- `frontend/src/components/ui/Tooltip.module.css`
- `frontend/src/components/ui/ToastProvider.tsx`
- `frontend/src/components/ui/ToastProvider.module.css`
- `frontend/src/components/ui/DataState.tsx`
- `frontend/src/components/ui/DataState.module.css`

## Migration Summary

- Tooltip clarifications are centralized through `Tooltip`.
- Status flashes and recoverable errors are routed through `ToastProvider`.
- Data-panel rendering now distinguishes `loading` / `empty` / `error` via `DataState`.
- Prior one-off empty-state block in `page.module.css` has been removed.

## Legacy Pattern Replacements

- Inline panel fallback text (`"Loading..."`, `"No ..."`, `"Unable to ..."`) → `DataState`.
- Ad-hoc recoverable error status text without action → toast with retry CTA.
- Per-control clarification text embedded near controls → `Tooltip` content.

## Exceptions (Documented)

- Domain visual indicators remain local to feature views by design:
  - Cargo readiness chip (`Ready` / `No Hold`) in market panel.
  - Auth session dialog actions (`Return`, `Switch account`, `Logout`).

These are intentional domain UI elements, not cross-app foundation primitives.

## Review Guardrails

- New data views should use `DataState` for load/empty/error cases.
- Recoverable async failures should use toasts with optional action CTA.
- Clarification copy belongs in `Tooltip`; required instructions stay inline.
- Any new one-off primitive requires an owner-tagged TODO in the touching PR.
