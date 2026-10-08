/**
 * Pure household logic: selectors and state transitions.
 *
 * Every transition takes the current state and returns a new one, with `now`
 * passed in explicitly so it is easy to test. When a real backend arrives,
 * these become the bodies of server mutations (or stay as optimistic updates).
 */
import { CATEGORIES } from "./design";
import { DAY, HOUR, MINUTE, dayDiff } from "./time";
import type {
  ActivityEvent,
  ActivityEventData,
  Chore,
  ChoreInput,
  ChoreTiming,
  HouseholdState,
  ID,
  NudgeTone,
  Recurrence,
  Roommate,
} from "./types";

export const NUDGE_COOLDOWN_MS = 30 * MINUTE;
/** Upcoming = due within this window (after today). */
export const UPCOMING_WINDOW_DAYS = 7;

export function newId(prefix: string): ID {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function isOverdue(chore: Chore, now: Date): boolean {
  return chore.status === "open" && new Date(chore.dueAt).getTime() < now.getTime();
}

export function choreTiming(chore: Chore, now: Date): ChoreTiming {
  if (chore.status === "done") return "done";
  if (isOverdue(chore, now)) return "overdue";
  return dayDiff(new Date(chore.dueAt), now) === 0 ? "today" : "upcoming";
}

const byDueAsc = (a: Chore, b: Chore) => a.dueAt.localeCompare(b.dueAt);
const byCompletedDesc = (a: Chore, b: Chore) =>
  (b.completedAt ?? "").localeCompare(a.completedAt ?? "");

export type ChoreFilter = "today" | "upcoming" | "overdue" | "completed" | "all";

export function filterChores(chores: Chore[], filter: ChoreFilter, now: Date): Chore[] {
  switch (filter) {
    case "today":
      return chores.filter((c) => choreTiming(c, now) === "today").sort(byDueAsc);
    case "upcoming":
      return chores.filter((c) => choreTiming(c, now) === "upcoming").sort(byDueAsc);
    case "overdue":
      return chores.filter((c) => choreTiming(c, now) === "overdue").sort(byDueAsc);
    case "completed":
      return chores.filter((c) => c.status === "done").sort(byCompletedDesc);
    case "all":
      return [...chores].sort(byDueAsc);
  }
}

/** Everything the House Board needs, in one pass. */
export function boardSections(chores: Chore[], now: Date) {
  const upcomingCutoff = now.getTime() + UPCOMING_WINDOW_DAYS * DAY;
  const doneToday = chores.filter(
    (c) => c.status === "done" && c.completedAt && dayDiff(new Date(c.completedAt), now) === 0,
  );
  const overdue = filterChores(chores, "overdue", now);
  const today = filterChores(chores, "today", now);
  return {
    overdue,
    today,
    upcoming: filterChores(chores, "upcoming", now).filter(
      (c) => new Date(c.dueAt).getTime() <= upcomingCutoff,
    ),
    recentlyDone: filterChores(chores, "completed", now).slice(0, 3),
    /** Progress for "today": things due today (incl. late) vs. finished today. */
    todayTotal: overdue.length + today.length + doneToday.length,
    todayDone: doneToday.length,
  };
}

export function roommateStats(state: HouseholdState, roommate: Roommate, now: Date) {
  const weekAgo = now.getTime() - 7 * DAY;
  const completedByMe = state.chores.filter(
    (c) => c.status === "done" && c.completedBy === roommate.id,
  );
  const live = {
    completed: completedByMe.length,
    onTime: completedByMe.filter((c) => (c.completedAt ?? "") <= c.dueAt).length,
  };
  const completed = roommate.history.completed + live.completed;
  const onTime = roommate.history.onTime + live.onTime;
  const thisWeek = completedByMe.filter((c) => new Date(c.completedAt!).getTime() >= weekAgo);
  const open = state.chores.filter((c) => c.status === "open" && c.assigneeId === roommate.id);
  return {
    open,
    overdueCount: open.filter((c) => isOverdue(c, now)).length,
    doneThisWeek: thisWeek.length,
    pointsThisWeek: thisWeek.reduce((sum, c) => sum + c.points, 0),
    completed,
    reliability: completed === 0 ? 100 : Math.round((onTime / completed) * 100),
  };
}

/** Milliseconds until `actorId` may nudge about `choreId` again (0 = allowed). */
export function nudgeCooldownRemaining(
  state: HouseholdState,
  choreId: ID,
  actorId: ID,
  now: Date,
): number {
  const last = state.activity.find(
    (e) => e.type === "nudged" && e.choreId === choreId && e.actorId === actorId,
  );
  if (!last) return 0;
  return Math.max(0, new Date(last.at).getTime() + NUDGE_COOLDOWN_MS - now.getTime());
}

// ---------------------------------------------------------------------------
// Recurrence + rotation
// ---------------------------------------------------------------------------

/**
 * One recurrence step. Monthly steps land on `anchorDay`, clamped to the
 * length of the target month (Jan 31 -> Feb 28 -> Mar 31), instead of letting
 * Date overflow into the following month.
 */
function addInterval(d: Date, recurrence: Exclude<Recurrence, "once">, anchorDay: number): Date {
  const x = new Date(d);
  if (recurrence === "daily") x.setDate(x.getDate() + 1);
  if (recurrence === "weekly") x.setDate(x.getDate() + 7);
  if (recurrence === "biweekly") x.setDate(x.getDate() + 14);
  if (recurrence === "monthly") {
    x.setDate(1); // avoid overflow while changing month
    x.setMonth(x.getMonth() + 1);
    const daysInMonth = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(anchorDay, daysInMonth));
  }
  return x;
}

/**
 * Next due date after an occurrence is finished. Keeps the original time of
 * day and skips forward past `now`, so finishing late doesn't create an
 * instantly-overdue next occurrence.
 *
 * `anchorDay` is the intended day of month for monthly chores (defaults to
 * the due date's day).
 */
export function nextDueDate(
  dueAt: string,
  recurrence: Recurrence,
  now: Date,
  anchorDay?: number,
): Date | null {
  if (recurrence === "once") return null;
  const start = new Date(dueAt);
  const anchor = anchorDay ?? start.getDate();
  let next = addInterval(start, recurrence, anchor);
  while (next.getTime() <= now.getTime()) next = addInterval(next, recurrence, anchor);
  return next;
}

export function nextAssignee(current: ID, memberIds: ID[]): ID {
  const i = memberIds.indexOf(current);
  return memberIds[(i + 1) % memberIds.length] ?? current;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function event(data: ActivityEventData, now: Date): ActivityEvent {
  return { id: newId("evt"), at: now.toISOString(), reactions: {}, ...data };
}

/**
 * What it takes to reverse one operation, and nothing else. Undo must not
 * restore a whole-household snapshot: that would also wipe out anything that
 * happened in between (other completions, nudges, reactions, edits).
 */
export type UndoRecord =
  | {
      kind: "complete";
      choreId: ID;
      /** Next occurrence created by the completion, if any. */
      spawnedId?: ID;
      eventIds: ID[];
      /** Roommate whose streak grew, if it did. */
      streakActorId?: ID;
    }
  | { kind: "delete"; chore: Chore; index: number };

export function completeChore(state: HouseholdState, choreId: ID, now: Date): HouseholdState {
  return completeChoreWithUndo(state, choreId, now).state;
}

export function completeChoreWithUndo(
  state: HouseholdState,
  choreId: ID,
  now: Date,
): { state: HouseholdState; undo: UndoRecord | null } {
  const chore = state.chores.find((c) => c.id === choreId);
  if (!chore || chore.status === "done") return { state, undo: null };

  const actorId = state.currentUserId;
  const onTime = now.toISOString() <= chore.dueAt;
  const done: Chore = {
    ...chore,
    status: "done",
    completedAt: now.toISOString(),
    completedBy: actorId,
  };

  const events: ActivityEvent[] = [
    event(
      {
        type: "completed",
        actorId,
        choreId,
        choreTitle: chore.title,
        assigneeId: chore.assigneeId,
      },
      now,
    ),
  ];

  const chores = state.chores.map((c) => (c.id === choreId ? done : c));

  const anchorDay =
    chore.recurrence === "monthly" ? (chore.anchorDay ?? new Date(chore.dueAt).getDate()) : undefined;
  const nextDue = nextDueDate(chore.dueAt, chore.recurrence, now, anchorDay);
  let spawnedId: ID | undefined;
  if (nextDue) {
    const assigneeId = chore.rotate
      ? nextAssignee(chore.assigneeId, state.household.memberIds)
      : chore.assigneeId;
    spawnedId = newId("chore");
    chores.push({
      ...chore,
      id: spawnedId,
      assigneeId,
      dueAt: nextDue.toISOString(),
      anchorDay,
      status: "open",
      completedAt: undefined,
      completedBy: undefined,
    });
    if (chore.rotate && assigneeId !== chore.assigneeId) {
      // 1ms later so it sorts above the completion in the feed.
      events.unshift(
        event({ type: "rotated", choreTitle: chore.title, toId: assigneeId }, new Date(now.getTime() + 1)),
      );
    }
  }

  const roommates = onTime
    ? state.roommates.map((r) => (r.id === actorId ? { ...r, streak: r.streak + 1 } : r))
    : state.roommates;

  return {
    state: { ...state, chores, roommates, activity: [...events, ...state.activity] },
    undo: {
      kind: "complete",
      choreId,
      spawnedId,
      eventIds: events.map((e) => e.id),
      streakActorId: onTime ? actorId : undefined,
    },
  };
}

export function sendNudge(
  state: HouseholdState,
  input: { choreId: ID; tone: NudgeTone; message: string },
  now: Date,
): HouseholdState {
  const chore = state.chores.find((c) => c.id === input.choreId);
  const actorId = state.currentUserId;
  if (!chore || chore.status === "done" || chore.assigneeId === actorId) return state;
  if (nudgeCooldownRemaining(state, chore.id, actorId, now) > 0) return state;

  const nudge = event(
    {
      type: "nudged",
      actorId,
      targetId: chore.assigneeId,
      choreId: chore.id,
      choreTitle: chore.title,
      tone: input.tone,
      message: input.message.trim(),
    },
    now,
  );
  return { ...state, activity: [nudge, ...state.activity] };
}

/** Create (no id) or update (id) a chore from form input. */
export function saveChore(
  state: HouseholdState,
  input: ChoreInput,
  now: Date,
  id?: ID,
): HouseholdState {
  const clean: ChoreInput = {
    ...input,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    rotate: input.recurrence === "once" ? false : input.rotate,
  };

  if (id) {
    return {
      ...state,
      chores: state.chores.map((c) => {
        if (c.id !== id) return c;
        // A new due date or schedule sets a new monthly anchor.
        const rescheduled = c.dueAt !== clean.dueAt || c.recurrence !== clean.recurrence;
        return { ...c, ...clean, anchorDay: rescheduled ? undefined : c.anchorDay };
      }),
    };
  }

  const choreId = newId("chore");
  const chore: Chore = {
    ...clean,
    id: choreId,
    seriesId: newId("series"),
    createdBy: state.currentUserId,
    createdAt: now.toISOString(),
    status: "open",
  };
  const created = event(
    {
      type: "created",
      actorId: state.currentUserId,
      choreId,
      choreTitle: chore.title,
      assigneeId: chore.assigneeId,
    },
    now,
  );
  return { ...state, chores: [...state.chores, chore], activity: [created, ...state.activity] };
}

export function deleteChore(state: HouseholdState, id: ID): HouseholdState {
  return deleteChoreWithUndo(state, id).state;
}

export function deleteChoreWithUndo(
  state: HouseholdState,
  id: ID,
): { state: HouseholdState; undo: UndoRecord | null } {
  const index = state.chores.findIndex((c) => c.id === id);
  if (index === -1) return { state, undo: null };
  return {
    state: { ...state, chores: state.chores.filter((c) => c.id !== id) },
    undo: { kind: "delete", chore: state.chores[index], index },
  };
}

export type UndoResult =
  | { ok: true; state: HouseholdState }
  /** Nothing changed; `reason` is user-facing. */
  | { ok: false; state: HouseholdState; reason: string };

/**
 * Reverse exactly one earlier operation, leaving everything since intact.
 *
 * Refuses (ok: false, state unchanged) when reversing would break the
 * household: most importantly, it never leaves two open occurrences of the
 * same recurring chore.
 */
export function undo(state: HouseholdState, record: UndoRecord): UndoResult {
  const no = (reason: string): UndoResult => ({ ok: false, state, reason });

  if (record.kind === "delete") {
    if (state.chores.some((c) => c.id === record.chore.id)) return no("That chore is already back.");
    const openTwin = state.chores.some(
      (c) => c.seriesId === record.chore.seriesId && c.status === "open" && record.chore.status === "open",
    );
    if (openTwin) return no("There's already an open copy of this chore, so it can't come back.");
    const chores = [...state.chores];
    chores.splice(Math.min(record.index, chores.length), 0, record.chore);
    return { ok: true, state: { ...state, chores } };
  }

  const original = state.chores.find((c) => c.id === record.choreId);
  if (!original) return no("That chore was removed, so there's nothing to undo.");
  if (original.status !== "done") return no("That's already been undone.");

  const spawned = record.spawnedId ? state.chores.find((c) => c.id === record.spawnedId) : undefined;
  if (spawned?.status === "done") {
    return no(`The next “${original.title}” is already done, so this one can't be undone.`);
  }
  // Reopening must not create a second open occurrence in the series.
  const otherOpen = state.chores.some(
    (c) => c.seriesId === original.seriesId && c.status === "open" && c.id !== record.spawnedId,
  );
  if (otherOpen) {
    return no(`There's already an open “${original.title}”, so this one can't be undone.`);
  }

  const eventIds = new Set(record.eventIds);
  return {
    ok: true,
    state: {
      ...state,
      chores: state.chores
        .filter((c) => c.id !== record.spawnedId)
        .map((c) =>
          c.id === record.choreId
            ? { ...c, status: "open" as const, completedAt: undefined, completedBy: undefined }
            : c,
        ),
      roommates: state.roommates.map((r) =>
        r.id === record.streakActorId ? { ...r, streak: Math.max(0, r.streak - 1) } : r,
      ),
      activity: state.activity.filter((e) => !eventIds.has(e.id)),
    },
  };
}

export function toggleReaction(state: HouseholdState, eventId: ID, emoji: string): HouseholdState {
  const me = state.currentUserId;
  return {
    ...state,
    activity: state.activity.map((e) => {
      if (e.id !== eventId) return e;
      const who = e.reactions[emoji] ?? [];
      const next = who.includes(me) ? who.filter((id) => id !== me) : [...who, me];
      const reactions = { ...e.reactions, [emoji]: next };
      if (next.length === 0) delete reactions[emoji];
      return { ...e, reactions };
    }),
  };
}

// ---------------------------------------------------------------------------
// Nudge copy
// ---------------------------------------------------------------------------

/** Suggested nudge messages per tone. `{task}` is the lowercased chore title. */
export function nudgeSuggestions(
  chore: Chore,
  assignee: Roommate,
  now: Date,
): Record<NudgeTone, string[]> {
  const task = chore.title.charAt(0).toLowerCase() + chore.title.slice(1);
  const Task = chore.title;
  const thing = CATEGORIES[chore.category].noun;
  const late = isOverdue(chore, now);
  const lateBy = now.getTime() - new Date(chore.dueAt).getTime();
  const name = assignee.name.toLowerCase();

  return {
    sweet: [
      `hey ${name} 💕 quick reminder to ${task} when you get a sec`,
      `no rush bestie, just a lil reminder to ${task} 🌷`,
      `you're the best 🫶 don't forget to ${task}${late ? "" : " today"}!`,
    ],
    funny: [
      `${thing} has officially entered its villain era 😈`,
      late && lateBy > 12 * HOUR
        ? `${thing} called. it says it's been ${Math.round(lateBy / HOUR)} hours. it misses you 📞`
        : `${thing} called. it misses you. please ${task} 📞`,
      `not to be dramatic but ${thing} is plotting against us 👀`,
    ],
    direct: [
      late ? `${Task} is overdue — can you grab it?` : `${Task} is due soon — can you grab it?`,
      `Can you ${task} today? Thanks!`,
      `Reminder: ${task}. Let me know if you need to swap!`,
    ],
  };
}
