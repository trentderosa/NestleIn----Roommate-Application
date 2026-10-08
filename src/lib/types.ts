/**
 * NestleIn domain model.
 *
 * These types are the contract between the UI and the data layer. Today the
 * data layer is client-side mock state (see store.ts); later these map 1:1 to
 * database tables (households, roommates, chores, activity_events).
 *
 * Dates are ISO-8601 strings so state is JSON-serializable.
 */

export type ID = string;

export type AccentColor = "lilac" | "blush" | "coral" | "butter" | "mint" | "sky";

export type Roommate = {
  id: ID;
  name: string;
  accent: AccentColor;
  /** Small emoji shown on the avatar badge. */
  emoji: string;
  /** Short, user-written status text (max 60 characters), e.g. "exam week, be nice". */
  status: string;
  /** Emoji shown with the status ("" for none). */
  statusEmoji: string;
  /** When the status stops showing (ISO). Unset = until it's changed. */
  statusExpiresAt?: string;
  /** The selected expiry option, preserved when editing. */
  statusClearAfter?: StatusClearAfter;
  /** When the roommate last set their status (ISO). */
  statusUpdatedAt?: string;
  /** Chores finished on time in a row. Grows on time, never punishes (late just doesn't count). */
  streak: number;
  /** Lifetime totals from before the data in this prototype; combined with live data in stats. */
  history: { completed: number; onTime: number };
};

export type Household = {
  id: ID;
  name: string;
  emoji: string;
  inviteCode: string;
  memberIds: ID[];
};

export type ChoreCategory =
  | "kitchen"
  | "bathroom"
  | "trash"
  | "living"
  | "supplies"
  | "plants"
  | "laundry";

export type Recurrence = "once" | "daily" | "weekly" | "biweekly" | "monthly";

/** 1 = quick win, 2 = medium, 3 = big job */
export type Points = 1 | 2 | 3;

export type Chore = {
  id: ID;
  /** Recurring chores create a new chore per occurrence; all share a seriesId. */
  seriesId: ID;
  title: string;
  description?: string;
  category: ChoreCategory;
  assigneeId: ID;
  /** ISO timestamp. */
  dueAt: string;
  recurrence: Recurrence;
  /** When true, the next occurrence goes to the next roommate in rotation order. */
  rotate: boolean;
  /**
   * Monthly chores only: the intended day of month, so a chore due on the
   * 31st stays on the 31st after a short month (Jan 31 -> Feb 28 -> Mar 31).
   * Unset means "use the due date's day".
   */
  anchorDay?: number;
  points: Points;
  createdBy: ID;
  createdAt: string;
  status: "open" | "done";
  completedAt?: string;
  completedBy?: ID;
};

/** Display state, derived from a Chore + the current time. Never stored. */
export type ChoreTiming = "overdue" | "today" | "upcoming" | "done";

export type NudgeTone = "sweet" | "funny" | "direct";

type EventBase = {
  id: ID;
  at: string;
  /** emoji -> roommate ids who reacted */
  reactions: Record<string, ID[]>;
};

/** The type-specific part of an activity event. */
export type ActivityEventData =
  | { type: "completed"; actorId: ID; choreId: ID; choreTitle: string; assigneeId: ID }
  | {
      type: "nudged";
      actorId: ID;
      targetId: ID;
      choreId: ID;
      choreTitle: string;
      tone: NudgeTone;
      message: string;
    }
  | { type: "rotated"; choreTitle: string; toId: ID }
  /** A quiet entry when someone sets a status. */
  | { type: "status"; actorId: ID; text: string; emoji: string }
  | { type: "created"; actorId: ID; choreId: ID; choreTitle: string; assigneeId: ID };

export type ActivityEvent = EventBase & ActivityEventData;

export type ActivityType = ActivityEvent["type"];

/** How long a status lasts. */
export type StatusClearAfter = "today" | "week" | "never";

export type HouseholdState = {
  version: number;
  household: Household;
  roommates: Roommate[];
  chores: Chore[];
  /** Newest first. */
  activity: ActivityEvent[];
  /** The roommate using the app. Replaced by the authenticated user later. */
  currentUserId: ID;
};

/** Fields the create/edit form controls. */
export type ChoreInput = Pick<
  Chore,
  "title" | "description" | "category" | "assigneeId" | "dueAt" | "recurrence" | "rotate" | "points"
>;
