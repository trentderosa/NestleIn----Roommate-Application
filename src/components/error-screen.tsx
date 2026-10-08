"use client";

import { catchError, type ErrorInfo } from "next/error";
import { BACKUP_KEY, STORAGE_KEY } from "@/lib/store-core";
import { actions } from "@/lib/store";

/**
 * Start over from the demo data, keeping a backup of whatever was saved.
 * Falls back to raw storage calls in case the store itself is what broke.
 */
export function startFresh() {
  try {
    actions.resetDemo();
    return;
  } catch {
    // Fall through to the manual path.
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      window.localStorage.setItem(
        BACKUP_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), reason: "crash recovery", raw }),
      );
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage is unusable; a reload still starts from the seed in memory.
  }
  window.location.reload();
}

/** Friendly recovery UI shared by every error boundary. */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <span className="text-5xl" aria-hidden>
        🧺
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-plum">Something got tangled</h1>
      <p className="mt-2 text-plum-soft">
        NestleIn hit a snag showing this screen. Try again, or start fresh with the demo house.
        Starting fresh keeps a backup of your current data on this device.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={retry}
          className="h-12 rounded-full bg-plum px-6 font-semibold text-cream shadow-lift"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            startFresh();
            retry();
          }}
          className="h-12 rounded-full bg-white px-6 font-semibold text-plum shadow-soft"
        >
          Start fresh
        </button>
      </div>
      <details className="mt-6 w-full text-left text-xs text-plum-soft">
        <summary className="cursor-pointer text-center">Technical details</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-cream-deep p-3 whitespace-pre-wrap">{message}</pre>
      </details>
    </div>
  );
}

/**
 * Error boundary for the app shell itself. `app/error.tsx` can't catch errors
 * thrown by the root layout's children (AppShell renders there), so the
 * layout wraps AppShell in this.
 */
export const AppErrorBoundary = catchError((_props: { children?: React.ReactNode }, { error, reset }: ErrorInfo) => (
  // `reset` re-renders the children in place; `retry` would refetch the
  // route, which can't fix a client-side render error.
  <ErrorScreen error={error} retry={reset} />
));
