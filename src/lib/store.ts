"use client";

/**
 * React bindings for the household store (the mock persistence layer).
 *
 * - The store itself (validation, recovery, cross-tab sync) is in
 *   store-core.ts; this file creates the one instance for the browser and
 *   exposes hooks plus `actions`.
 * - Components read with `useHousehold()` and write through `actions`.
 * - The server render (and hydration pass) sees `null`, so UI that depends on
 *   household data renders a skeleton first. That avoids hydration mismatches
 *   from time-relative mock data and localStorage.
 *
 * To move to a real backend, keep the `actions` signatures and swap their
 * bodies for API calls (optionally applying the pure transition first as an
 * optimistic update).
 */
import { useSyncExternalStore } from "react";
import * as logic from "./chores";
import { createSeedState } from "./mock-data";
import { setStatus, type StatusInput } from "./profile";
import {
  createHouseholdStore,
  type HouseholdStore,
  type Outcome,
  type Snapshot,
  type StorageLike,
} from "./store-core";
import type { ChoreInput, HouseholdState, ID, NudgeTone } from "./types";

/** localStorage, or null if the browser blocks it entirely. */
function browserStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    storage.getItem("nestlein:probe");
    return storage;
  } catch {
    return null;
  }
}

let store: HouseholdStore | null = null;

/** The browser's single store, created on first use (client only). */
function getStore(): HouseholdStore {
  if (!store) {
    const created = createHouseholdStore({
      storage: browserStorage(),
      seed: () => createSeedState(new Date()),
      tabId: logic.newId("tab"),
    });
    // Other tabs' writes arrive as storage events.
    window.addEventListener("storage", (e) => created.handleStorageEvent(e.key));
    // Keep "now" in step with every change.
    created.subscribe(() => {
      clock = new Date();
    });
    store = created;
  }
  return store;
}

const subscribe = (listener: () => void) => getStore().subscribe(listener);
const getSnapshot = () => getStore().getSnapshot();

/** Household state plus persistence status, or null during server render / hydration. */
export function useHouseholdSnapshot(): Snapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Current household state, or null during server render / hydration. */
export function useHousehold(): HouseholdState | null {
  return useHouseholdSnapshot()?.state ?? null;
}

/** Whether the latest change actually reached storage. */
export function isPersisted(): boolean {
  return getStore().getSnapshot().persistence === "saved";
}

// A shared client clock. Like household state, it's never read on the server:
// prerendering a time-dependent value would bake a stale "now" into the HTML.
let clock: Date | null = null;
const EPOCH = new Date(0);

function subscribeClock(listener: () => void) {
  const t = setInterval(() => {
    clock = new Date();
    listener();
  }, 30_000);
  return () => clearInterval(t);
}

function getClock(): Date {
  if (!clock) clock = new Date();
  return clock;
}

/**
 * The current time, refreshed every 30s so relative labels stay accurate.
 * Returns the epoch on the server; only use it alongside household data
 * (which is also client-only).
 */
export function useNow(): Date {
  return useSyncExternalStore(subscribeClock, getClock, () => EPOCH);
}

/**
 * Every change is dispatched as an Action with a stable id (see
 * store-core.ts). The store applies it to the *latest* saved data, possibly
 * written by another tab, and may replay it later. `at`, `ids`, and `actor`
 * (the roommate acting) are fixed when the action is created, so every replay
 * produces the same result and credits the same person, even if "View as"
 * changes in between.
 */
function act<R>(
  run: (state: HouseholdState, ids: logic.IdSource, at: Date, actor: ID) => Outcome<R>,
): Outcome<R> {
  const at = new Date();
  const actor = getStore().getSnapshot().state.currentUserId;
  return getStore().dispatch<R>({ id: logic.newId("act"), run: (s, ids) => run(s, ids, at, actor) });
}

/** Every action reports a user-facing `conflict` when it couldn't be applied. */
type WithConflict<T> = T & { conflict?: string };

export const actions = {
  /**
   * `undo` is the record for exactly this completion, or null if nothing
   * changed (already finished, or `conflict` explains why).
   */
  completeChore(choreId: ID): WithConflict<{ undo: logic.UndoRecord | null }> {
    const out = act<logic.UndoRecord | null>((s, ids, at, actor) => {
      if (!s.chores.some((c) => c.id === choreId)) {
        return { state: s, result: null, conflict: "A chore you marked done was removed in another tab." };
      }
      const r = logic.completeChoreWithUndo(s, choreId, at, ids, actor);
      return { state: r.state, result: r.undo };
    });
    return { undo: out.result ?? null, conflict: out.conflict };
  },
  /** `sent` is false if the nudge wasn't sent (cooldown, already done, gone). */
  sendNudge(input: { choreId: ID; tone: NudgeTone; message: string }): WithConflict<{ sent: boolean }> {
    const out = act<boolean>((s, ids, at, actor) => {
      const next = logic.sendNudge(s, input, at, ids, actor);
      return { state: next, result: next !== s };
    });
    return { sent: !out.conflict && out.result === true, conflict: out.conflict };
  },
  /** `saved` is false when the chore being edited no longer exists. */
  saveChore(input: ChoreInput, id?: ID): WithConflict<{ saved: boolean }> {
    const out = act<boolean>((s, ids, at, actor) => {
      if (id && !s.chores.some((c) => c.id === id)) {
        return {
          state: s,
          result: false,
          conflict: `Your edit to “${input.title.trim()}” couldn't be saved because it was deleted in another tab.`,
        };
      }
      return { state: logic.saveChore(s, input, at, id, ids, actor), result: true };
    });
    return { saved: !out.conflict && out.result === true, conflict: out.conflict };
  },
  /** `undo` is the record for exactly this deletion (null if nothing changed). */
  deleteChore(id: ID): WithConflict<{ undo: logic.UndoRecord | null }> {
    const out = act<logic.UndoRecord | null>((s) => {
      const r = logic.deleteChoreWithUndo(s, id);
      return { state: r.state, result: r.undo };
    });
    return { undo: out.result ?? null, conflict: out.conflict };
  },
  /** Reverse one earlier operation, or explain why it can't be. */
  undo(record: logic.UndoRecord): { ok: true } | { ok: false; reason: string } {
    const out = act<logic.UndoResult>((s) => {
      const r = logic.undo(s, record);
      return { state: r.state, result: r };
    });
    if (out.conflict || !out.result) return { ok: false, reason: out.conflict ?? "That couldn't be undone." };
    return out.result.ok ? { ok: true } : { ok: false, reason: out.result.reason };
  },
  /** Returns a user-facing explanation if it couldn't be applied. */
  toggleReaction(eventId: ID, emoji: string): string | undefined {
    // Decide add/remove now, from what's on screen, so a replay sets the same thing.
    const shown = getStore().getSnapshot().state;
    const me = shown.currentUserId;
    const on = !shown.activity.find((e) => e.id === eventId)?.reactions[emoji]?.includes(me);
    return act((s) => ({ state: logic.setReaction(s, eventId, emoji, me, on) })).conflict;
  },
  /**
   * Set or clear (empty text and emoji) the acting roommate's status.
   * Returns a user-facing explanation if it couldn't be applied.
   */
  setStatus(input: StatusInput): string | undefined {
    return act((s, ids, at, actor) => ({ state: setStatus(s, actor, input, at, ids) })).conflict;
  },
  /** Returns a user-facing explanation if it couldn't be applied. */
  switchUser(id: ID): string | undefined {
    return act((s) => ({ state: s.currentUserId === id ? s : { ...s, currentUserId: id } })).conflict;
  },
  /** Start over from the demo seed. The previous data is kept as a backup. */
  resetDemo() {
    getStore().reset();
  },
  /** Replay unsaved changes on the latest saved data and save again. */
  retrySave() {
    return getStore().retrySave();
  },
  /** Throw away changes that couldn't be saved. */
  discardPending() {
    getStore().discardPending();
  },
  /** Hide the list of changes that were dropped as conflicts. */
  dismissConflicts() {
    getStore().dismissConflicts();
  },
  dismissRecovery() {
    getStore().dismissRecovery();
  },
};
