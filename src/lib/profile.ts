/**
 * Profile logic: status, upcoming chores, and achievements.
 *
 * Pure functions, like chores.ts. Achievements are derived from the
 * household data on every render (nothing extra is stored), so they can't
 * drift out of sync and need no migration.
 */
import { newId, roommateStats, type IdSource } from "./chores";
import { startOfDay } from "./time";
import type { Chore, HouseholdState, ID, Roommate, StatusClearAfter } from "./types";
import { STATUS_MAX_LENGTH } from "./validate";

export { STATUS_MAX_LENGTH };

/** Emoji offered in the status picker. */
export const STATUS_EMOJI = ["📚", "☕", "🍵", "🏋️", "🌙", "✈️", "🎧", "🤒", "🫶", "🎉", "🧘‍♀️", "💼"];

/** One-tap statuses. */
export const STATUS_QUICK_PICKS: { emoji: string; text: string }[] = [
  { emoji: "📚", text: "exam week, be nice" },
  { emoji: "🏋️", text: "at the gym" },
  { emoji: "🌙", text: "closing shift tonight" },
  { emoji: "✈️", text: "away this weekend" },
  { emoji: "🫶", text: "free to help out" },
];

export const CLEAR_AFTER_LABELS: Record<StatusClearAfter, string> = {
  today: "Today",
  week: "This week",
  never: "Never",
};

/** When a status set now should stop showing. */
export function statusExpiry(clearAfter: StatusClearAfter, now: Date): string | undefined {
  if (clearAfter === "never") return undefined;
  const end = startOfDay(now);
  // End of today, or end of this week (weeks end on Sunday).
  const daysToAdd = clearAfter === "today" ? 1 : ((7 - now.getDay()) % 7) + 1;
  end.setDate(end.getDate() + daysToAdd);
  end.setMilliseconds(-1);
  return end.toISOString();
}

/** Recover the selection for earlier v2 saves that only recorded timestamps. */
export function statusClearAfter(roommate: Roommate, now: Date): StatusClearAfter {
  if (!activeStatus(roommate, now) || !roommate.statusExpiresAt) return "never";
  if (roommate.statusClearAfter) return roommate.statusClearAfter;
  const setAt = new Date(roommate.statusUpdatedAt ?? now);
  return roommate.statusExpiresAt === statusExpiry("today", setAt) ? "today" : "week";
}

/** The status to show right now, or null if none / expired. */
export function activeStatus(roommate: Roommate, now: Date): { text: string; emoji: string } | null {
  if (!roommate.status && !roommate.statusEmoji) return null;
  if (roommate.statusExpiresAt && new Date(roommate.statusExpiresAt).getTime() <= now.getTime()) return null;
  return { text: roommate.status, emoji: roommate.statusEmoji };
}

export type StatusInput = { text: string; emoji: string; clearAfter: StatusClearAfter };

/**
 * Set (or clear, with empty text and emoji) a roommate's status. Setting one
 * posts a quiet feed entry; clearing doesn't. Replay-safe: the feed entry's id
 * comes from `ids`, and re-applying the same action changes nothing.
 */
export function setStatus(
  state: HouseholdState,
  actorId: ID,
  input: StatusInput,
  now: Date,
  ids: IdSource = newId,
): HouseholdState {
  const me = state.roommates.find((r) => r.id === actorId);
  if (!me) return state;
  const text = Array.from(input.text.trim()).slice(0, STATUS_MAX_LENGTH).join("");
  const emoji = input.emoji;
  const clearing = !text && !emoji;
  const eventId = clearing ? null : ids("evt");
  if (eventId && state.activity.some((e) => e.id === eventId)) return state; // already applied

  const updated: Roommate = {
    ...me,
    status: text,
    statusEmoji: emoji,
    statusExpiresAt: clearing ? undefined : statusExpiry(input.clearAfter, now),
    statusClearAfter: clearing ? undefined : input.clearAfter,
    statusUpdatedAt: now.toISOString(),
  };
  const roommates = state.roommates.map((r) => (r.id === actorId ? updated : r));
  if (!eventId) {
    const unchanged = !me.status && !me.statusEmoji;
    return unchanged ? state : { ...state, roommates };
  }
  return {
    ...state,
    roommates,
    activity: [
      { id: eventId, at: now.toISOString(), reactions: {}, type: "status", actorId, text, emoji },
      ...state.activity,
    ],
  };
}

/** A roommate's next open chores (overdue first), soonest first. */
export function upcomingFor(state: HouseholdState, roommateId: ID, limit = 5): Chore[] {
  return state.chores
    .filter((c) => c.status === "open" && c.assigneeId === roommateId)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, limit);
}

export type Achievement = {
  id: string;
  emoji: string;
  title: string;
  /** How to earn it (shown on locked badges). */
  hint: string;
  earned: boolean;
};

/** Badges for one roommate, derived from the household data. Private to them. */
export function achievementsFor(state: HouseholdState, roommate: Roommate, now: Date): Achievement[] {
  const stats = roommateStats(state, roommate, now);
  const mine = state.chores.filter((c) => c.status === "done" && c.completedBy === roommate.id);
  const sent = state.activity.filter((e) => e.type === "nudged" && e.actorId === roommate.id);
  const statuses = state.activity.filter((e) => e.type === "status" && e.actorId === roommate.id);
  const onTime = roommate.history.onTime + mine.filter((c) => (c.completedAt ?? "") <= c.dueAt).length;

  const badge = (id: string, emoji: string, title: string, hint: string, earned: boolean): Achievement => ({
    id,
    emoji,
    title,
    hint,
    earned,
  });

  return [
    badge("first-done", "✨", "First Done", "Finish your first chore", stats.completed >= 1),
    badge("ten-down", "🔟", "Ten down", "Finish 10 chores", stats.completed >= 10),
    badge("on-a-roll", "🔥", "On a roll", "Finish 5 chores on time in a row", roommate.streak >= 5),
    badge("early-bird", "🐣", "Early bird", "Finish 25 chores on time", onTime >= 25),
    badge("helping-hand", "🫶", "Helping hand", "Cover a roommate's chore", mine.some((c) => c.assigneeId !== roommate.id)),
    badge("big-job", "💪", "Big job energy", "Finish a big job (3 stars)", mine.some((c) => c.points === 3)),
    badge("kind-nudge", "💕", "Kind nudger", "Send a sweet nudge", sent.some((e) => e.type === "nudged" && e.tone === "sweet")),
    badge("say-hi", "💬", "Say hi", "Set a status", statuses.length > 0),
  ];
}
