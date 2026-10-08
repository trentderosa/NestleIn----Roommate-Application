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
import { createHouseholdStore, type HouseholdStore, type Snapshot, type StorageLike } from "./store-core";
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
 * Every write goes through `getStore().update(transition)`, which applies the
 * transition to the *latest* saved data (possibly written by another tab).
 * Results are read from inside the transition so they describe what actually
 * happened, not what this tab's stale copy predicted.
 */
export const actions = {
  /**
   * Returns an undo record for exactly this completion, or null if nothing
   * changed (e.g. another tab already finished it).
   */
  completeChore(choreId: ID): logic.UndoRecord | null {
    let record: logic.UndoRecord | null = null;
    getStore().update((s) => {
      const result = logic.completeChoreWithUndo(s, choreId, new Date());
      record = result.undo;
      return result.state;
    });
    return record;
  },
  /** Returns false if the nudge wasn't sent (cooldown, already done, gone). */
  sendNudge(input: { choreId: ID; tone: NudgeTone; message: string }): boolean {
    let sent = false;
    getStore().update((s) => {
      const next = logic.sendNudge(s, input, new Date());
      sent = next !== s;
      return next;
    });
    return sent;
  },
  /** Returns false when editing a chore that no longer exists. */
  saveChore(input: ChoreInput, id?: ID): boolean {
    let saved = false;
    getStore().update((s) => {
      saved = !id || s.chores.some((c) => c.id === id);
      return saved ? logic.saveChore(s, input, new Date(), id) : s;
    });
    return saved;
  },
  /** Returns an undo record for exactly this deletion (null if nothing changed). */
  deleteChore(id: ID): logic.UndoRecord | null {
    let record: logic.UndoRecord | null = null;
    getStore().update((s) => {
      const result = logic.deleteChoreWithUndo(s, id);
      record = result.undo;
      return result.state;
    });
    return record;
  },
  /** Reverse one earlier operation, or explain why it can't be. */
  undo(record: logic.UndoRecord): { ok: true } | { ok: false; reason: string } {
    let outcome: { ok: true } | { ok: false; reason: string } = { ok: true };
    getStore().update((s) => {
      const result = logic.undo(s, record);
      outcome = result.ok ? { ok: true } : { ok: false, reason: result.reason };
      return result.state;
    });
    return outcome;
  },
  toggleReaction(eventId: ID, emoji: string) {
    getStore().update((s) => logic.toggleReaction(s, eventId, emoji));
  },
  switchUser(id: ID) {
    getStore().update((s) => (s.currentUserId === id ? s : { ...s, currentUserId: id }));
  },
  /** Start over from the demo seed. The previous data is kept as a backup. */
  resetDemo() {
    getStore().reset();
  },
  retrySave() {
    return getStore().retrySave();
  },
  dismissRecovery() {
    getStore().dismissRecovery();
  },
};
