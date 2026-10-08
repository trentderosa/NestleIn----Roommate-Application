/**
 * Runtime validation for persisted household data.
 *
 * localStorage is untrusted input: it can be stale (older app version),
 * half-written, hand-edited, or written by a buggy build. Everything read
 * from storage goes through `validateHouseholdState` before the UI sees it,
 * so a bad payload is rejected up front instead of crashing a render later.
 *
 * Written by hand (no schema library) to keep dependencies minimal. When a
 * real backend arrives, the same checks map onto database constraints.
 *
 * ## Versions
 * Saved data carries `version`. Older versions are upgraded by
 * `migrateHouseholdState` before validation, so old saves keep loading; the
 * next save writes the current version.
 * - v1 → v2: a roommate's status was one string with the emoji inside
 *   ("exam week, be nice 📚"); v2 splits it into `status` + `statusEmoji` and
 *   adds optional `statusExpiresAt` / `statusUpdatedAt`.
 */
import { ACCENTS, CATEGORIES, RECURRENCE_LABELS } from "./design";
import type { HouseholdState } from "./types";

export const STATE_VERSION = 2;

/** Longest status a roommate can set, in characters (emoji count as one). */
export const STATUS_MAX_LENGTH = 60;

export type ValidationResult =
  | { ok: true; state: HouseholdState }
  | { ok: false; reason: string };

const ACCENT_KEYS = new Set(Object.keys(ACCENTS));
const CATEGORY_KEYS = new Set(Object.keys(CATEGORIES));
const RECURRENCE_KEYS = new Set(Object.keys(RECURRENCE_LABELS));
const TONES = new Set(["sweet", "funny", "direct"]);
// Date.parse accepts loose strings like "1" (year 2001), so require ISO-8601.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

class Invalid extends Error {}

function fail(path: string, problem: string): never {
  throw new Invalid(`${path} ${problem}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (!isRecord(v)) fail(path, "must be an object");
  return v;
}

function array(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "must be an array");
  return v;
}

function str(v: unknown, path: string, { nonEmpty = false } = {}): string {
  if (typeof v !== "string") fail(path, "must be a string");
  if (nonEmpty && v.trim() === "") fail(path, "must not be empty");
  return v;
}

function optStr(v: unknown, path: string) {
  if (v !== undefined) str(v, path);
}

function bool(v: unknown, path: string) {
  if (typeof v !== "boolean") fail(path, "must be true or false");
}

function int(v: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    fail(path, `must be a whole number from ${min}${max < Number.MAX_SAFE_INTEGER ? ` to ${max}` : " up"}`);
  }
  return v;
}

function date(v: unknown, path: string) {
  if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) {
    fail(path, "must be an ISO date");
  }
}

function oneOf(v: unknown, allowed: Set<string>, path: string) {
  if (typeof v !== "string" || !allowed.has(v)) fail(path, `has unknown value ${JSON.stringify(v)}`);
}

function member(v: unknown, members: Set<string>, path: string) {
  if (typeof v !== "string" || !members.has(v)) fail(path, `refers to unknown roommate ${JSON.stringify(v)}`);
}

function unique(id: string, seen: Set<string>, path: string) {
  if (seen.has(id)) fail(path, `duplicates id ${JSON.stringify(id)}`);
  seen.add(id);
}

/**
 * Validate an unknown value as a HouseholdState.
 *
 * Checks shape, enum values, dates, unique ids, and that every roommate
 * reference (assignees, actors, reactions, current user) points at a member.
 *
 * Activity events may reference chores that no longer exist: deleting a chore
 * intentionally keeps its history in the feed. Those references are checked
 * for type only.
 */
export function validateHouseholdState(value: unknown): ValidationResult {
  try {
    return { ok: true, state: check(migrateHouseholdState(value)) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: e.message };
    throw e;
  }
}

// A trailing emoji (with variation selectors, skin tones, or ZWJ sequences).
const TRAILING_EMOJI =
  /\s*(\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*)\s*$/u;

/** Split "exam week, be nice 📚" into its text and trailing emoji. */
export function splitStatus(status: string): { text: string; emoji: string } {
  const match = status.match(TRAILING_EMOJI);
  if (!match) return { text: status.trim(), emoji: "" };
  return { text: status.slice(0, match.index).trim(), emoji: match[1] };
}

/**
 * Upgrade older saved data to the current version. Unknown or malformed input
 * is returned unchanged for validation to reject.
 */
export function migrateHouseholdState(value: unknown): unknown {
  if (!isRecord(value) || value.version !== 1) return value;
  const roommates = Array.isArray(value.roommates)
    ? value.roommates.map((r) => {
        if (!isRecord(r) || typeof r.status !== "string" || "statusEmoji" in r) return r;
        const { text, emoji } = splitStatus(r.status);
        return { ...r, status: Array.from(text).slice(0, STATUS_MAX_LENGTH).join(""), statusEmoji: emoji };
      })
    : value.roommates;
  return { ...value, version: 2, roommates };
}

function statusText(v: unknown, path: string) {
  const text = str(v, path);
  if (Array.from(text).length > STATUS_MAX_LENGTH) fail(path, `must be at most ${STATUS_MAX_LENGTH} characters`);
}

function emojiText(v: unknown, path: string) {
  const text = str(v, path);
  if (Array.from(text).length > 8) fail(path, "must be a single emoji");
}

function check(value: unknown): HouseholdState {
  const root = record(value, "data");
  if (root.version !== STATE_VERSION) fail("version", `must be ${STATE_VERSION}`);

  // Household + members
  const household = record(root.household, "household");
  str(household.id, "household.id", { nonEmpty: true });
  str(household.name, "household.name", { nonEmpty: true });
  str(household.emoji, "household.emoji");
  str(household.inviteCode, "household.inviteCode");
  const memberIds = array(household.memberIds, "household.memberIds");
  if (memberIds.length === 0) fail("household.memberIds", "must not be empty");
  const members = new Set<string>();
  memberIds.forEach((id, i) => unique(str(id, `household.memberIds[${i}]`, { nonEmpty: true }), members, `household.memberIds[${i}]`));

  // Roommates must be exactly the members
  const roommates = array(root.roommates, "roommates");
  const roommateIds = new Set<string>();
  roommates.forEach((raw, i) => {
    const p = `roommates[${i}]`;
    const r = record(raw, p);
    const id = str(r.id, `${p}.id`, { nonEmpty: true });
    unique(id, roommateIds, `${p}.id`);
    member(id, members, `${p}.id`);
    str(r.name, `${p}.name`, { nonEmpty: true });
    oneOf(r.accent, ACCENT_KEYS, `${p}.accent`);
    str(r.emoji, `${p}.emoji`);
    statusText(r.status, `${p}.status`);
    emojiText(r.statusEmoji, `${p}.statusEmoji`);
    if (r.statusExpiresAt !== undefined) date(r.statusExpiresAt, `${p}.statusExpiresAt`);
    if (r.statusUpdatedAt !== undefined) date(r.statusUpdatedAt, `${p}.statusUpdatedAt`);
    int(r.streak, `${p}.streak`, 0);
    const h = record(r.history, `${p}.history`);
    const completed = int(h.completed, `${p}.history.completed`, 0);
    int(h.onTime, `${p}.history.onTime`, 0, completed);
  });
  if (roommateIds.size !== members.size) fail("roommates", "must include every household member");

  member(root.currentUserId, members, "currentUserId");

  // Chores
  const choreIds = new Set<string>();
  array(root.chores, "chores").forEach((raw, i) => {
    const p = `chores[${i}]`;
    const c = record(raw, p);
    unique(str(c.id, `${p}.id`, { nonEmpty: true }), choreIds, `${p}.id`);
    str(c.seriesId, `${p}.seriesId`, { nonEmpty: true });
    str(c.title, `${p}.title`, { nonEmpty: true });
    optStr(c.description, `${p}.description`);
    oneOf(c.category, CATEGORY_KEYS, `${p}.category`);
    member(c.assigneeId, members, `${p}.assigneeId`);
    date(c.dueAt, `${p}.dueAt`);
    oneOf(c.recurrence, RECURRENCE_KEYS, `${p}.recurrence`);
    bool(c.rotate, `${p}.rotate`);
    if (c.anchorDay !== undefined) int(c.anchorDay, `${p}.anchorDay`, 1, 31);
    int(c.points, `${p}.points`, 1, 3);
    member(c.createdBy, members, `${p}.createdBy`);
    date(c.createdAt, `${p}.createdAt`);
    if (c.status === "done") {
      date(c.completedAt, `${p}.completedAt`);
      member(c.completedBy, members, `${p}.completedBy`);
    } else if (c.status === "open") {
      if (c.completedAt !== undefined || c.completedBy !== undefined) {
        fail(p, "is open but has completion details");
      }
    } else {
      fail(`${p}.status`, `has unknown value ${JSON.stringify(c.status)}`);
    }
  });

  // Activity
  const eventIds = new Set<string>();
  array(root.activity, "activity").forEach((raw, i) => {
    const p = `activity[${i}]`;
    const e = record(raw, p);
    unique(str(e.id, `${p}.id`, { nonEmpty: true }), eventIds, `${p}.id`);
    date(e.at, `${p}.at`);
    const reactions = record(e.reactions, `${p}.reactions`);
    for (const [emoji, who] of Object.entries(reactions)) {
      array(who, `${p}.reactions[${emoji}]`).forEach((id, j) =>
        member(id, members, `${p}.reactions[${emoji}][${j}]`),
      );
    }
    switch (e.type) {
      case "completed":
      case "created":
        member(e.actorId, members, `${p}.actorId`);
        str(e.choreId, `${p}.choreId`, { nonEmpty: true });
        str(e.choreTitle, `${p}.choreTitle`);
        member(e.assigneeId, members, `${p}.assigneeId`);
        break;
      case "nudged":
        member(e.actorId, members, `${p}.actorId`);
        member(e.targetId, members, `${p}.targetId`);
        str(e.choreId, `${p}.choreId`, { nonEmpty: true });
        str(e.choreTitle, `${p}.choreTitle`);
        oneOf(e.tone, TONES, `${p}.tone`);
        str(e.message, `${p}.message`);
        break;
      case "rotated":
        str(e.choreTitle, `${p}.choreTitle`);
        member(e.toId, members, `${p}.toId`);
        break;
      case "status":
        member(e.actorId, members, `${p}.actorId`);
        statusText(e.text, `${p}.text`);
        emojiText(e.emoji, `${p}.emoji`);
        break;
      default:
        fail(`${p}.type`, `has unknown value ${JSON.stringify(e.type)}`);
    }
  });

  return value as HouseholdState;
}
