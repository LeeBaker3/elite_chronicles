# UI Foundations Checklist (Post-Prototype)

This checklist defines baseline UI system requirements before broad feature expansion.

## Tracking

- Implementation board: [ui-foundations-implementation-plan.md](ui-foundations-implementation-plan.md)
- GitHub phases:
	- [Issue #1: Tooltip primitive](https://github.com/LeeBaker3/elite_chronicles/issues/1)
	- [Issue #2: Toast system](https://github.com/LeeBaker3/elite_chronicles/issues/2)
	- [Issue #3: Loading/empty/error states](https://github.com/LeeBaker3/elite_chronicles/issues/3)
	- [Issue #4: Audit + cleanup](https://github.com/LeeBaker3/elite_chronicles/issues/4)

## 1) Tooltip System

### Contract
- [x] One shared tooltip component API is defined and documented.
- [x] API supports: `content`, `placement`, `delay`, `disabled`, and optional `maxWidth`.
- [x] Trigger supports hover, focus, and touch fallback behavior.

### Accessibility
- [x] Tooltip uses semantic relationship (`aria-describedby`) between trigger and content.
- [x] Tooltip is keyboard reachable via focusable trigger.
- [x] Escape/blur behavior is defined and consistent.
- [x] Tooltip content is concise and never the only source of critical information.

### UX Rules
- [x] Tooltips are used for clarifications, not primary instructions.
- [x] If content is required for task completion, use inline helper text instead.
- [x] Delay defaults are defined (show/hide) to avoid flicker.

### Visual Consistency
- [x] Shared tooltip tokens are used (spacing, radius, border, text size, z-index).
- [x] Tooltip theming supports dark mode tokens from design system.
- [x] No one-off tooltip styles are allowed in feature components.

## 2) Toast/Notification System

### Contract
- [x] One global toast provider exists at app root.
- [x] API supports `success`, `info`, `warning`, `error` variants.
- [x] API supports configurable timeout and optional persistent mode.

### Behavior
- [x] Toast stack position is standardized.
- [x] Concurrency rules are defined (max toasts, dedupe behavior).
- [x] Retry/action CTA pattern is defined for recoverable errors.

### Accessibility
- [x] Uses polite/assertive live regions by severity.
- [x] Keyboard focus behavior is defined for actionable toasts.

## 3) Empty States

### Contract
- [x] Empty state pattern includes: title, short explanation, and next action.
- [x] Distinguish `loading`, `empty`, and `error` states in each data view.
- [x] Empty state copy standards are documented (short, actionable, neutral tone).

### Reusability
- [x] Shared EmptyState component exists for common layouts.
- [x] Variant examples include market list, story list, and cargo panel.

## 4) Delivery Standards

### Engineering
- [x] Shared components live in a common UI module folder.
- [x] Unit tests exist for tooltip/toast/empty-state primitives.
- [x] Lint rules or review checklist rejects duplicate ad-hoc implementations.

### Documentation
- [x] Usage examples are documented for each primitive.
- [x] Accessibility expectations are documented per primitive.
- [x] Migration guide exists for replacing temporary prototype UI behaviors.

## 5) MVP Rollout Plan

- [x] Phase 1: Ship tooltip primitive and convert top 3 high-confusion controls.
- [x] Phase 2: Add toast provider and convert all status flash messages.
- [x] Phase 3: Convert all data panels to standardized loading/empty/error states.
- [x] Phase 4: Audit for one-off patterns and remove legacy implementations.
