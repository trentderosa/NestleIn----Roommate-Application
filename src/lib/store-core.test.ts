import { describe, expect, it } from "vitest";
import {
  completeChore,
  completeChoreWithUndo,
  deleteChore,
  saveChore,
  sendNudge,
  setReaction,
  undo,
  type IdSource,
  type UndoRecord,
} from "./chores";
import { createSeedState } from "./mock-data";
import {
  BACKUP_KEY,
  RECOVERY_KEY,
  RESET_ELSEWHERE,
  STORAGE_KEY,
  createHouseholdStore,
  type Action,
  type StorageLike,
} from "./store-core";
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
  /** Keys whose writes throw (e.g. only the backup key). */
  failKeys = new Set<string>();
  beforeSet: ((key: string) => void) | null = null;
  afterSet: ((key: string) => void) | null = null;

  getItem(key: string) {
    if (this.failReads) throw new DOMException("denied", "SecurityError");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites || this.failKeys.has(key)) throw new DOMException("full", "QuotaExceededError");
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
  saved(): HouseholdState {
    return this.envelope().state;
  }
}

function tab(storage: FakeStorage | null, tabId: string) {
  return createHouseholdStore({ storage, seed, tabId, now: () => NOW });
}

/** Browsers fire `storage` events in other tabs after a write; tests do it explicitly. */
function deliver(...tabs: ReturnType<typeof tab>[]) {
  tabs.forEach((t) => t.handleStorageEvent(STORAGE_KEY));
}

let counter = 0;
function action<R = unknown>(
  fn: (s: HouseholdState, ids: IdSource) => HouseholdState | { state: HouseholdState; result?: R; conflict?: string },
  id = `act${++counter}`,
): Action<R> {
  return {
    id,
    run: (s, ids) => {
      const r = fn(s, ids);
      return "household" in r ? { state: r } : r;
    },
  };
}

const complete = (choreId: string) => action((s, ids) => completeChore(s, choreId, NOW, ids));
const react = (emoji: string, on = true) => action((s) => setReaction(s, "evt_soap", emoji, "krystiana", on));
const reactions = (s: HouseholdState) => s.activity.find((e) => e.id === "evt_soap")!.reactions;
const status = (s: HouseholdState, choreId: string) => s.chores.find((c) => c.id === choreId)?.status;
/** Another tab's write for the same household (same epoch), built on nothing we wrote. */
const otherWrite = (storage: FakeStorage, revision: number, state: HouseholdState, writeId = "w_other") =>
  JSON.stringify({
    format: "nestlein/household",
    revision,
    writeId,
    lineage: [],
    epoch: storage.envelope().epoch,
    writer: "X",
    savedAt: "",
    state,
  });

describe("loading", () => {
  it("seeds an empty store and saves it as revision 1", () => {
    const storage = new FakeStorage();
    const snap = tab(storage, "A").getSnapshot();
    expect(snap).toMatchObject({ persistence: "saved", recovery: null, revision: 1, pending: 0 });
    expect(storage.envelope()).toMatchObject({ revision: 1, writer: "A" });
  });

  it("loads a schema-v1 envelope and saves it back as v2", () => {
    const storage = new FakeStorage();
    const s = seed() as unknown as Record<string, unknown> & { roommates: Record<string, unknown>[] };
    const v1 = {
      ...s,
      version: 1,
      roommates: s.roommates.map(({ statusEmoji, ...r }) => ({ ...r, status: `${r.status} ${statusEmoji}` })),
    };
    storage.data.set(
      STORAGE_KEY,
      JSON.stringify({ format: "nestlein/household", revision: 7, writeId: "w_old", lineage: [], epoch: "e", writer: "X", savedAt: "", state: v1 }),
    );
    const A = tab(storage, "A");
    const snap = A.getSnapshot();
    expect(snap.recovery).toBeNull();
    expect(snap.state.roommates[0]).toMatchObject({ status: "matcha-powered today", statusEmoji: "🍵" });
    A.dispatch(complete("chore_counters"));
    expect(storage.envelope()).toMatchObject({ revision: 8 });
    expect(storage.saved().version).toBe(2);
  });

  it("accepts data saved by the first prototype (a bare state)", () => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, JSON.stringify(completeChore(seed(), "chore_counters", NOW)));
    const snap = tab(storage, "A").getSnapshot();
    expect(snap.recovery).toBeNull();
    expect(status(snap.state, "chore_counters")).toBe("done");
  });

  it.each([
    ["broken JSON", "{not json", "saved data isn't valid JSON"],
    ["a partial state", JSON.stringify({ version: 1, chores: [] }), "household must be an object"],
    [
      "an envelope with a bad state",
      JSON.stringify({ format: "nestlein/household", revision: 4, state: { version: 1 } }),
      "household must be an object",
    ],
  ])("recovers from %s without crashing, keeping a recovery copy", (_, raw, reason) => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, raw);
    const snap = tab(storage, "A").getSnapshot();

    expect(snap.recovery).toEqual({ reason, backedUp: true, raw });
    expect(snap.state.household.name).toBe("The Pink Palace");
    expect(JSON.parse(storage.data.get(RECOVERY_KEY)!)).toMatchObject({ reason, raw });
    expect(storage.saved().household.name).toBe("The Pink Palace");
  });

  // Fix 1
  it("doesn't overwrite unreadable data when the recovery copy can't be written", () => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, "{not json");
    storage.failKeys.add(RECOVERY_KEY); // only the backup write throws
    const A = tab(storage, "A");
    const snap = A.getSnapshot();

    expect(snap.persistence).toBe("failed");
    expect(snap.recovery).toMatchObject({ backedUp: false, raw: "{not json" }); // copyable from memory
    expect(snap.state.household.name).toBe("The Pink Palace"); // seed, in memory only
    expect(storage.data.get(STORAGE_KEY)).toBe("{not json"); // untouched

    // Taking actions still doesn't overwrite it...
    A.dispatch(complete("chore_counters"));
    expect(storage.data.get(STORAGE_KEY)).toBe("{not json");
    expect(A.getSnapshot()).toMatchObject({ persistence: "failed", pending: 1 });

    // ...until the user dismisses the notice; then saving resumes.
    A.dismissRecovery();
    expect(A.getSnapshot()).toMatchObject({ persistence: "saved", pending: 0, recovery: null });
    expect(status(storage.saved(), "chore_counters")).toBe("done");
  });

  // Fix 1 (second review)
  it("a reset doesn't overwrite unreadable data that still has no safe copy", () => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, "{not json");
    storage.failKeys.add(RECOVERY_KEY);
    storage.failKeys.add(BACKUP_KEY);
    const A = tab(storage, "A");
    A.getSnapshot();
    A.dispatch(complete("chore_counters"));

    A.reset();
    expect(storage.data.get(STORAGE_KEY)).toBe("{not json"); // untouched
    const snap = A.getSnapshot();
    expect(snap.recovery?.raw).toBe("{not json"); // still copyable
    expect(snap).toMatchObject({ persistence: "failed", pending: 0 });
    expect(status(snap.state, "chore_counters")).toBe("open"); // fresh start, in memory

    // Further actions still don't touch it.
    A.dispatch(complete("chore_plants"));
    expect(storage.data.get(STORAGE_KEY)).toBe("{not json");

    // Once a safe copy can be made, a reset proceeds normally.
    storage.failKeys.clear();
    A.reset();
    expect(JSON.parse(storage.data.get(RECOVERY_KEY)!).raw).toBe("{not json");
    expect(storage.envelope().state.household.name).toBe("The Pink Palace");
  });

  // Fix 2
  it("keeps the recovery copy when the user later resets", () => {
    const storage = new FakeStorage();
    storage.data.set(STORAGE_KEY, "{not json");
    const A = tab(storage, "A");
    A.getSnapshot();
    A.dispatch(complete("chore_counters"));
    A.reset();

    expect(JSON.parse(storage.data.get(RECOVERY_KEY)!)).toMatchObject({ raw: "{not json" });
    // The reset's own backup went elsewhere.
    const backup = JSON.parse(storage.data.get(BACKUP_KEY)!);
    expect(backup.reason).toBe("reset by user");
    expect(status(JSON.parse(backup.raw), "chore_counters")).toBe("done");
  });
});

describe("storage failures", () => {
  it("works in memory when storage can't be read at all", () => {
    const storage = new FakeStorage();
    storage.failReads = true;
    const A = tab(storage, "A");
    A.dispatch(complete("chore_counters"));
    expect(A.getSnapshot().persistence).toBe("unavailable");
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("done");
  });

  it("works with no storage object (blocked)", () => {
    const A = tab(null, "A");
    A.dispatch(complete("chore_counters"));
    expect(A.getSnapshot()).toMatchObject({ persistence: "unavailable", revision: 0 });
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("done");
  });

  // Fix 3
  it("a failed write doesn't advance the saved revision", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    expect(A.getSnapshot().revision).toBe(1);
    storage.failWrites = true;

    A.dispatch(complete("chore_counters"));
    A.dispatch(react("💕"));
    const snap = A.getSnapshot();
    expect(snap).toMatchObject({ persistence: "failed", revision: 1, pending: 2 });
    expect(status(snap.state, "chore_counters")).toBe("done"); // shown
    expect(storage.envelope().revision).toBe(1);
    expect(status(storage.saved(), "chore_counters")).toBe("open"); // not saved
  });

  // Fix 3
  it("replays unsaved changes on top of another tab's newer write", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot();

    storage.failKeys.add(STORAGE_KEY);
    A.dispatch(complete("chore_counters")); // fails, stays pending
    storage.failKeys.clear();
    B.dispatch(react("✨")); // revision 2
    deliver(A);

    const snap = A.getSnapshot();
    expect(snap).toMatchObject({ revision: 2, pending: 1, persistence: "failed" });
    expect(status(snap.state, "chore_counters")).toBe("done");
    expect(reactions(snap.state)["✨"]).toEqual(["krystiana"]);
  });

  // Fix 3
  it("notices a different write at the same revision", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot(); // revision 1 (A's seed)
    storage.failKeys.add(STORAGE_KEY);
    A.dispatch(complete("chore_counters")); // pending
    storage.failKeys.clear();

    // Someone else's revision-1 write replaces A's seed.
    storage.data.set(STORAGE_KEY, otherWrite(storage, 1, completeChore(seed(), "chore_vacuum", NOW)));
    deliver(A);

    const shown = A.getSnapshot().state;
    expect(status(shown, "chore_vacuum")).toBe("done"); // their change
    expect(status(shown, "chore_counters")).toBe("done"); // our pending change on top
    expect(A.retrySave()).toBe("saved");
    expect(storage.envelope().revision).toBe(2);
    expect(status(storage.saved(), "chore_vacuum")).toBe("done");
    expect(status(storage.saved(), "chore_counters")).toBe("done");
  });

  // Fix 4
  it("retrySave replays pending changes on the latest saved state", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot();
    storage.failKeys.add(STORAGE_KEY);
    A.dispatch(complete("chore_counters"));
    A.dispatch(react("💕"));
    storage.failKeys.clear();
    B.dispatch(complete("chore_plants")); // revision 2, A not told

    expect(A.retrySave()).toBe("saved");
    const saved = storage.saved();
    expect(storage.envelope().revision).toBe(3);
    expect(status(saved, "chore_plants")).toBe("done");
    expect(status(saved, "chore_counters")).toBe("done");
    expect(reactions(saved)["💕"]).toEqual(["krystiana"]);
    expect(A.getSnapshot()).toMatchObject({ persistence: "saved", pending: 0 });
  });

  // Fix 4
  // Fix 4 (second review)
  it("retrySave drops only the changes that no longer fit, explains them, and saves the rest", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot();

    const fridge = seed().chores.find((c) => c.id === "chore_fridge")!;
    const editFridge = action((s, ids) =>
      s.chores.some((c) => c.id === "chore_fridge")
        ? saveChore(s, { ...fridge, title: "Fridge glow-up" }, NOW, "chore_fridge", ids)
        : { state: s, conflict: "Your edit to “Fridge glow-up” couldn't be saved because it was deleted in another tab." },
    );
    storage.failKeys.add(STORAGE_KEY);
    A.dispatch(complete("chore_counters")); // fits
    A.dispatch(editFridge); // won't fit
    A.dispatch(react("💕")); // fits
    expect(A.getSnapshot().pending).toBe(3);
    storage.failKeys.clear();
    B.dispatch(action((s) => deleteChore(s, "chore_fridge"))); // revision 2

    expect(A.retrySave()).toBe("saved");
    const snap = A.getSnapshot();
    expect(snap).toMatchObject({ persistence: "saved", pending: 0 });
    expect(snap.conflicts).toEqual([
      "Your edit to “Fridge glow-up” couldn't be saved because it was deleted in another tab.",
    ]);
    const saved = storage.saved();
    expect(storage.envelope().revision).toBe(3);
    expect(status(saved, "chore_counters")).toBe("done");
    expect(reactions(saved)["💕"]).toEqual(["krystiana"]);
    expect(status(saved, "chore_fridge")).toBeUndefined(); // B's delete stands

    A.dismissConflicts();
    expect(A.getSnapshot().conflicts).toEqual([]);
  });

  it("discards unsaved changes on request", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot();
    storage.failKeys.add(STORAGE_KEY);
    A.dispatch(complete("chore_counters"));
    A.dispatch(react("💕"));
    expect(A.getSnapshot().pending).toBe(2);
    A.discardPending();
    expect(A.getSnapshot().pending).toBe(0);
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("open");
  });
});

describe("multiple tabs", () => {
  it("a stale tab's action applies on top of the other tab's newer data", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot();
    A.dispatch(complete("chore_counters"));
    B.dispatch(react("💕")); // B hasn't seen A's write
    expect(status(storage.saved(), "chore_counters")).toBe("done");
    expect(reactions(storage.saved())["💕"]).toEqual(["krystiana"]);
    expect(storage.envelope().revision).toBe(3);
  });

  it("storage events bring other tabs up to date", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    B.getSnapshot();
    A.dispatch(complete("chore_counters"));
    deliver(B);
    expect(status(B.getSnapshot().state, "chore_counters")).toBe("done");
    expect(B.getSnapshot().revision).toBe(A.getSnapshot().revision);
  });

  it("a write that lands between our write and read-back is repaired", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot(); // revision 1
    // Right after A writes revision 2, a tab that read revision 1 overwrites it.
    storage.afterSet = () =>
      storage.data.set(STORAGE_KEY, otherWrite(storage, 2, setReaction(seed(), "evt_soap", "✨", "krystiana", true)));
    A.dispatch(react("💕"));

    expect(storage.envelope().revision).toBe(3);
    expect(reactions(storage.saved())).toMatchObject({ "✨": ["krystiana"], "💕": ["krystiana"] });
  });

  it("a race the read-back can't see is repaired when the storage event arrives", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot();

    // B's whole action runs just before A's write lands: both build on revision 1.
    storage.beforeSet = () => B.dispatch(react("✨"));
    A.dispatch(react("💕"));
    expect(reactions(storage.saved())["✨"]).toBeUndefined(); // B's change was overwritten...

    deliver(A, B);
    expect(reactions(storage.saved())).toMatchObject({ "✨": ["krystiana"], "💕": ["krystiana"] }); // ...and repaired
    deliver(A, B);
    expect(reactions(A.getSnapshot().state)).toEqual(reactions(storage.saved()));
    expect(reactions(B.getSnapshot().state)).toEqual(reactions(storage.saved()));
  });

  // Fix 5
  it("ids survive a replay, so the original Undo still works after a repair", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    B.getSnapshot();

    // A completes a recurring chore (revision 2)...
    const done = A.dispatch(
      action<UndoRecord | null>((s, ids) => {
        const r = completeChoreWithUndo(s, "chore_counters", NOW, ids);
        return { state: r.state, result: r.undo };
      }),
    );
    const record = done.result!;
    const spawnedId = record.kind === "complete" ? record.spawnedId : undefined;
    expect(spawnedId).toBeTruthy();

    // ...then a tab that never saw it (still on revision 1) overwrites revision 2.
    storage.data.set(STORAGE_KEY, otherWrite(storage, 2, setReaction(seed(), "evt_soap", "✨", "krystiana", true)));
    expect(status(storage.saved(), "chore_counters")).toBe("open"); // A's write is lost
    deliver(A, B); // A notices and replays its action

    const repaired = storage.saved();
    expect(status(repaired, "chore_counters")).toBe("done");
    // The replay created the very same next occurrence the Undo record points at.
    expect(repaired.chores.some((c) => c.id === spawnedId && c.status === "open")).toBe(true);

    const undone = A.dispatch(action((s) => {
      const r = undo(s, record);
      return { state: r.state, result: r.ok };
    }));
    expect(undone.result).toBe(true);
    const after = storage.saved();
    expect(status(after, "chore_counters")).toBe("open");
    expect(after.chores.filter((c) => c.seriesId === "series_counters" && c.status === "open")).toHaveLength(1);
    expect(reactions(after)["✨"]).toEqual(["krystiana"]); // B's change untouched
  });

  it("doesn't re-apply an action that a newer write already includes", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    A.dispatch(react("💕"));
    B.dispatch(complete("chore_counters")); // builds on A's write
    deliver(A);
    expect(reactions(storage.saved())["💕"]).toEqual(["krystiana"]);
    expect(A.getSnapshot()).toMatchObject({ pending: 0, persistence: "saved" });
  });

  it("ignores garbage written by another tab and replaces it on the next write", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot();
    storage.data.set(STORAGE_KEY, "{oops");
    deliver(A);
    expect(A.getSnapshot().state.household.name).toBe("The Pink Palace");
    A.dispatch(complete("chore_counters"));
    expect(status(storage.saved(), "chore_counters")).toBe("done");
  });

  it("drops unsaved changes when another tab resets the household", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.getSnapshot();
    storage.failKeys.add(STORAGE_KEY);
    A.dispatch(complete("chore_counters")); // pending in A
    storage.failKeys.clear();
    B.reset();
    deliver(A);
    expect(A.getSnapshot()).toMatchObject({ pending: 0 });
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("open");
  });

  // Fix 2 (second review)
  it("an action taken before another tab's reset arrives is rejected with an explanation", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    const B = tab(storage, "B");
    A.dispatch(complete("chore_plants")); // A's view: plants done
    B.reset(); // storage now holds B's fresh start; A hasn't heard yet

    const out = A.dispatch(complete("chore_counters"));
    expect(out).toBeDefined();
    expect(out.conflict).toBe(RESET_ELSEWHERE);
    expect(out.state).toBeDefined();

    // A adopted the reset instead of writing on top of it.
    const shown = A.getSnapshot().state;
    expect(status(shown, "chore_plants")).toBe("open");
    expect(status(shown, "chore_counters")).toBe("open");
    expect(A.getSnapshot().pending).toBe(0);
    expect(status(storage.saved(), "chore_counters")).toBe("open");
    // A's next action applies to the reset household normally.
    expect(A.dispatch(complete("chore_counters")).conflict).toBeUndefined();
    expect(status(storage.saved(), "chore_counters")).toBe("done");
  });

  // Fix 3 (second review)
  it("replays keep credit with the roommate who acted, even if View as changed", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.getSnapshot();

    // Actions capture their actor (Krystiana) when created, like store.ts does.
    const actor = A.getSnapshot().state.currentUserId;
    expect(actor).toBe("krystiana");
    A.dispatch(action((s, ids) => completeChore(s, "chore_trash", NOW, ids, actor)));
    A.dispatch(
      action((s, ids) =>
        sendNudge(s, { choreId: "chore_dishwasher", tone: "sweet", message: "hi" }, NOW, ids, actor),
      ),
    );
    const input = {
      title: "Descale kettle",
      category: "kitchen" as const,
      assigneeId: "ellie",
      dueAt: NOW.toISOString(),
      recurrence: "once" as const,
      rotate: false,
      points: 1 as const,
    };
    A.dispatch(action((s, ids) => saveChore(s, input, NOW, undefined, ids, actor)));

    // Before A's writes are confirmed, a tab that never saw them switches
    // "View as" to Ellie and overwrites the latest revision.
    const stale = { ...seed(), currentUserId: "ellie" };
    storage.data.set(STORAGE_KEY, otherWrite(storage, storage.envelope().revision, stale));
    deliver(A); // A replays its lost actions on Ellie's view

    const saved = storage.saved();
    expect(saved.currentUserId).toBe("ellie");
    expect(saved.chores.find((c) => c.id === "chore_trash")).toMatchObject({ status: "done", completedBy: "krystiana" });
    expect(saved.activity.find((e) => e.type === "completed" && e.choreId === "chore_trash")).toMatchObject({
      actorId: "krystiana",
    });
    expect(saved.activity.find((e) => e.type === "nudged" && e.choreId === "chore_dishwasher")).toMatchObject({
      actorId: "krystiana",
    });
    const kettle = saved.chores.find((c) => c.title === "Descale kettle")!;
    expect(kettle.createdBy).toBe("krystiana");
    expect(saved.activity.find((e) => e.type === "created" && e.choreId === kettle.id)).toMatchObject({
      actorId: "krystiana",
    });
  });

  it("a reset that couldn't be saved still wins once saving works", () => {
    const storage = new FakeStorage();
    const A = tab(storage, "A");
    A.dispatch(complete("chore_counters")); // revision 2
    storage.failKeys.add(STORAGE_KEY);
    A.reset();
    expect(A.getSnapshot().persistence).toBe("failed");
    expect(status(A.getSnapshot().state, "chore_counters")).toBe("open");
    storage.failKeys.clear();
    expect(A.retrySave()).toBe("saved");
    expect(status(storage.saved(), "chore_counters")).toBe("open");
    expect(storage.envelope().revision).toBe(3);
  });
});
