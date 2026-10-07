import { describe, expect, it } from "vitest";
import {
  boardSections,
  choreTiming,
  completeChore,
  completeChoreWithUndo,
  deleteChoreWithUndo,
  nextAssignee,
  nextDueDate,
  nudgeCooldownRemaining,
  saveChore,
  sendNudge,
  toggleReaction,
  undo,
} from "./chores";
import { createSeedState } from "./mock-data";
import { HOUR, MINUTE } from "./time";

const NOW = new Date(2026, 9, 7, 15, 0); // Wed Oct 7 2026, 3:00 PM local

function seed() {
  return createSeedState(NOW);
}

describe("seed data", () => {
  it("has something overdue, due today, upcoming, and done", () => {
    const s = seed();
    const timings = new Set(s.chores.map((c) => choreTiming(c, NOW)));
    expect(timings).toEqual(new Set(["overdue", "today", "upcoming", "done"]));
  });

  it("builds board sections", () => {
    const { overdue, today, upcoming, recentlyDone } = boardSections(seed().chores, NOW);
    expect(overdue.map((c) => c.id)).toContain("chore_trash");
    expect(today.length).toBeGreaterThan(0);
    expect(upcoming.length).toBeGreaterThan(0);
    expect(recentlyDone[0].id).toBe("chore_soap_done");
  });
});

describe("recurrence", () => {
  it("returns null for one-off chores", () => {
    expect(nextDueDate(NOW.toISOString(), "once", NOW)).toBeNull();
  });

  it("adds one interval when finished on time", () => {
    const due = new Date(2026, 9, 7, 20, 0);
    const next = nextDueDate(due.toISOString(), "weekly", NOW)!;
    expect(next).toEqual(new Date(2026, 9, 14, 20, 0));
  });

  it("skips past now when finished very late", () => {
    const due = new Date(2026, 9, 1, 9, 0); // 6 days late
    const next = nextDueDate(due.toISOString(), "daily", NOW)!;
    expect(next).toEqual(new Date(2026, 9, 8, 9, 0));
  });

  it("rotates through members and wraps", () => {
    const ids = ["a", "b", "c"];
    expect(nextAssignee("a", ids)).toBe("b");
    expect(nextAssignee("c", ids)).toBe("a");
  });
});

describe("completeChore", () => {
  it("marks done, spawns the next rotated occurrence, and logs activity", () => {
    const s = seed();
    const next = completeChore(s, "chore_trash", NOW);
    const done = next.chores.find((c) => c.id === "chore_trash")!;
    expect(done.status).toBe("done");
    expect(done.completedBy).toBe("krystiana");

    const spawned = next.chores.filter((c) => c.seriesId === "series_trash" && c.status === "open");
    expect(spawned).toHaveLength(1);
    expect(spawned[0].assigneeId).toBe("katie"); // ellie -> katie
    expect(new Date(spawned[0].dueAt).getTime()).toBeGreaterThan(NOW.getTime());

    expect(next.activity[0]).toMatchObject({ type: "rotated", toId: "katie" });
    expect(next.activity[1]).toMatchObject({ type: "completed", choreId: "chore_trash" });
  });

  it("is a no-op for an already-done chore", () => {
    const s = seed();
    expect(completeChore(s, "chore_soap_done", NOW)).toBe(s);
  });

  it("grows the streak only when on time", () => {
    const s = seed();
    const before = s.roommates.find((r) => r.id === "krystiana")!.streak;
    const onTime = completeChore(s, "chore_counters", NOW);
    expect(onTime.roommates.find((r) => r.id === "krystiana")!.streak).toBe(before + 1);
    const late = completeChore(s, "chore_trash", NOW);
    expect(late.roommates.find((r) => r.id === "krystiana")!.streak).toBe(before);
  });
});

describe("nudges", () => {
  it("logs a nudge and enforces a cooldown", () => {
    const s = seed();
    const input = { choreId: "chore_dishwasher", tone: "sweet" as const, message: " hi! " };
    const once = sendNudge(s, input, NOW);
    expect(once.activity[0]).toMatchObject({ type: "nudged", targetId: "emery", message: "hi!" });
    expect(nudgeCooldownRemaining(once, "chore_dishwasher", "krystiana", NOW)).toBe(30 * MINUTE);

    const twice = sendNudge(once, input, new Date(NOW.getTime() + 5 * MINUTE));
    expect(twice).toBe(once);

    const later = sendNudge(once, input, new Date(NOW.getTime() + HOUR));
    expect(later.activity).toHaveLength(once.activity.length + 1);
  });

  it("can't nudge yourself", () => {
    const s = seed();
    expect(sendNudge(s, { choreId: "chore_counters", tone: "direct", message: "x" }, NOW)).toBe(s);
  });
});

describe("saveChore", () => {
  it("creates a chore with a created event and drops rotate for one-offs", () => {
    const s = seed();
    const next = saveChore(
      s,
      {
        title: "  Descale kettle ",
        category: "kitchen",
        assigneeId: "ellie",
        dueAt: NOW.toISOString(),
        recurrence: "once",
        rotate: true,
        points: 1,
        description: "  ",
      },
      NOW,
    );
    const created = next.chores.at(-1)!;
    expect(created).toMatchObject({ title: "Descale kettle", rotate: false, createdBy: "krystiana" });
    expect(created.description).toBeUndefined();
    expect(next.activity[0]).toMatchObject({ type: "created", choreTitle: "Descale kettle" });
  });
});

describe("toggleReaction", () => {
  it("adds and removes the current user's reaction", () => {
    const s = seed();
    const added = toggleReaction(s, "evt_soap", "💕");
    expect(added.activity.find((e) => e.id === "evt_soap")!.reactions["💕"]).toEqual(["krystiana"]);
    const removed = toggleReaction(added, "evt_soap", "💕");
    expect(removed.activity.find((e) => e.id === "evt_soap")!.reactions["💕"]).toBeUndefined();
  });
});

describe("monthly recurrence (review fix)", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 18, 0);
  // `now` well before the dates so nothing is skipped for being in the past.
  const early = new Date(2026, 0, 1);

  it("clamps to the end of a shorter month instead of overflowing", () => {
    expect(nextDueDate(at(2027, 0, 31).toISOString(), "monthly", early)).toEqual(at(2027, 1, 28));
    expect(nextDueDate(at(2028, 0, 31).toISOString(), "monthly", early)).toEqual(at(2028, 1, 29)); // leap year
  });

  it("returns to the anchor day after a short month", () => {
    expect(nextDueDate(at(2027, 1, 28).toISOString(), "monthly", early, 31)).toEqual(at(2027, 2, 31));
    expect(nextDueDate(at(2027, 2, 31).toISOString(), "monthly", early, 31)).toEqual(at(2027, 3, 30));
  });

  it("keeps the anchor across completions: Jan 31 -> Feb 28 -> Mar 31", () => {
    let s = seed();
    s = { ...s, chores: s.chores.map((c) => (c.id === "chore_tp" ? { ...c, dueAt: at(2027, 0, 31).toISOString() } : c)) };
    const first = completeChore(s, "chore_tp", early);
    const feb = first.chores.find((c) => c.seriesId === "series_tp" && c.status === "open")!;
    expect(new Date(feb.dueAt)).toEqual(at(2027, 1, 28));
    expect(feb.anchorDay).toBe(31);

    const second = completeChore(first, feb.id, early);
    const mar = second.chores.find((c) => c.seriesId === "series_tp" && c.status === "open")!;
    expect(new Date(mar.dueAt)).toEqual(at(2027, 2, 31));
  });
});

describe("undo (review fix)", () => {
  it("undoing one completion keeps a later, unrelated completion", () => {
    const s = seed();
    const a = completeChoreWithUndo(s, "chore_counters", NOW);
    const b = completeChoreWithUndo(a.state, "chore_trash", NOW);
    const after = undo(b.state, a.undo!);

    // A is open again, and its spawned next occurrence and events are gone.
    expect(after.chores.find((c) => c.id === "chore_counters")!.status).toBe("open");
    expect(after.chores.filter((c) => c.seriesId === "series_counters" && c.status === "open")).toHaveLength(1);
    expect(after.activity.some((e) => e.type === "completed" && e.choreId === "chore_counters")).toBe(false);

    // B's completion, next occurrence, and events survive.
    expect(after.chores.find((c) => c.id === "chore_trash")!.status).toBe("done");
    expect(after.chores.filter((c) => c.seriesId === "series_trash" && c.status === "open")).toHaveLength(1);
    expect(after.activity.some((e) => e.type === "completed" && e.choreId === "chore_trash")).toBe(true);

    // Streak: A was on time (+1, now reverted); B was late (no change).
    const streak = (st: typeof s) => st.roommates.find((r) => r.id === "krystiana")!.streak;
    expect(streak(after)).toBe(streak(s));
  });

  it("keeps reactions and nudges made after the completion", () => {
    const a = completeChoreWithUndo(seed(), "chore_counters", NOW);
    const reacted = toggleReaction(a.state, "evt_soap", "💕");
    const nudged = sendNudge(reacted, { choreId: "chore_dishwasher", tone: "sweet", message: "hi" }, NOW);
    const after = undo(nudged, a.undo!);
    expect(after.activity.find((e) => e.id === "evt_soap")!.reactions["💕"]).toEqual(["krystiana"]);
    expect(after.activity.some((e) => e.type === "nudged" && e.choreId === "chore_dishwasher" && e.message === "hi")).toBe(true);
  });

  it("restores a deleted chore in place without dropping later changes", () => {
    const s = seed();
    const index = s.chores.findIndex((c) => c.id === "chore_fridge");
    const del = deleteChoreWithUndo(s, "chore_fridge");
    const later = completeChore(del.state, "chore_counters", NOW);
    const after = undo(later, del.undo!);
    expect(after.chores[index].id).toBe("chore_fridge");
    expect(after.chores.find((c) => c.id === "chore_counters")!.status).toBe("done");
  });
});
