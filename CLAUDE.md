@AGENTS.md

# NestleIn: notes for Claude Code

NestleIn is a mobile-first roommate chore app for college students and recent grads (primary audience: women ages 18–26). It's a **frontend prototype**. All data is mock data in client state.

## Before you change things

- **Read `PRODUCT.md` before any significant product or design change.** It holds the vision, audience, voice, and terminology.
- Keep the brand direction: warm cream backgrounds, lilac / blush / coral / butter / mint / sky accents, plum text, rounded cards, friendly microcopy ("Nudge", "Done ✨", "your place"). Don't make it look like Jira, Teams, or a SaaS dashboard, and don't make it childish.
- **Design mobile first.** Check every UI change at ~375px wide before desktop.
- **Do not add a backend** (Supabase, Firebase, auth, a database, notifications) unless explicitly asked.
- Avoid unnecessary architecture: no Redux, no repository layers, no premature abstraction. Prefer small, typed, readable components.

## Where things live

- `src/lib/types.ts`: domain model (the contract a future database must satisfy)
- `src/lib/mock-data.ts`: The Pink Palace seed, generated relative to "now"
- `src/lib/chores.ts`: **pure** selectors and state transitions (unit tested in `chores.test.ts`)
- `src/lib/store.ts`: client store (`useSyncExternalStore` + localStorage) exposing `useHousehold()` and `actions`. This is the layer to swap for a real backend.
- `src/lib/design.ts`: accent and category maps (full Tailwind class strings, no interpolation)
- `src/app/globals.css`: design tokens (`@theme`)
- `src/components/`: app components; `src/components/ui/` holds shadcn primitives

Household data is `null` during server render and hydration, so screens must render a skeleton when `useHousehold()` returns null.

## Validation (run before every commit)

```bash
npm run validate   # lint + typecheck + unit tests + production build
```

Also check changed screens in a browser at mobile width and look for console errors.

## Git workflow (required)

`main` is **protected**. Treat it that way even though GitHub branch protection isn't enabled.

1. Do every feature, fix, or phase on a dedicated branch (`feature/<name>`, `fix/<name>`).
2. Implement, then run `npm run validate`. Everything must pass.
3. Commit with clear messages, in small, understandable commits.
4. Push the branch and open a PR targeting `main` (`gh pr create --base main`).
5. Give the user the PR URL, then **STOP**.

Never:
- push feature work directly to `main`
- merge a PR yourself, or enable auto-merge
- delete a feature branch before its PR is reviewed and merged
- force-push or rewrite shared history without inspecting it and asking first

PRs go through a separate Codex code review. If the user sends review findings:
1. Stay on the **existing** PR branch. Don't open a new PR unless asked.
2. Fix the issues, re-run `npm run validate`, then commit and push to the same branch.
3. Summarize what changed, then **STOP** and wait for another review.

Merge only when the user explicitly says that **the Codex review passed and they approve the merge**.

Flow: feature branch → implement → validate → commit → push → PR → STOP → Codex review → fixes if needed → review passes → explicit approval → merge.
