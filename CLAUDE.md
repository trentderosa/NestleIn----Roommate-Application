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

Also check changed screens in a browser at mobile width (~375px) and desktop, and look for console errors.

## Git workflow (required)

The canonical local repo is **`C:\Users\Trent\OneDrive\NestleIn - App`**. Before any work, confirm you're inside it (`git rev-parse --show-toplevel`).

Treat `main` as a **protected production branch**, even though GitHub technically allows direct commits and merges. Before every git operation, ask yourself: *could this directly change `main`?* If yes, or if you're unsure, don't do it. Use a branch and a PR instead.

### For every change

1. Check the current branch. If you're on `main`, create a branch **before** editing any files.
2. Start from the latest `main`: `git fetch origin`, `git switch main`, `git pull --ff-only origin main`.
3. Create a branch named for the work:
   - `feat/<thing>` for features (e.g. `feat/nudge-interaction`)
   - `fix/<thing>` (e.g. `fix/mobile-navigation`)
   - `refactor/<thing>`
   - `style/<thing>`
   - `docs/<thing>`
   - `chore/<thing>` (for config and tooling)

   Never use vague names like `changes`, `update`, `work`, `test`, or `new-branch`.
4. Make the requested changes only on that branch.
5. Run validation (above). Everything must pass.
6. Commit with clear messages.
7. Push the branch (`git push -u origin <branch>`).
8. Open a PR targeting `main` (`gh pr create --base main`).
9. Report the branch name, a short summary, the validation results, and the PR URL.
10. **STOP.**

This applies to every kind of change: feature, fix, refactor, styling, docs, and config.

### Review

Every PR goes through a separate **Codex code review** before it can be merged.

If the user sends review feedback on an existing PR:

1. Stay on that PR's existing branch. Don't open a new PR unless the user explicitly asks.
2. Make the fixes, re-run validation, then commit and push to the same branch. The PR updates automatically.
3. Report the updated validation results and the same PR URL.
4. **STOP.**

### Merging: only the user merges

Claude never merges. The user merges every PR themselves, after the Codex review.

Never:
- merge a PR, by any method (merge, squash, rebase), or enable auto-merge
- push to `main`, commit on `main`, or otherwise bypass the PR workflow
- delete a branch before its PR is reviewed and merged
- force-push or rewrite shared history

None of these rules relax because checks pass, the change is tiny, the PR has no conflicts, GitHub says it's ready to merge, or the user approves the PR. Approval means the user will merge it. Never say work was merged unless the user merged it.

Flow: branch from latest `main` → implement → validate → commit → push → PR → **STOP** → Codex review → fixes on the same branch → **STOP** → the user merges.
