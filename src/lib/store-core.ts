/**
 * Framework-free household store with localStorage persistence.
 *
 * The React bindings live in store.ts; this file holds the persistence logic
 * so it can be tested with a fake storage and several simulated tabs.
 *
 * ## Model
 * - `base`: the last household state known to be in storage, with its
 *   revision and identity (see "Saved format").
 * - `pending`: this tab's actions that haven't been written yet (a write
 *   failed, or storage is unavailable).
 * - What the UI shows is `pending` replayed on top of `base`. Only a
 *   successful write advances `base`, so a failed write never pretends to
 *   have produced a new saved revision.
 *
 * ## Actions
 * Every change is an Action with a stable id. Ids it generates come from
 * `idsFor(action.id)`, so replaying the action creates the *same* chores and
 * events, and Undo records made the first time stay valid. Actions are also
 * written to be safe to apply twice (completing a done chore, re-adding a
 * chore that already exists, setting a reaction that's already set are all
 * no-ops), so a replay can never double-apply.
 *
 * ## Saved format
 * The storage key holds an envelope:
 *   { format, revision, writeId, lineage, epoch, writer, savedAt, state }
 * - `writeId` identifies one write; two tabs writing the same revision
 *   number still produce different writeIds.
 * - `lineage` lists the writeIds this write was built on (most recent last),
 *   so a tab can tell whether its own write was kept or overwritten.
 * - `epoch` changes on reset; tabs drop their unsaved actions when the
 *   household is reset elsewhere.
 * Data saved by the first prototype (a bare HouseholdState) is accepted as
 * revision 0.
 *
 * ## Keeping tabs consistent
 * Before each write, re-read storage and replay pending actions on whatever is
 * newest (including a different write at the same revision). After writing,
 * read back. Whenever storage changes (read-back or `storage` event), check
 * recent writes of ours against the stored lineage; any write that isn't in
 * it was overwritten by a racing tab, so its actions are queued again.
 *
 * Remaining limitation: lost writes are only detected for this tab's writes
 * from the last minute, and lineage keeps the last 200 writes. A real backend
 * replaces all of this with server-side ordering.
 */
import type { IdSource } from "./chores";
import type { HouseholdState } from "./types";
import { validateHouseholdState } from "./validate";

export const STORAGE_KEY = "nestlein:household";
/** Previous data kept when the user resets / starts fresh. */
export const BACKUP_KEY = "nestlein:household:backup";
/** Unreadable data found on load. Reset never overwrites this. */
export const RECOVERY_KEY = "nestlein:household:recovery";
const FORMAT = "nestlein/household";
const LINEAGE_LIMIT = 200;
const UNCONFIRMED_WINDOW_MS = 60_000;
const UNSAVED = "unsaved";

/** The subset of the Web Storage API the store uses (easy to fake in tests). */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type Persistence =
  /** Everything shown is in storage. */
  | "saved"
  /** Storage can't be read or written at all (blocked, private mode). */
  | "unavailable"
  /** Storage works but writing failed (usually: full), or is paused to protect unbacked data. */
  | "failed"
  /** Unsaved changes no longer fit newer data from another tab. */
  | "conflict";

export type Recovery = {
  /** Why saved data was rejected. */
  reason: string;
  /** Whether the rejected data was kept under RECOVERY_KEY. */
  backedUp: boolean;
  /** The rejected data, kept in memory so it can be copied either way. */
  raw: string;
};

export type Snapshot = {
  /** What the UI shows: saved state plus any unsaved changes. */
  state: HouseholdState;
  /** Revision of the saved state (0 = nothing saved yet). */
  revision: number;
  persistence: Persistence;
  recovery: Recovery | null;
  /** User-facing reasons, when persistence is "conflict". */
  conflicts: string[];
  /** Number of actions not yet saved. */
  pending: number;
};

/** What applying an action produced. `conflict` = it no longer fits the data. */
export type Outcome<R = unknown> = { state: HouseholdState; result?: R; conflict?: string };

export type Action<R = unknown> = {
  /** Stable across replays and tabs. */
  id: string;
  run: (state: HouseholdState, ids: IdSource) => Outcome<R>;
};

/** Deterministic ids for one action: the same sequence on every replay. */
export function idsFor(actionId: string): IdSource {
  let n = 0;
  return (prefix) => `${prefix}_${actionId}_${(n++).toString(36)}`;
}

type Saved = {
  state: HouseholdState;
  revision: number;
  writeId: string;
  lineage: string[];
  epoch: string;
};

type Envelope = Saved & { format: typeof FORMAT; writer: string; savedAt: string };

type ReadResult =
  | { kind: "empty" }
  | { kind: "unavailable" }
  | { kind: "ok"; saved: Saved }
  | { kind: "invalid"; raw: string; reason: string };

function randomId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function parse(raw: string): ReadResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "invalid", raw, reason: "saved data isn't valid JSON" };
  }
  const env = (typeof data === "object" && data !== null ? data : {}) as Partial<Envelope>;
  const isEnvelope = env.format === FORMAT;
  if (isEnvelope) {
    if (!Number.isInteger(env.revision) || (env.revision as number) < 0) {
      return { kind: "invalid", raw, reason: "revision must be a whole number" };
    }
    if (env.lineage !== undefined && !(Array.isArray(env.lineage) && env.lineage.every((x) => typeof x === "string"))) {
      return { kind: "invalid", raw, reason: "lineage must be a list of ids" };
    }
  }
  const result = validateHouseholdState(isEnvelope ? env.state : data);
  if (!result.ok) return { kind: "invalid", raw, reason: result.reason };
  const revision = isEnvelope ? (env.revision as number) : 0;
  return {
    kind: "ok",
    saved: {
      state: result.state,
      revision,
      // Older envelopes (and bare states) have no identity fields.
      writeId: isEnvelope && typeof env.writeId === "string" ? env.writeId : `legacy-${revision}`,
      lineage: isEnvelope && env.lineage ? env.lineage : [],
      epoch: isEnvelope && typeof env.epoch === "string" ? env.epoch : "legacy",
    },
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
  /** Unique per tab; recorded on writes for debugging. */
  tabId: string;
  now?: () => Date;
}) {
  let loaded = false;
  let base: Saved;
  let pending: Action[] = [];
  /** Recent writes of ours, kept to detect (and repair) one being overwritten. */
  let unconfirmed: { writeId: string; actions: Action[]; at: number }[] = [];
  let persistence: Persistence = "saved";
  let recovery: Recovery | null = null;
  let conflicts: string[] = [];
  /** True while unreadable data couldn't be backed up: don't overwrite it. */
  let protectRaw = false;
  /** A reset that hasn't reached storage yet; it must win over older saved data. */
  let resetPending = false;
  /** Outcomes computed by the latest flush, by action id. */
  let flushResults = new Map<string, Outcome>();
  let snapshot: Snapshot | null = null;
  const listeners = new Set<() => void>();

  // ---------------------------------------------------------------- storage

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

  function keep(key: string, raw: string, reason: string): boolean {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify({ savedAt: now().toISOString(), reason, raw }));
      return true;
    } catch {
      return false;
    }
  }

  function writeEnvelope(saved: Saved): boolean {
    if (!storage) return false;
    const envelope: Envelope = {
      ...saved,
      format: FORMAT,
      writer: tabId,
      savedAt: now().toISOString(),
    };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------- internals

  function seedBase(): Saved {
    return { state: seed(), revision: 0, writeId: UNSAVED, lineage: [], epoch: randomId("epoch") };
  }

  function replay(actions: Action[]) {
    let state = base.state;
    const found: { action: Action; message: string }[] = [];
    const results = new Map<string, Outcome>();
    for (const action of actions) {
      const outcome = action.run(state, idsFor(action.id));
      results.set(action.id, outcome);
      if (outcome.conflict) found.push({ action, message: outcome.conflict });
      else state = outcome.state;
    }
    return { state, conflicts: found, results };
  }

  function emit() {
    const { state } = replay(pending);
    snapshot = {
      state,
      revision: base.revision,
      persistence,
      recovery,
      conflicts,
      pending: pending.length,
    };
    listeners.forEach((l) => l());
  }

  /**
   * Move onto newer saved data. Any recent write of ours that isn't part of
   * it was overwritten by another tab; its actions are queued again.
   */
  function adopt(saved: Saved): boolean {
    if (saved.epoch !== base.epoch && base.writeId !== UNSAVED) {
      // The household was reset elsewhere: our unsaved work no longer applies.
      pending = [];
      unconfirmed = [];
      conflicts = [];
    }
    const cutoff = now().getTime() - UNCONFIRMED_WINDOW_MS;
    const lost: Action[] = [];
    unconfirmed = unconfirmed.filter((w) => {
      if (w.at < cutoff) return false;
      const kept = saved.writeId === w.writeId || saved.lineage.includes(w.writeId);
      if (!kept) lost.push(...w.actions);
      return kept;
    });
    base = saved;
    if (lost.length) {
      const queued = new Set(pending.map((a) => a.id));
      pending = [...lost.filter((a) => !queued.has(a.id)), ...pending];
    }
    return lost.length > 0;
  }

  /** Re-read storage and adopt anything that isn't our current base. */
  function refresh(): boolean {
    // An unsaved reset must not be replaced by the data it was resetting.
    if (resetPending) return false;
    const found = read();
    if (found.kind === "ok" && found.saved.writeId !== base.writeId) return adopt(found.saved);
    return false;
  }

  /**
   * Try to save: replay pending actions on the latest saved data and write.
   * `fresh` is an action the user just took; if it no longer fits it is
   * dropped (the caller reports why). Older pending actions that no longer fit
   * are kept and reported as a conflict instead of being saved.
   */
  function flush(fresh?: Action, depth = 0) {
    if (!storage) {
      persistence = "unavailable";
      return;
    }
    if (protectRaw) {
      persistence = "failed";
      return;
    }
    const found = read();
    if (found.kind === "unavailable") {
      // Can't read means we can't check other tabs' writes or verify ours.
      persistence = "unavailable";
      return;
    }
    if (resetPending) {
      // Our reset replaces whatever is stored; just number it past it.
      if (found.kind === "ok") base = { ...base, revision: Math.max(base.revision, found.saved.revision) };
    } else if (found.kind === "ok" && found.saved.writeId !== base.writeId) {
      adopt(found.saved);
    }

    let attempt = replay(pending);
    attempt.results.forEach((o, id) => flushResults.set(id, o));
    if (fresh && attempt.conflicts.some((c) => c.action.id === fresh.id)) {
      pending = pending.filter((a) => a.id !== fresh.id);
      attempt = replay(pending);
    }
    if (attempt.conflicts.length) {
      persistence = "conflict";
      conflicts = attempt.conflicts.map((c) => c.message);
      return;
    }
    conflicts = [];
    if (attempt.state === base.state && base.writeId !== UNSAVED) {
      // Nothing to write (no pending actions, or they were all no-ops).
      pending = [];
      persistence = "saved";
      return;
    }

    const next: Saved = {
      state: attempt.state,
      revision: base.revision + 1,
      writeId: randomId("w"),
      lineage: base.writeId === UNSAVED ? [] : [...base.lineage, base.writeId].slice(-LINEAGE_LIMIT),
      epoch: base.epoch,
    };
    if (!writeEnvelope(next)) {
      persistence = "failed";
      return;
    }
    if (pending.length) unconfirmed.push({ writeId: next.writeId, actions: pending, at: now().getTime() });
    base = next;
    pending = [];
    resetPending = false;
    persistence = "saved";

    // Verify: did another tab's write replace ours in the meantime?
    if (refresh() && depth < 3) flush(undefined, depth + 1);
  }

  function load() {
    loaded = true;
    const found = read();
    if (found.kind === "ok") {
      base = found.saved;
      persistence = "saved";
      return;
    }
    base = seedBase();
    if (found.kind === "unavailable") {
      persistence = "unavailable";
      return;
    }
    if (found.kind === "invalid") {
      const backedUp = keep(RECOVERY_KEY, found.raw, found.reason);
      recovery = { reason: found.reason, backedUp, raw: found.raw };
      if (!backedUp) {
        // Don't overwrite the only copy of the old data.
        protectRaw = true;
        persistence = "failed";
        return;
      }
    }
    flush();
  }

  function ensureLoaded() {
    if (!loaded) load();
  }

  // ------------------------------------------------------------------- API

  function getSnapshot(): Snapshot {
    if (!snapshot) {
      ensureLoaded();
      emit();
    }
    return snapshot!;
  }

  /**
   * Apply an action to the latest data and try to save it. Returns the
   * action's outcome as seen in the resulting state.
   */
  function dispatch<R>(action: Action<R>): Outcome<R> {
    ensureLoaded();
    flushResults = new Map();
    pending = [...pending, action as Action];
    flush(action as Action);
    emit();
    // Saved (or dropped as a conflict): the flush computed its outcome.
    // Still pending (storage failed/unavailable): replay gives the same one.
    return (flushResults.get(action.id) ?? replay(pending).results.get(action.id)) as Outcome<R>;
  }

  /** Handle a `storage` event (fired in *other* tabs when one tab writes). */
  function handleStorageEvent(key: string | null) {
    if (key !== STORAGE_KEY) return;
    ensureLoaded();
    const requeued = refresh();
    if (requeued && persistence === "saved") flush();
    emit();
  }

  /** Replay unsaved changes on the latest saved data and try writing again. */
  function retrySave(): Persistence {
    ensureLoaded();
    flush();
    emit();
    return persistence;
  }

  /** Throw away unsaved changes (e.g. after a conflict). */
  function discardPending() {
    ensureLoaded();
    pending = [];
    conflicts = [];
    refresh();
    persistence = !storage ? "unavailable" : protectRaw ? "failed" : "saved";
    emit();
  }

  /**
   * The user has seen the recovery notice (and copied the old data if they
   * wanted it). Lifts the write protection and saves.
   */
  function dismissRecovery() {
    ensureLoaded();
    recovery = null;
    if (protectRaw) {
      protectRaw = false;
      flush();
    }
    emit();
  }

  /**
   * Start over from the seed. What's in storage now is kept under BACKUP_KEY
   * first. RECOVERY_KEY is never touched, so a recovery backup survives.
   */
  function reset() {
    ensureLoaded();
    const found = read();
    if (found.kind === "ok") keep(BACKUP_KEY, JSON.stringify(found.saved.state), "reset by user");
    else if (found.kind === "invalid") keep(BACKUP_KEY, found.raw, found.reason);
    if (protectRaw && recovery) keep(RECOVERY_KEY, recovery.raw, recovery.reason);

    const savedRevision = Math.max(base.revision, found.kind === "ok" ? found.saved.revision : 0);
    base = { state: seed(), revision: savedRevision, writeId: UNSAVED, lineage: [], epoch: randomId("epoch") };
    pending = [];
    unconfirmed = [];
    conflicts = [];
    protectRaw = false;
    recovery = null;
    resetPending = true;
    // Writes revision savedRevision + 1; if that fails, the reset stays
    // pending (and still wins) until a retry succeeds.
    flush();
    emit();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getSnapshot,
    subscribe,
    dispatch,
    handleStorageEvent,
    retrySave,
    discardPending,
    dismissRecovery,
    reset,
  };
}

export type HouseholdStore = ReturnType<typeof createHouseholdStore>;
