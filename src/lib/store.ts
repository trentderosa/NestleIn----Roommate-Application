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
import { useEffect, useState, useSyncExternalStore } from "react";
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

/** The current time, refreshed every 30s so relative labels stay accurate. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export const actions = {
  /** Returns the previous state so callers can offer "Undo". */
  completeChore(choreId: ID): HouseholdState {
    const prev = getSnapshot();
    setState(logic.completeChore(prev, choreId, new Date()));
    return prev;
  },
  sendNudge(input: { choreId: ID; tone: NudgeTone; message: string }) {
    setState(logic.sendNudge(getSnapshot(), input, new Date()));
  },
  saveChore(input: ChoreInput, id?: ID) {
    setState(logic.saveChore(getSnapshot(), input, new Date(), id));
  },
  deleteChore(id: ID): HouseholdState {
    const prev = getSnapshot();
    setState(logic.deleteChore(prev, id));
    return prev;
  },
  toggleReaction(eventId: ID, emoji: string) {
    setState(logic.toggleReaction(getSnapshot(), eventId, emoji));
  },
  switchUser(id: ID) {
    setState({ ...getSnapshot(), currentUserId: id });
  },
  restore(snapshot: HouseholdState) {
    setState(snapshot);
  },
  resetDemo() {
    setState(createSeedState(new Date()));
  },
};
