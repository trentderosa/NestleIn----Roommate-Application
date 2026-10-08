"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Pencil, Repeat, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS, CATEGORIES, POINTS_LABELS, RECURRENCE_LABELS } from "@/lib/design";
import { choreTiming, nudgeCooldownRemaining } from "@/lib/chores";
import { actions } from "@/lib/store";
import { dueLabel, relativeTime } from "@/lib/time";
import type { Chore, HouseholdState } from "@/lib/types";
import { Avatar } from "./avatar";
import { showUndoToast } from "./undo-toast";

const CHEERS = [
  "Look at you go 💅",
  "The house thanks you 🌷",
  "Main character energy ✨",
  "Your roomies are obsessed 🫶",
  "Clean space, clear mind 🧘‍♀️",
];

const SPARKS = ["✨", "💕", "🌟", "✨", "💖", "⭐", "✨", "💫"];

const CELEBRATE_MS = 650;

export function ChoreCard({
  chore,
  state,
  now,
  onNudge,
}: {
  chore: Chore;
  state: HouseholdState;
  now: Date;
  onNudge: (chore: Chore) => void;
}) {
  const [celebrating, setCelebrating] = useState(false);
  const timing = choreTiming(chore, now);
  const category = CATEGORIES[chore.category];
  const accent = ACCENTS[category.accent];
  const Icon = category.icon;
  const assignee = state.roommates.find((r) => r.id === chore.assigneeId);
  const isMine = chore.assigneeId === state.currentUserId;
  const assigneeName = isMine ? "You" : assignee?.name;

  if (timing === "done") {
    const by = state.roommates.find((r) => r.id === chore.completedBy);
    return (
      <article className="flex items-center gap-3 rounded-3xl bg-white/70 p-3 pr-4 shadow-soft">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-mint-50 text-mint-700">
          <Check className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-plum">{chore.title}</h3>
          <p className="text-sm text-plum-soft">
            Done ✨ by {by?.id === state.currentUserId ? "you" : by?.name} ·{" "}
            {relativeTime(chore.completedAt!, now)}
          </p>
        </div>
        {by && <Avatar roommate={by} size="sm" />}
      </article>
    );
  }

  const cooldown = nudgeCooldownRemaining(state, chore.id, state.currentUserId, now);

  function handleDone() {
    if (celebrating) return;
    setCelebrating(true);
    // Let the sparkle play before the card moves to "done".
    setTimeout(() => {
      const undo = actions.completeChore(chore.id);
      // Reset even though the card usually re-renders as "done": if the
      // completion is undone, this same card must come back fully interactive.
      setCelebrating(false);
      if (!undo) {
        // Another tab (or roommate view) finished it first.
        toast("Already done ✨", { description: `${chore.title} was already finished.` });
        return;
      }
      const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)];
      showUndoToast(isMine ? `${chore.title}: done ✨` : `You covered for ${assignee?.name} 💕`, undo, {
        description: isMine ? `${cheer} · +${chore.points} pts` : `${chore.title} is off the list.`,
      });
    }, CELEBRATE_MS);
  }

  return (
    <article
      className={cn(
        "relative rounded-3xl bg-white p-4 shadow-soft transition duration-500",
        timing === "overdue" && "bg-gradient-to-br from-white to-coral-50 ring-1 ring-coral-200",
        celebrating && "scale-[0.98] opacity-60",
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-2xl",
            accent.soft,
            accent.text,
          )}
        >
          <Icon className="size-6" aria-hidden />
          <span className="sr-only">{category.label}</span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg leading-snug font-bold text-plum">{chore.title}</h3>
            <Link
              href={`/chores/${chore.id}/edit`}
              aria-label={`Edit ${chore.title}`}
              className="-mt-1 -mr-1 rounded-full p-2 text-plum-soft transition hover:bg-cream hover:text-plum"
            >
              <Pencil className="size-4" aria-hidden />
            </Link>
          </div>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-plum-soft">
            {assignee && <Avatar roommate={assignee} size="xs" />}
            <span className="font-semibold text-plum">{assigneeName}</span>
            <span aria-hidden>·</span>
            <span className={cn(timing === "overdue" && "font-semibold text-coral-700")}>
              {timing === "overdue" ? "was due " : "due "}
              {dueLabel(chore.dueAt, now)}
            </span>
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {chore.recurrence !== "once" && (
              <Tag>
                {chore.rotate ? <Shuffle className="size-3" aria-hidden /> : <Repeat className="size-3" aria-hidden />}
                {RECURRENCE_LABELS[chore.recurrence]}
                {chore.rotate && " · rotates"}
              </Tag>
            )}
            <Tag>
              {"★".repeat(chore.points)}
              <span className="sr-only">
                {chore.points} {chore.points === 1 ? "point" : "points"},
              </span> {POINTS_LABELS[chore.points].label}
            </Tag>
            {isMine && <Tag className="bg-lilac-50 text-lilac-700">Your turn</Tag>}
          </div>
        </div>
      </div>

      {timing === "overdue" && (
        <p className="mt-3 rounded-2xl bg-coral-50 px-3 py-2 text-sm font-medium text-coral-700">
          Uh oh… this one&apos;s running a little late 👀
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {!isMine && (
          <button
            type="button"
            onClick={() => onNudge(chore)}
            disabled={cooldown > 0 || celebrating}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-blush-50 text-sm font-semibold text-blush-700 transition hover:bg-blush-200/60 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {cooldown > 0 ? (
              <>
                <Check className="size-4" aria-hidden /> Nudged
              </>
            ) : (
              <>Nudge 👀</>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleDone}
          disabled={celebrating}
          aria-label={`Mark ${chore.title} done`}
          className="relative flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-plum text-sm font-semibold text-cream transition hover:bg-plum/90 active:scale-[0.97]"
        >
          {celebrating ? (
            <Check className="size-5 animate-pop" aria-hidden />
          ) : (
            <>Done ✨</>
          )}
          {celebrating && <SparkleBurst />}
        </button>
      </div>
      {cooldown > 0 && (
        // Not a live region: it ticks every 30s and would be re-announced.
        <p className="mt-2 text-center text-xs text-plum-soft">
          You nudged {assignee?.name}. You can nudge again in {Math.ceil(cooldown / 60_000)}m.
        </p>
      )}
    </article>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-plum-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SparkleBurst() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {SPARKS.map((s, i) => {
        const angle = (i / SPARKS.length) * Math.PI * 2;
        return (
          <span
            key={i}
            className="absolute animate-sparkle text-base"
            style={
              {
                "--sx": `${Math.cos(angle) * 56}px`,
                "--sy": `${Math.sin(angle) * 40 - 10}px`,
              } as React.CSSProperties
            }
          >
            {s}
          </span>
        );
      })}
    </span>
  );
}
