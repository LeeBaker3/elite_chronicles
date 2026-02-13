This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Testing

Run primitive unit tests:

```bash
npm run test
```

Current primitive test coverage includes:
- `Tooltip`
- `ToastProvider`
- `DataState`

## UI Primitive: Tooltip

Use the shared Tooltip primitive for short clarifications on controls.

```tsx
import { Tooltip } from "../components/ui/Tooltip";

<Tooltip
	content="Fetch the latest inventory and prices for this station."
	placement="top"
	delay={180}
>
	<button type="button">Refresh</button>
</Tooltip>
```

Notes:
- Keep tooltip text concise and supplementary.
- For required instructions, use inline helper text instead of tooltip-only guidance.
- Tooltip supports `content`, `placement`, `delay`, `disabled`, and `maxWidth`.

## UI Primitive: Toast

The app uses a global toast provider mounted at app root.

```tsx
import { useToast } from "../components/ui/ToastProvider";

const { showToast } = useToast();

showToast({ message: "Trade cleared successfully.", variant: "success" });
showToast({ message: "Network failure. Check API availability.", variant: "error" });
showToast({
	message: "Market uplink failed.",
	variant: "error",
	actionLabel: "Retry",
	onAction: () => {
		// re-run recoverable action
	},
});
```

Notes:
- Variants: `success`, `info`, `warning`, `error`.
- Optional `durationMs`; when omitted, default timeout is applied.
- Optional CTA: `actionLabel` + `onAction` for recoverable errors.
- Dedupes identical active messages and limits visible stack size.

## UI Primitive: DataState

Use the shared DataState primitive to keep loading/empty/error handling consistent.

```tsx
import { DataState } from "../components/ui/DataState";

<DataState
	variant="empty"
	title="No inventory loaded"
	description="Select a station or refresh to pull market data."
	actionLabel="Refresh"
	onAction={() => {
		void fetchInventory({ silent: false });
	}}
/>
```

Notes:
- Variants: `loading`, `empty`, `error`.
- Include concise title + explanation; add one primary action for recoverable states.
- Use this for data panels (market inventory, cargo, story timeline) instead of one-off text blocks.

## Accessibility Expectations

- `Tooltip`: keeps semantic relation via `aria-describedby` and supports keyboard escape/blur behavior.
- `Toast`: uses live regions (`status`/`alert`) and keeps action buttons keyboard reachable.
- `DataState`: uses `status` for passive states and `alert` for error states with optional action.

## UI Foundations Migration Notes

- See `../prd/ui-foundations-migration-notes.md` for audit results, replacement mapping, and documented exceptions.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
