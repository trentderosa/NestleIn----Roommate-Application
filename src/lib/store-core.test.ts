import { describe, expect, it } from "vitest";
import { completeChore, toggleReaction } from "./chores";
import { createSeedState } from "./mock-data";
import { BACKUP_KEY, STORAGE_KEY, createHouseholdStore, type StorageLike } from "./store-core";
import type { HouseholdState } from "./types";

const NOW = new Date(2026, 9, 7, 15, 0);
const seed = () => createSeedState(NOW);

/**
 * In-memory Web Storage shared by simulated tabs. Hooks let a test run code
 * right before or after a write, to interleave two tabs' writes.
 */
class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  failReads = false;
  failWrites = false;
  beforeSet: ((key: string) => void) | null = null;
  afterSet: ((key: string) => void) | null = null;

  getItem(key: string) {
    if (this.failReads) throw new DOMException("denied", "SecurityError");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("full", "QuotaExceededError");
    const before = this.beforeSet;
    this.beforeSet = null; // fire once
    before?.(key);
    this.data.set(key, value);
    const after = this.afterSet;
    this.afterSet = null;
    after?.(key);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  envelope() {
    return JSON.parse(this.data.get(STORAGE_KEY)!);
  }
}

function tab(storage: FakeStorage | null, tabId: string) {
  return createHouseholdStore({ storage, seed, tabId, now: () => NOW });
}

/** Browsers fire `storage` events in other tabs after a write; tests do it explicitly. */
function deliver(...tabs: ReturnType<typeof tab>[]) {
  tabs.forEach((t) => t.handleStorageEvent(STORAGE_KEY));
}

const reactions = (s: HouseholdState, eventId: string) =>
  s.activity.find((e) => e.id === eventId)!.reactions;
const status = (s: HouseholdState, choreId: string) => s.chores.find((c) => c.id === choreId)!.status;

describe("loading", () => {
  it("seeds an empty store and saves it as revision 1", () => {
    const storage = new FakeStorage();
    const snap = tab(storage, "A").getSnapshot();
    expect(snap.persistence).toBe("saved");
    expect(snap.recovery).toBeNull();
    expect(storage.envelope()).toMatchObject({ revision: 1, writer: "A" });
  });

  it("accepts data saved by the first prototype (a bare state)", () => {
    const storage = new FakeStorage();
    const legacy = completeChore(seed(), "chore_counters", NOW);
    storage.data.set(STORAGE_KEY, JSON.stringify(legacy));
    const snap = tab(storage, "A").getSnapshot();
    expect(snap.recovery).toBeNull();
    expect(status(snap.state, "chore_counters")).toBe("done");
  });

  it.each([
    ["broken JSON", "{not json", "saved data isn't valid JSON"],
    ["a partial state", JSON.stringify({ version: 1, chores: [] }), "household must be an object"],
    [
      "an envelope with a bad state",
      JSON.stringify({ format: "nestlein/household", revision: 4, writer: "X", savedAt: "", state: { version: 1 } }),
      "household must be an object",
    ],
  ])("recovers from %s without crashing, keeping a backup", (_, raw, reason) => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, raw);
    const snap = tab(storage, "A").getSnapshot();

    expect(snap.recovery).toEqual({ reason, backedUp: true });
    expect(snap.state.household.name).toBe("The Pink Palace");
    expect(JSON.parse(storage.data.get(BACKUP_KEY)!)).toMatchObject({ reason, raw });
    // The fresh seed was saved over the bad data.
    expect(storage.envelope().state.household.name).toBe("The Pink Palace");
  });
});

describe("storage failures", () => {
  it("works in memory when storage can't be read at all", () => {
    const storage = new FakeStorage();
    storage.failReads = true;
    const A = tab(storage, "A");
    expect(A.getSnapshot().persistence).toBe("unavailable");
    A.update((s) => completeChore(s, "chore_counters", NOW));
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("done");
  });

  it("works with no storage object (blocked)", () => {
    const A = tab(null, "A");
    A.update((s) => completeChore(s, "chore_counters", NOW));
    expect(A.getSnapshot().persistence).toBe("unavailable");
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("done");
  });

  it("reports a failed save instead of pretending, and recovers on retry", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot();
    storage.failWrites = true;

    A.update((s) => completeChore(s, "chore_counters", NOW));
    expect(A.getSnapshot().persistence).toBe("failed");
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("done"); // kept in memory
    expect(status(storage.envelope().state, "chore_counters")).toBe("open"); // not on disk

    storage.failWrites = false;
    expect(A.retrySave()).toBe("saved");
    expect(status(storage.envelope().state, "chore_counters")).toBe("done");
  });

  it("says so when the backup itself can't be written", () => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, "{not json");
    storage.failWrites = true;
    const snap = tab(storage, "A").getSnapshot();
    expect(snap.recovery?.backedUp).toBe(false);
    expect(snap.persistence).toBe("failed");
  });
});

describe("multiple tabs", () => {
  it("a stale tab's action applies on top of the other tab's newer data", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot(); // B loads before A changes anything

    A.update((s) => completeChore(s, "chore_counters", NOW));
    // No storage event delivered yet: B's in-memory copy is stale.
    B.update((s) => toggleReaction(s, "evt_soap", "💕"));

    const saved = storage.envelope().state as HouseholdState;
    expect(status(saved, "chore_counters")).toBe("done"); // A's change survived
    expect(reactions(saved, "evt_soap")["💕"]).toEqual(["krystiana"]); // and B's landed
    expect(storage.envelope().revision).toBe(3);
  });

  it("storage events bring other tabs up to date", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    B.getSnapshot();
    A.update((s) => completeChore(s, "chore_counters", NOW));
    deliver(B);
    expect(status(B.getSnapshot().state, "chore_counters")).toBe("done");
    expect(B.getSnapshot().revision).toBe(A.getSnapshot().revision);
  });

  it("a write that lands between our read and write is caught by verification", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot(); // revision 1

    // Right after A writes revision 2, B (which read revision 1) overwrites it.
    storage.afterSet = () => {
      const bState = toggleReaction(seed(), "evt_soap", "✨");
      storage.data.set(
        STORAGE_KEY,
        JSON.stringify({ format: "nestlein/household", revision: 2, writer: "B", savedAt: "", state: bState }),
      );
    };
    A.update((s) => toggleReaction(s, "evt_soap", "💕"));

    const saved = storage.envelope();
    expect(saved.revision).toBe(3);
    expect(reactions(saved.state, "evt_soap")).toMatchObject({ "✨": ["krystiana"], "💕": ["krystiana"] });
  });

  it("a race verification can't see is repaired when the storage event arrives", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot();

    // B's whole update runs just before A's write lands: both build on revision 1,
    // B writes revision 2 first, then A's revision 2 overwrites it.
    storage.beforeSet = () => B.update((s) => toggleReaction(s, "evt_soap", "✨"));
    A.update((s) => toggleReaction(s, "evt_soap", "💕"));
    expect(reactions(storage.envelope().state, "evt_soap")["✨"]).toBeUndefined(); // B's change was lost...

    deliver(A, B);
    const saved = storage.envelope();
    expect(reactions(saved.state, "evt_soap")).toMatchObject({ "✨": ["krystiana"], "💕": ["krystiana"] }); // ...and repaired
    expect(saved.revision).toBe(3);

    // Both tabs converge, and nothing was applied twice (a double toggle would remove it).
    deliver(A, B);
    expect(reactions(A.getSnapshot().state, "evt_soap")).toEqual(reactions(saved.state, "evt_soap"));
    expect(reactions(B.getSnapshot().state, "evt_soap")).toEqual(reactions(saved.state, "evt_soap"));
  });

  it("does not re-apply an action that a newer write already includes", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    A.update((s) => toggleReaction(s, "evt_soap", "💕")); // rev 2
    B.update((s) => completeChore(s, "chore_counters", NOW)); // rebases on rev 2 -> rev 3
    deliver(A); // A sees rev 3, which already contains its toggle

    const saved = storage.envelope().state;
    expect(reactions(saved, "evt_soap")["💕"]).toEqual(["krystiana"]);
    expect(reactions(A.getSnapshot().state, "evt_soap")["💕"]).toEqual(["krystiana"]);
  });

  it("ignores garbage written by another tab and replaces it on the next write", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot();
    storage.data.set(STORAGE_KEY, "{oops");
    deliver(A);
    expect(A.getSnapshot().state.household.name).toBe("The Pink Palace");
    A.update((s) => completeChore(s, "chore_counters", NOW));
    expect(status(storage.envelope().state, "chore_counters")).toBe("done");
  });

  it("reset backs up the current data before starting fresh", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.update((s) => completeChore(s, "chore_counters", NOW));
    A.reset();
    const backup = JSON.parse(storage.data.get(BACKUP_KEY)!);
    expect(backup.reason).toBe("reset by user");
    expect(status(JSON.parse(backup.raw), "chore_counters")).toBe("done");
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("open");
  });
});
