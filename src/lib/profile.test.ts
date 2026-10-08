import { describe, expect, it } from "vitest";
import { completeChore, sendNudge } from "./chores";
import { createSeedState } from "./mock-data";
import { achievementsFor, activeStatus, setStatus, statusExpiry, upcomingFor } from "./profile";
import { idsFor } from "./store-core";
import type { HouseholdState } from "./types";
import { validateHouseholdState } from "./validate";

const NOW = new Date(2026, 9, 7, 15, 0); // Wednesday 3:00 PM local
const seed = () => createSeedState(NOW);
const me = (s: HouseholdState, id = "krystiana") => s.roommates.find((r) => r.id === id)!;

describe("status expiry", () => {
  it("'Today' lasts until the end of today", () => {
    expect(new Date(statusExpiry("today", NOW)!)).toEqual(new Date(2026, 9, 7, 23, 59, 59, 999));
  });

  it("'This week' lasts until the end of Sunday", () => {
    expect(new Date(statusExpiry("week", NOW)!)).toEqual(new Date(2026, 9, 11, 23, 59, 59, 999));
    const sunday = new Date(2026, 9, 11, 10, 0);
    expect(new Date(statusExpiry("week", sunday)!)).toEqual(new Date(2026, 9, 11, 23, 59, 59, 999));
  });

  it("'Never' doesn't expire", () => {
    expect(statusExpiry("never", NOW)).toBeUndefined();
  });

  it("an expired status stops showing", () => {
    const s = setStatus(seed(), "krystiana", { text: "at the gym", emoji: "🏋️", clearAfter: "today" }, NOW);
    expect(activeStatus(me(s), NOW)).toEqual({ text: "at the gym", emoji: "🏋️" });
    expect(activeStatus(me(s), new Date(2026, 9, 7, 23, 59))).not.toBeNull();
    expect(activeStatus(me(s), new Date(2026, 9, 8, 0, 0))).toBeNull();
  });
});

describe("setStatus", () => {
  it("updates the roommate and posts a quiet feed entry", () => {
    const s = setStatus(seed(), "krystiana", { text: "  exam week  ", emoji: "📚", clearAfter: "never" }, NOW);
    expect(me(s)).toMatchObject({ status: "exam week", statusEmoji: "📚", statusUpdatedAt: NOW.toISOString() });
    expect(me(s).statusExpiresAt).toBeUndefined();
    expect(s.activity[0]).toMatchObject({ type: "status", actorId: "krystiana", text: "exam week", emoji: "📚" });
    expect(validateHouseholdState(JSON.parse(JSON.stringify(s))).ok).toBe(true);
  });

  it("caps the text at 60 characters (emoji count as one)", () => {
    const long = "🍵".repeat(70);
    const s = setStatus(seed(), "krystiana", { text: long, emoji: "", clearAfter: "never" }, NOW);
    expect(Array.from(me(s).status)).toHaveLength(60);
  });

  it("clearing removes the status without a feed entry", () => {
    const set = setStatus(seed(), "krystiana", { text: "at the gym", emoji: "🏋️", clearAfter: "never" }, NOW);
    const cleared = setStatus(set, "krystiana", { text: "", emoji: "", clearAfter: "never" }, NOW);
    expect(activeStatus(me(cleared), NOW)).toBeNull();
    expect(cleared.activity.length).toBe(set.activity.length);
  });

  it("is replay-safe: the same action applied twice changes nothing more", () => {
    const input = { text: "away this weekend", emoji: "✈️", clearAfter: "week" as const };
    const once = setStatus(seed(), "krystiana", input, NOW, idsFor("act_status"));
    const twice = setStatus(once, "krystiana", input, NOW, idsFor("act_status"));
    expect(twice).toBe(once);
  });

  it("only changes the acting roommate", () => {
    const s = setStatus(seed(), "ellie", { text: "napping", emoji: "", clearAfter: "never" }, NOW);
    expect(me(s, "ellie").status).toBe("napping");
    expect(me(s).status).toBe(me(seed()).status);
  });
});

describe("upcomingFor", () => {
  it("lists a roommate's open chores, soonest (and late) first, up to the limit", () => {
    const s = seed();
    const list = upcomingFor(s, "emery", 5);
    expect(list.every((c) => c.assigneeId === "emery" && c.status === "open")).toBe(true);
    expect(list.map((c) => c.dueAt)).toEqual([...list.map((c) => c.dueAt)].sort());
    expect(list[0].id).toBe("chore_dishwasher"); // running late
    expect(upcomingFor(s, "emery", 1)).toHaveLength(1);
  });
});

describe("achievementsFor", () => {
  it("derives badges from what the roommate actually did", () => {
    let s = seed();
    const before = Object.fromEntries(achievementsFor(s, me(s), NOW).map((b) => [b.id, b.earned]));
    expect(before["helping-hand"]).toBe(false);
    expect(before["kind-nudge"]).toBe(false);
    expect(before["say-hi"]).toBe(false);
    expect(before["first-done"]).toBe(true); // from prior history

    s = completeChore(s, "chore_trash", NOW); // covers Ellie's chore
    s = sendNudge(s, { choreId: "chore_dishwasher", tone: "sweet", message: "hi" }, NOW);
    s = setStatus(s, "krystiana", { text: "hi", emoji: "", clearAfter: "never" }, NOW);
    const after = Object.fromEntries(achievementsFor(s, me(s), NOW).map((b) => [b.id, b.earned]));
    expect(after).toMatchObject({ "helping-hand": true, "kind-nudge": true, "say-hi": true });
  });

  it("offers 6–8 badges, each with a hint", () => {
    const badges = achievementsFor(seed(), me(seed()), NOW);
    expect(badges.length).toBeGreaterThanOrEqual(6);
    expect(badges.length).toBeLessThanOrEqual(8);
    expect(badges.every((b) => b.hint.length > 0)).toBe(true);
  });
});
