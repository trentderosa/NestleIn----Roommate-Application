import { describe, expect, it } from "vitest";
import { createSeedState } from "./mock-data";
import type { HouseholdState } from "./types";
import { validateHouseholdState } from "./validate";

const NOW = new Date(2026, 9, 7, 15, 0);

/** A fresh, deep-copied seed to corrupt in each test. */
function seed(): HouseholdState {
  return JSON.parse(JSON.stringify(createSeedState(NOW)));
}

function reason(value: unknown): string {
  const result = validateHouseholdState(value);
  if (result.ok) throw new Error("expected invalid data to be rejected");
  return result.reason;
}

describe("validateHouseholdState", () => {
  it("accepts the seed (after a JSON round trip)", () => {
    expect(validateHouseholdState(seed()).ok).toBe(true);
  });

  it("accepts activity that refers to a deleted chore (history is kept on delete)", () => {
    const s = seed();
    s.chores = s.chores.filter((c) => c.id !== "chore_trash");
    expect(validateHouseholdState(s).ok).toBe(true);
  });

  it.each([
    ["null", null, "data must be an object"],
    ["an array", [], "data must be an object"],
    ["a wrong version", { ...seed(), version: 2 }, "version must be 1"],
  ])("rejects %s", (_, value, expected) => {
    expect(reason(value)).toBe(expected);
  });

  it("rejects missing collections (the shape that used to crash the app)", () => {
    expect(reason({ version: 1, chores: [] })).toBe("household must be an object");
    const s = seed() as Partial<HouseholdState>;
    delete s.roommates;
    expect(reason(s)).toBe("roommates must be an array");
  });

  it("rejects unknown enum values", () => {
    const s = seed();
    (s.chores[0] as { category: string }).category = "garage";
    expect(reason(s)).toBe('chores[0].category has unknown value "garage"');

    const t = seed();
    (t.chores[0] as { recurrence: string }).recurrence = "yearly";
    expect(reason(t)).toContain("chores[0].recurrence");

    const u = seed();
    (u.roommates[0] as { accent: string }).accent = "neon";
    expect(reason(u)).toContain("roommates[0].accent");

    const v = seed();
    (v.chores[0] as { points: number }).points = 5;
    expect(reason(v)).toContain("chores[0].points");
  });

  it("rejects loose or broken dates", () => {
    const s = seed();
    s.chores[0].dueAt = "1"; // Date.parse("1") is a valid year-2001 date
    expect(reason(s)).toBe("chores[0].dueAt must be an ISO date");

    const t = seed();
    t.activity[0].at = "2026-13-45T99:00:00Z";
    expect(reason(t)).toBe("activity[0].at must be an ISO date");
  });

  it("rejects references to people who aren't members", () => {
    const s = seed();
    s.chores[0].assigneeId = "ghost";
    expect(reason(s)).toBe('chores[0].assigneeId refers to unknown roommate "ghost"');

    const t = seed();
    t.currentUserId = "ghost";
    expect(reason(t)).toContain("currentUserId");

    const u = seed();
    u.activity[0].reactions = { "💕": ["ghost"] };
    expect(reason(u)).toContain("reactions");

    const v = seed();
    v.household.memberIds = v.household.memberIds.slice(1);
    expect(reason(v)).toContain("roommates[0].id refers to unknown roommate");
  });

  it("rejects duplicate ids", () => {
    const s = seed();
    s.chores[1].id = s.chores[0].id;
    expect(reason(s)).toContain("chores[1].id duplicates id");
  });

  it("rejects completion details that contradict status", () => {
    const s = seed();
    const open = s.chores.find((c) => c.status === "open")!;
    open.completedAt = NOW.toISOString();
    expect(reason(s)).toMatch(/is open but has completion details/);

    const t = seed();
    const done = t.chores.find((c) => c.status === "done")!;
    delete done.completedAt;
    expect(reason(t)).toMatch(/completedAt must be an ISO date/);
  });

  it("rejects impossible stats and unknown event types", () => {
    const s = seed();
    s.roommates[0].history = { completed: 3, onTime: 9 };
    expect(reason(s)).toContain("roommates[0].history.onTime");

    const t = seed();
    (t.activity[0] as { type: string }).type = "teleported";
    expect(reason(t)).toBe('activity[0].type has unknown value "teleported"');
  });
});
