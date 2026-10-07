"use client";

/**
 * Client-side household store (the mock persistence layer).
 *
 * - State lives in memory and is mirrored to localStorage so the demo
 *   survives refreshes.
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
import { STATE_VERSION, createSeedState } from "./mock-data";
import type { ChoreInput, HouseholdState, ID, NudgeTone } from "./types";

const STORAGE_KEY = "nestlein:household";

let state: HouseholdState | null = null;
const listeners = new Set<() => void>();

function load(): HouseholdState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HouseholdState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    // Private mode or corrupted data: fall back to the seed.
  }
  return createSeedState(new Date());
}

function getSnapshot(): HouseholdState {
  if (!state) state = load();
  return state;
}

function getServerSnapshot(): HouseholdState | null {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: HouseholdState) {
  state = next;
  clock = new Date(); // keep "now" in step with the change we just made
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
  listeners.forEach((l) => l());
}

/** Current household state, or null during server render / hydration. */
export function useHousehold(): HouseholdState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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

export const actions = {
  /** Returns an undo record for exactly this completion (null if nothing changed). */
  completeChore(choreId: ID): logic.UndoRecord | null {
    const { state: next, undo } = logic.completeChoreWithUndo(getSnapshot(), choreId, new Date());
    setState(next);
    return undo;
  },
  sendNudge(input: { choreId: ID; tone: NudgeTone; message: string }) {
    setState(logic.sendNudge(getSnapshot(), input, new Date()));
  },
  saveChore(input: ChoreInput, id?: ID) {
    setState(logic.saveChore(getSnapshot(), input, new Date(), id));
  },
  /** Returns an undo record for exactly this deletion (null if nothing changed). */
  deleteChore(id: ID): logic.UndoRecord | null {
    const { state: next, undo } = logic.deleteChoreWithUndo(getSnapshot(), id);
    setState(next);
    return undo;
  },
  /** Reverse one earlier operation without touching anything that happened since. */
  undo(record: logic.UndoRecord) {
    setState(logic.undo(getSnapshot(), record));
  },
  toggleReaction(eventId: ID, emoji: string) {
    setState(logic.toggleReaction(getSnapshot(), eventId, emoji));
  },
  switchUser(id: ID) {
    setState({ ...getSnapshot(), currentUserId: id });
  },
  resetDemo() {
    setState(createSeedState(new Date()));
  },
};
