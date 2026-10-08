/**
 * Framework-free household store with localStorage persistence.
 *
 * The React bindings live in store.ts; this file holds the persistence logic
 * so it can be tested with a fake storage and several simulated tabs.
 *
 * ## Saved format
 * The storage key holds an envelope:
 *   { format, revision, writer, savedAt, state }
 * `revision` increases by one on every write, across all tabs. Data saved by
 * the first prototype (a bare HouseholdState) is still accepted as revision 0.
 *
 * ## Keeping tabs consistent
 * Every tab can write, and localStorage has no compare-and-swap. Three steps
 * keep one tab from overwriting another's newer changes:
 *
 * 1. Rebase: before applying an action, re-read storage. If another tab wrote
 *    a newer revision, adopt it first, so the action applies to the latest data
 *    instead of this tab's stale copy.
 * 2. Verify: after writing, read back. If storage now holds a *different
 *    tab's* write with the *same* revision, both tabs wrote on the same base
 *    and ours was overwritten. Apply the action again on top of theirs.
 * 3. Repair: when a `storage` event arrives, check what storage actually
 *    holds. If it's another tab's write at our last revision, we lost a race
 *    the verify step couldn't see. Apply our last action again on top of it.
 *
 * Re-applying only happens when storage proves our write was lost, so an
 * action is never applied twice to data that already includes it. (That
 * matters: toggling a reaction twice would undo it.) A newer revision always
 * builds on what was stored before it, so it is adopted as-is.
 *
 * Remaining limitation: only the most recent action per tab is kept for
 * repair. Two tabs firing several actions within the same few milliseconds
 * could still lose one. A real backend replaces this with server-side ordering.
 */
import { validateHouseholdState } from "./validate";
import type { HouseholdState } from "./types";

export const STORAGE_KEY = "nestlein:household";
export const BACKUP_KEY = "nestlein:household:backup";
const FORMAT = "nestlein/household";

/** The subset of the Web Storage API the store uses (easy to fake in tests). */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type Persistence =
  /** Last write reached storage. */
  | "saved"
  /** Storage can't be read or written at all (blocked, private mode). */
  | "unavailable"
  /** Storage works but the last write failed (usually: full). */
  | "failed";

export type Recovery = {
  /** Why saved data was rejected. */
  reason: string;
  /** Whether the rejected data was kept under BACKUP_KEY. */
  backedUp: boolean;
};

export type Snapshot = {
  state: HouseholdState;
  revision: number;
  persistence: Persistence;
  /** Set when saved data was unreadable and the store started fresh. */
  recovery: Recovery | null;
};

export type Transition = (state: HouseholdState) => HouseholdState;

type Envelope = {
  format: typeof FORMAT;
  revision: number;
  writer: string;
  savedAt: string;
  state: HouseholdState;
};

type ReadResult =
  | { kind: "empty" }
  | { kind: "unavailable" }
  | { kind: "ok"; state: HouseholdState; revision: number; writer: string | null }
  | { kind: "invalid"; raw: string; reason: string };

function parse(raw: string): ReadResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "invalid", raw, reason: "saved data isn't valid JSON" };
  }
  // Envelope (current format) or a bare state (first prototype).
  const isEnvelope =
    typeof data === "object" && data !== null && (data as { format?: unknown }).format === FORMAT;
  const env = data as Partial<Envelope>;
  if (isEnvelope && (!Number.isInteger(env.revision) || (env.revision as number) < 0)) {
    return { kind: "invalid", raw, reason: "revision must be a whole number" };
  }
  const result = validateHouseholdState(isEnvelope ? env.state : data);
  if (!result.ok) return { kind: "invalid", raw, reason: result.reason };
  return {
    kind: "ok",
    state: result.state,
    revision: isEnvelope ? (env.revision as number) : 0,
    writer: isEnvelope && typeof env.writer === "string" ? env.writer : null,
  };
}

export function createHouseholdStore({
  storage,
  seed,
  tabId,
  now = () => new Date(),
}: {
  /** null when storage can't be accessed at all. */
  storage: StorageLike | null;
  seed: () => HouseholdState;
  /** Unique per tab; marks which tab wrote a revision. */
  tabId: string;
  now?: () => Date;
}) {
  let snapshot: Snapshot | null = null;
  const listeners = new Set<() => void>();
  /** Our most recent write, kept so a lost race can be repaired. */
  let lastWrite: { revision: number; transition: Transition } | null = null;

  function read(): ReadResult {
    if (!storage) return { kind: "unavailable" };
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      return { kind: "unavailable" };
    }
    return raw === null ? { kind: "empty" } : parse(raw);
  }

  /** Keep rejected data so nothing is silently destroyed. */
  function backup(raw: string, reason: string): boolean {
    if (!storage) return false;
    try {
      storage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: now().toISOString(), reason, raw }));
      return true;
    } catch {
      return false;
    }
  }

  /** Write a revision; returns whether it reached storage. */
  function write(state: HouseholdState, revision: number): Persistence {
    if (!storage) return "unavailable";
    const envelope: Envelope = {
      format: FORMAT,
      revision,
      writer: tabId,
      savedAt: now().toISOString(),
      state,
    };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      return "saved";
    } catch {
      return "failed";
    }
  }

  function emit(next: Snapshot) {
    snapshot = next;
    listeners.forEach((l) => l());
  }

  function load(): Snapshot {
    const found = read();
    if (found.kind === "ok") {
      return { state: found.state, revision: found.revision, persistence: "saved", recovery: null };
    }
    const state = seed();
    if (found.kind === "unavailable") {
      return { state, revision: 0, persistence: "unavailable", recovery: null };
    }
    let recovery: Recovery | null = null;
    if (found.kind === "invalid") {
      recovery = { reason: found.reason, backedUp: backup(found.raw, found.reason) };
    }
    return { state, revision: 1, persistence: write(state, 1), recovery };
  }

  function getSnapshot(): Snapshot {
    if (!snapshot) snapshot = load();
    return snapshot;
  }

  /**
   * Apply a transition to the latest data and save it.
   * Returns the resulting state (unchanged if the transition was a no-op).
   */
  function update(transition: Transition): HouseholdState {
    let current = getSnapshot();

    // 1. Rebase onto anything newer another tab saved.
    const latest = read();
    if (latest.kind === "ok" && latest.revision > current.revision) {
      current = { ...current, state: latest.state, revision: latest.revision };
    }

    const next = transition(current.state);
    if (next === current.state) {
      if (current !== snapshot) emit(current);
      return current.state;
    }

    let revision = current.revision + 1;
    let state = next;
    let persistence = write(state, revision);

    // 2. Verify: did another tab overwrite this exact revision?
    if (persistence === "saved") {
      const check = read();
      if (check.kind === "ok" && check.revision === revision && check.writer !== tabId) {
        state = transition(check.state);
        revision += 1;
        persistence = write(state, revision);
      } else if (check.kind === "ok" && check.revision > revision) {
        // Someone already built on our write; take theirs.
        state = check.state;
        revision = check.revision;
      }
    }

    lastWrite = { revision, transition };
    emit({ ...current, state, revision, persistence });
    return state;
  }

  /**
   * Handle a `storage` event (fired in *other* tabs when one tab writes).
   * Pass `event.key` and `event.newValue`.
   */
  function handleStorageEvent(key: string | null) {
    if (key !== STORAGE_KEY) return;
    // Decide from what storage holds now, not the event payload: events can
    // arrive after newer writes have already replaced their value.
    const stored = read();
    // Garbage or a cleared key from another tab is ignored; our next write
    // replaces it.
    if (stored.kind !== "ok") return;
    const current = getSnapshot();

    // 3. Repair a lost race: storage holds another tab's write at our revision.
    if (lastWrite && stored.revision === lastWrite.revision && stored.writer !== tabId) {
      const repair = lastWrite.transition;
      lastWrite = null;
      emit({ ...current, state: stored.state, revision: stored.revision });
      update(repair);
      return;
    }

    if (stored.revision > current.revision) {
      emit({ ...current, state: stored.state, revision: stored.revision });
    }
  }

  /** Try saving the current state again (e.g. after the user freed space). */
  function retrySave(): Persistence {
    const current = getSnapshot();
    const latest = read();
    if (latest.kind === "ok" && latest.revision > current.revision) {
      // Another tab saved newer data meanwhile; adopt it rather than overwrite.
      emit({ ...current, state: latest.state, revision: latest.revision, persistence: "saved" });
      return "saved";
    }
    const revision = current.revision + 1;
    const persistence = write(current.state, revision);
    emit({ ...current, revision: persistence === "saved" ? revision : current.revision, persistence });
    return persistence;
  }

  /**
   * Start over from the seed. Whatever is in storage now is backed up first,
   * so a reset from the error screen never destroys data outright.
   */
  function reset(): void {
    const current = read();
    if (current.kind === "ok") {
      backup(JSON.stringify(current.state), "reset by user");
    } else if (current.kind === "invalid") {
      backup(current.raw, current.reason);
    }
    const revision = Math.max(snapshot?.revision ?? 0, current.kind === "ok" ? current.revision : 0) + 1;
    const state = seed();
    lastWrite = null;
    emit({ state, revision, persistence: write(state, revision), recovery: null });
  }

  function dismissRecovery() {
    const current = getSnapshot();
    if (current.recovery) emit({ ...current, recovery: null });
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { getSnapshot, subscribe, update, handleStorageEvent, retrySave, reset, dismissRecovery };
}

export type HouseholdStore = ReturnType<typeof createHouseholdStore>;
