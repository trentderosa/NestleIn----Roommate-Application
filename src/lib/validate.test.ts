import { describe, expect, it } from "vitest";
import { createSeedState } from "./mock-data";
import type { HouseholdState } from "./types";
import { migrateHouseholdState, splitStatus, validateHouseholdState } from "./validate";

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
    ["an unknown future version", { ...seed(), version: 3 }, "version must be 2"],
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

/** The seed as the first prototype (schema v1) saved it: status with the emoji inside. */
function v1Seed() {
  const s = seed() as unknown as Record<string, unknown> & { roommates: Record<string, unknown>[] };
  return {
    ...s,
    version: 1,
    roommates: s.roommates.map((r) => {
      const { statusEmoji, statusExpiresAt, statusUpdatedAt, ...rest } = r;
      void statusExpiresAt;
      void statusUpdatedAt;
      return { ...rest, status: `${r.status} ${statusEmoji}` };
    }),
  };
}

describe("schema v2 (profile status)", () => {
  it("migrates v1 saves: the trailing emoji moves into statusEmoji", () => {
    const result = validateHouseholdState(v1Seed());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.version).toBe(2);
    expect(result.state.roommates[1]).toMatchObject({ status: "exam week, be nice", statusEmoji: "📚" });
  });

  it("migration leaves statuses without an emoji alone and doesn't touch v2 data", () => {
    expect(splitStatus("just vibing")).toEqual({ text: "just vibing", emoji: "" });
    expect(splitStatus("gym 🏋️")).toEqual({ text: "gym", emoji: "🏋️" });
    const current = seed();
    expect(migrateHouseholdState(current)).toBe(current);
  });

  it("rejects a status longer than 60 characters", () => {
    const s = seed();
    s.roommates[0].status = "x".repeat(61);
    expect(reason(s)).toBe("roommates[0].status must be at most 60 characters");
    s.roommates[0].status = "🍵".repeat(60); // emoji count as one character
    expect(validateHouseholdState(s).ok).toBe(true);
  });

  it("rejects a missing or oversized status emoji and bad status dates", () => {
    const s = seed() as unknown as { roommates: Record<string, unknown>[] };
    delete s.roommates[0].statusEmoji;
    expect(reason(s)).toBe("roommates[0].statusEmoji must be a string");

    const t = seed();
    t.roommates[0].statusEmoji = "🍵🍵🍵🍵🍵🍵🍵🍵🍵";
    expect(reason(t)).toBe("roommates[0].statusEmoji must be a single emoji");

    const u = seed();
    u.roommates[0].statusExpiresAt = "tomorrow";
    expect(reason(u)).toBe("roommates[0].statusExpiresAt must be an ISO date");
  });

  it("validates status feed entries", () => {
    const s = seed();
    s.activity.unshift({ id: "evt_s", at: NOW.toISOString(), reactions: {}, type: "status", actorId: "ghost", text: "hi", emoji: "" });
    expect(reason(s)).toBe('activity[0].actorId refers to unknown roommate "ghost"');
    (s.activity[0] as { actorId: string }).actorId = "ellie";
    expect(validateHouseholdState(s).ok).toBe(true);
    (s.activity[0] as { text: string }).text = "x".repeat(61);
    expect(reason(s)).toBe("activity[0].text must be at most 60 characters");
  });
});
