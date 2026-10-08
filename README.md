# NestleIn

**Make shared living feel a little more together.**

NestleIn is a mobile-first roommate app for college students and recent grads. It makes splitting recurring chores and reminding each other about them feel warm, social, and lightweight, not like a corporate task tracker.

> This is a **frontend prototype**. All data is mock data held in the browser (persisted to `localStorage`). There's no backend, no accounts, and no real notifications yet.

## What's in the prototype

The demo household is **The Pink Palace**: Krystiana (you), Ellie, Katie, and Emery.

- **House Board** (`/`): greeting, "today at your place" summary with a progress ring and roommate status, plus running late / today / coming up / recently done sections and a house feed preview
- **Done ✨**: a sparkle burst, a toast with **Undo**, and an activity entry. Recurring chores spawn their next occurrence, and rotating chores move to the next roommate.
- **Nudge 👀**: a bottom sheet with **Sweet / Funny / Direct** tones, suggested messages you can shuffle or edit, a sent confirmation, a feed entry, and a 30-minute per-chore cooldown to prevent spam
- **Chores** (`/chores`): filters (today, upcoming, running late, done, all) kept in the URL, plus a "Just mine" toggle
- **Create / Edit chore** (`/chores/new`, `/chores/[id]/edit`): quick templates, category, notes, assignee (defaults to whoever has the lightest load), rotate-between-roommates with an order preview, due date/time with quick picks, recurrence (once, daily, weekly, every 2 weeks, monthly), and size/points
- **Roommates** (`/roommates`): profile cards with status, streak, open chores, done this week, points, on-time rate, and up next. Also an invite code, plus **prototype controls** to view the app as another roommate or reset the demo.
- **House feed** (`/activity`): activity grouped by day, with filters and emoji reactions
- Responsive layout: a bottom tab bar with a raised Add button on mobile, and a sidebar with a two-column board on desktop

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack, Cache Components) + React 19 + TypeScript
- Tailwind CSS v4 (design tokens in `src/app/globals.css`)
- shadcn/ui (Radix) for the bottom sheet, `sonner` for toasts, Lucide icons
- Vitest for unit tests of the pure household logic

## Getting started

Requires Node 20+ (developed on Node 24).

```bash
npm install
npm run dev
```

Open http://localhost:3000. Mobile is the primary target, so try it in your browser's device toolbar.

To start the demo over, use **Roommates → Reset demo data** or clear `localStorage`. Resetting keeps the previous data under `nestlein:household:backup`; unreadable data found on load is kept separately under `nestlein:household:recovery`, which a reset never overwrites.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Unit tests (Vitest) |
| `npm run validate` | All of the above except `dev`/`start`. Run before every commit. |

## Project structure

```
src/
  app/                    routes (thin pages that render screen components)
  components/             screens + shared UI (chore-card, nudge-sheet, chore-form, …)
  components/ui/          shadcn primitives
  lib/
    types.ts              domain model
    mock-data.ts          The Pink Palace seed (relative to "now")
    chores.ts             pure selectors + state transitions (tested)
    validate.ts           runtime validation of saved data (tested)
    store-core.ts         persistence: recovery, save status, cross-tab sync (tested)
    store.ts              React bindings: useHousehold(), useNow(), actions
    design.ts             accent + category maps
    time.ts               date helpers + friendly labels
```

## Current limitations

- No backend or auth. State lives in one browser and isn't shared between devices or roommates.
- Tabs in the same browser stay in sync, and an action in a stale tab is applied on top of the latest saved data. localStorage has no atomic compare-and-swap, so a lost race is detected and repaired afterwards (for a tab's writes from the last minute). A real backend replaces this.
- If storage is blocked or full, the app keeps working in memory, shows a banner saying changes aren't being saved, and keeps the unsaved changes so **Try again** can save them later. If they no longer fit another tab's newer data, it says so instead of saving.
- Nudges are recorded in the feed only. No push, email, or SMS.
- "You" is switched manually (Roommates → prototype controls).
- Seed dates are generated when the demo first loads, so a long-lived demo slowly drifts. Reset to refresh it.
- Light theme only.

## Future plans

See [PRODUCT.md](PRODUCT.md#future-roadmap). In short: real accounts and households (likely Supabase), invites, push notifications for nudges, smarter fair-share rotation, and a shared shopping/supplies list.

The data layer is built to be swapped out. Keep the `actions` signatures in `src/lib/store.ts` and back them with API calls, using the pure functions in `src/lib/chores.ts` for optimistic updates.
