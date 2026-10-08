"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Flame, Lock, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES, ACCENTS } from "@/lib/design";
import { isOverdue, roommateStats } from "@/lib/chores";
import {
  CLEAR_AFTER_LABELS,
  STATUS_EMOJI,
  STATUS_MAX_LENGTH,
  STATUS_QUICK_PICKS,
  achievementsFor,
  activeStatus,
  upcomingFor,
} from "@/lib/profile";
import { actions, useHousehold, useNow } from "@/lib/store";
import { dueLabel } from "@/lib/time";
import type { Chore, HouseholdState, ID, Roommate, StatusClearAfter } from "@/lib/types";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Avatar } from "./avatar";
import { announce } from "./live-announcer";
import { showUndoToast } from "./undo-toast";

// ---------------------------------------------------------------- opening

let openFn: ((id: ID) => void) | null = null;

/** Open a roommate's profile (your own shows the editable "Me" view). */
export function openProfile(id: ID) {
  openFn?.(id);
}

/** A button that opens a roommate's profile. Always at least 44×44px. */
export function ProfileButton({
  roommate,
  isMe,
  className,
  children,
}: {
  roommate: Roommate;
  isMe: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => openProfile(roommate.id)}
      aria-label={isMe ? "Open your profile" : `Open ${roommate.name}'s profile`}
      className={cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-full", className)}
    >
      {children}
    </button>
  );
}

// -------------------------------------------------------------- the sheet

const DESKTOP = "(min-width: 768px)";

function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/** Drag distance (px) past which a downward swipe closes the mobile sheet. */
const SWIPE_CLOSE = 120;

/**
 * Mounted once in the app shell. A bottom sheet on mobile (about 90% of the
 * screen tall, swipe down or Esc to close) and a 420px right panel on desktop.
 * Radix traps focus while it's open and returns it to the opener on close.
 */
export function ProfileSheetHost() {
  const state = useHousehold();
  const now = useNow();
  const isDesktop = useIsDesktop();
  const [openId, setOpenId] = useState<ID | null>(null);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  /** Whatever had focus when the sheet opened; focus goes back there on close. */
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openFn = (id) => {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDrag(0);
      setOpenId(id);
    };
    return () => {
      openFn = null;
    };
  }, []);

  const roommate = state && openId ? state.roommates.find((r) => r.id === openId) : undefined;
  const close = () => setOpenId(null);
  const isOwner = !!roommate && roommate.id === state?.currentUserId;

  return (
    <Sheet open={!!roommate} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          // Opened programmatically (no Radix trigger), so restore focus ourselves.
          if (returnTo.current?.isConnected) {
            e.preventDefault();
            returnTo.current.focus();
          }
        }}
        style={!isDesktop && drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className={cn(
          "gap-0 overflow-y-auto border-none bg-cream p-0",
          isDesktop
            ? "h-full w-full data-[side=right]:w-full data-[side=right]:sm:max-w-[420px]"
            : // Same variant as the base sheet's `h-auto`, so it overrides it.
              "rounded-t-[24px] pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[side=bottom]:h-[90dvh]",
        )}
      >
        {roommate && state && (
          <>
            <SheetTitle className="sr-only">{isOwner ? "Your profile" : `${roommate.name}'s profile`}</SheetTitle>
            <SheetDescription className="sr-only">
              {isOwner ? "Your status, upcoming chores, stats, and badges." : "Their status, streak, and upcoming chores."}
            </SheetDescription>
            {!isDesktop && (
              // Swipe handle: drag down to close (Esc and the close button also work).
              <div
                aria-hidden
                className="flex cursor-grab touch-none justify-center pt-3 pb-1"
                onPointerDown={(e) => {
                  dragStart.current = e.clientY;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (dragStart.current !== null) setDrag(Math.max(0, e.clientY - dragStart.current));
                }}
                onPointerUp={() => {
                  if (drag > SWIPE_CLOSE) close();
                  else setDrag(0);
                  dragStart.current = null;
                }}
                onPointerCancel={() => {
                  setDrag(0);
                  dragStart.current = null;
                }}
              >
                <span className="h-1.5 w-10 rounded-full bg-cream-deep" />
              </div>
            )}
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Close profile"
                className="absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-full text-plum-soft hover:bg-white hover:text-plum"
              >
                <X className="size-5" aria-hidden />
              </button>
            </SheetClose>
            <ProfileView key={roommate.id} state={state} roommate={roommate} now={now} onNavigate={close} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- content

/**
 * The profile itself. Your own profile is editable and private (stats and
 * badges are only shown to you); anyone else's is read-only: status, streak,
 * and upcoming chores.
 */
export function ProfileView({
  state,
  roommate,
  now,
  onNavigate,
}: {
  state: HouseholdState;
  roommate: Roommate;
  now: Date;
  /** Called before following a link out of the sheet. */
  onNavigate?: () => void;
}) {
  const isOwner = roommate.id === state.currentUserId;
  const [editing, setEditing] = useState(false);
  const status = activeStatus(roommate, now);
  const upcoming = upcomingFor(state, roommate.id, 5);

  return (
    <div className="space-y-7 px-5 pt-4 pb-8 md:pt-10">
      {/* 1. Header */}
      <header className="flex items-center gap-4">
        <Avatar roommate={roommate} size="profile" badge />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-tight font-bold text-plum">
            {roommate.name}
            {isOwner && <span className="ml-1.5 font-sans text-sm font-semibold text-plum-soft">(you)</span>}
          </h2>
          <p className="mt-0.5 text-sm text-plum-soft" data-testid="profile-status">
            {status ? (
              <>
                {status.emoji && <span className="mr-1">{status.emoji}</span>}
                {status.text}
              </>
            ) : isOwner ? (
              "No status yet"
            ) : (
              "No status"
            )}
          </p>
        </div>
        {isOwner && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-plum shadow-soft"
          >
            <Pencil className="size-4" aria-hidden /> Edit
          </button>
        )}
      </header>

      {!isOwner && roommate.streak > 0 && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-coral-50 px-3 py-1.5 text-sm font-semibold text-coral-700">
          <Flame className="size-4" aria-hidden /> {roommate.streak} on time in a row
        </p>
      )}

      {/* 2. Status editor */}
      {isOwner && editing && (
        <StatusEditor roommate={roommate} now={now} onDone={() => setEditing(false)} />
      )}

      {/* 3. Upcoming chores */}
      <section aria-labelledby="profile-upcoming">
        <div className="mb-2 flex items-center justify-between">
          <h3 id="profile-upcoming" className="font-display text-lg font-bold text-plum">
            {isOwner ? "Up next for you" : "Up next"}
          </h3>
          {isOwner && (
            <Link
              href="/chores?filter=all&mine=1"
              onClick={onNavigate}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-lilac-700 hover:underline"
            >
              See all mine
            </Link>
          )}
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-3 text-sm text-plum-soft shadow-soft">
            Nothing on {isOwner ? "your" : "their"} list right now.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-white shadow-soft">
            {upcoming.map((c) => (
              <UpcomingRow key={c.id} chore={c} now={now} canComplete={isOwner} />
            ))}
          </ul>
        )}
      </section>

      {/* 4–5. Private to the owner */}
      {isOwner && <PrivateStats state={state} roommate={roommate} now={now} />}
      {isOwner && <Achievements state={state} roommate={roommate} now={now} />}
    </div>
  );
}

function UpcomingRow({ chore, now, canComplete }: { chore: Chore; now: Date; canComplete: boolean }) {
  const category = CATEGORIES[chore.category];
  const Icon = category.icon;
  const late = isOverdue(chore, now);

  function done() {
    const { undo, conflict } = actions.completeChore(chore.id);
    if (conflict) toast("That didn't go through", { description: conflict });
    else if (undo) showUndoToast(`${chore.title}: done ✨`, undo);
    else toast("Already done ✨", { description: `${chore.title} was already finished.` });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", ACCENTS[category.accent].soft, ACCENTS[category.accent].text)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-plum">{chore.title}</p>
        <p className={cn("text-xs", late ? "font-semibold text-coral-700" : "text-plum-soft")}>
          {late ? "running late · was due " : "due "}
          {dueLabel(chore.dueAt, now)}
        </p>
      </div>
      {canComplete && (
        <button
          type="button"
          onClick={done}
          aria-label={`Mark ${chore.title} done`}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-plum px-4 text-sm font-semibold text-cream"
        >
          <Check className="size-4" aria-hidden /> Done
        </button>
      )}
    </li>
  );
}

function PrivateStats({ state, roommate, now }: { state: HouseholdState; roommate: Roommate; now: Date }) {
  const stats = roommateStats(state, roommate, now);
  const tiles = [
    { label: "on-time streak", value: roommate.streak },
    { label: "done this week", value: stats.doneThisWeek },
    { label: "on time", value: `${stats.reliability}%` },
  ];
  return (
    <section aria-labelledby="profile-stats">
      <h3 id="profile-stats" className="font-display text-lg font-bold text-plum">
        Just for you
      </h3>
      <p className="mb-2 text-xs text-plum-soft">Only you can see these.</p>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col-reverse rounded-2xl bg-white px-1 py-3 shadow-soft">
            <dt className="text-[11px] leading-tight font-medium text-plum-soft">{t.label}</dt>
            <dd className="font-display text-2xl font-bold text-plum tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Achievements({ state, roommate, now }: { state: HouseholdState; roommate: Roommate; now: Date }) {
  const badges = achievementsFor(state, roommate, now);
  const earned = badges.filter((b) => b.earned).length;
  return (
    <section aria-labelledby="profile-badges">
      <h3 id="profile-badges" className="font-display text-lg font-bold text-plum">
        Badges
      </h3>
      <p className="mb-2 text-xs text-plum-soft">
        {earned} of {badges.length} earned · only you can see these
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {badges.map((b) => (
          <li
            key={b.id}
            className={cn(
              "flex items-start gap-2.5 rounded-2xl p-3",
              b.earned ? "bg-white shadow-soft" : "border border-dashed border-input bg-cream-deep/40",
            )}
          >
            <span aria-hidden className={cn("text-2xl leading-none", !b.earned && "opacity-50 grayscale")}>
              {b.emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-plum">{b.title}</span>
              <span className="flex items-center gap-1 text-xs text-plum-soft">
                {b.earned ? (
                  "Earned"
                ) : (
                  <>
                    <Lock className="size-3 shrink-0" aria-hidden />
                    <span className="sr-only">Locked: </span>
                    {b.hint}
                  </>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------- status editor

function StatusEditor({ roommate, now, onDone }: { roommate: Roommate; now: Date; onDone: () => void }) {
  const current = activeStatus(roommate, now);
  const [text, setText] = useState(current?.text ?? "");
  const [emoji, setEmoji] = useState(current?.emoji ?? "");
  const [clearAfter, setClearAfter] = useState<StatusClearAfter>("never");
  const length = Array.from(text).length;

  function save(next: { text: string; emoji: string; clearAfter: StatusClearAfter }) {
    const conflict = actions.setStatus(next);
    if (conflict) {
      toast("That didn't go through", { description: conflict });
      return;
    }
    announce(next.text || next.emoji ? "Status saved." : "Status cleared.");
    onDone();
  }

  return (
    <form
      aria-label="Edit your status"
      className="space-y-5 rounded-3xl bg-white p-4 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        save({ text, emoji, clearAfter });
      }}
    >
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="status-text" className="text-sm font-semibold text-plum">
            Your status
          </label>
          <span className="text-xs text-plum-soft tabular-nums" aria-live="off">
            {length}/{STATUS_MAX_LENGTH}
          </span>
        </div>
        <input
          id="status-text"
          value={text}
          onChange={(e) => setText(Array.from(e.target.value).slice(0, STATUS_MAX_LENGTH).join(""))}
          placeholder="What's up?"
          autoComplete="off"
          className="h-11 w-full rounded-2xl border border-input bg-cream px-4 text-plum outline-none placeholder:text-plum-soft focus:border-lilac-700"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-plum">Emoji</legend>
        <div className="flex flex-wrap gap-1.5">
          {["", ...STATUS_EMOJI].map((e) => (
            <label
              key={e || "none"}
              className={cn(
                "grid size-11 cursor-pointer place-items-center rounded-xl text-xl transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lilac-700",
                emoji === e ? "bg-lilac-50 ring-2 ring-plum" : "bg-cream",
              )}
            >
              <input
                type="radio"
                name="status-emoji"
                value={e}
                checked={emoji === e}
                onChange={() => setEmoji(e)}
                className="sr-only"
                aria-label={e ? `Emoji ${e}` : "No emoji"}
              />
              <span aria-hidden className={cn(!e && "text-xs font-semibold text-plum-soft")}>
                {e || "none"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-plum" id="quick-picks">
          Quick picks
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="quick-picks">
          {STATUS_QUICK_PICKS.map((q) => (
            <button
              key={q.text}
              type="button"
              onClick={() => {
                setText(q.text);
                setEmoji(q.emoji);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-cream px-3.5 text-sm font-medium text-plum"
            >
              <span aria-hidden>{q.emoji}</span> {q.text}
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-plum">Clear after</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CLEAR_AFTER_LABELS) as StatusClearAfter[]).map((k) => (
            <label
              key={k}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lilac-700",
                clearAfter === k ? "bg-plum text-cream" : "bg-cream text-plum",
              )}
            >
              <input
                type="radio"
                name="status-clear-after"
                value={k}
                checked={clearAfter === k}
                onChange={() => setClearAfter(k)}
                className="sr-only"
              />
              {CLEAR_AFTER_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!text.trim() && !emoji}
          className="inline-flex h-11 items-center rounded-full bg-plum px-5 font-semibold text-cream disabled:opacity-50"
        >
          Save status
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-11 items-center rounded-full px-4 font-semibold text-plum-soft hover:text-plum"
        >
          Cancel
        </button>
        {current && (
          <button
            type="button"
            onClick={() => save({ text: "", emoji: "", clearAfter: "never" })}
            className="ml-auto inline-flex h-11 items-center rounded-full px-4 font-semibold text-coral-700"
          >
            Clear status
          </button>
        )}
      </div>
    </form>
  );
}
