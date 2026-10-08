"use client";

import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { actions } from "@/lib/store";
import { relativeTime } from "@/lib/time";
import type { ActivityEvent, HouseholdState, ID } from "@/lib/types";
import { Avatar } from "./avatar";

const REACTIONS = ["💕", "✨", "🙌", "😂"];

const BADGE: Record<ActivityEvent["type"], { emoji: string; label: string }> = {
  completed: { emoji: "✨", label: "Done" },
  nudged: { emoji: "👀", label: "Nudge" },
  rotated: { emoji: "🔄", label: "Rotation" },
  created: { emoji: "📝", label: "New chore" },
};

export function ActivityItem({
  event,
  state,
  now,
  compact = false,
}: {
  event: ActivityEvent;
  state: HouseholdState;
  now: Date;
  /** Compact mode (board preview): no reaction picker. */
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const me = state.currentUserId;
  const person = (id: ID, capital = true) => {
    if (id === me) return capital ? "You" : "you";
    return state.roommates.find((r) => r.id === id)?.name ?? "Someone";
  };
  const name = (id: ID, capital = true) => (
    <strong className="font-semibold text-plum">{person(id, capital)}</strong>
  );
  const chore = (title: string) => <span className="font-medium text-plum">{title}</span>;

  const subjectId = event.type === "rotated" ? event.toId : event.actorId;
  const subject = state.roommates.find((r) => r.id === subjectId);

  let text: React.ReactNode;
  switch (event.type) {
    case "completed":
      text =
        event.actorId === event.assigneeId ? (
          <>
            {name(event.actorId)} finished {chore(event.choreTitle)} ✨
          </>
        ) : (
          <>
            {name(event.actorId)} covered {chore(event.choreTitle)} for{" "}
            {name(event.assigneeId, false)} 💕
          </>
        );
      break;
    case "nudged":
      text = (
        <>
          {name(event.actorId)} nudged {name(event.targetId, false)} about{" "}
          {chore(event.choreTitle)} 👀
        </>
      );
      break;
    case "rotated":
      text = (
        <>
          {chore(event.choreTitle)} rotated to {name(event.toId, false)}
        </>
      );
      break;
    case "created":
      text = (
        <>
          {name(event.actorId)} added {chore(event.choreTitle)} for{" "}
          {name(event.assigneeId, false)}
        </>
      );
      break;
  }

  const reactions = Object.entries(event.reactions);
  const react = (emoji: string) => {
    const conflict = actions.toggleReaction(event.id, emoji);
    if (conflict) toast("That didn't go through", { description: conflict });
  };

  return (
    <li className="flex gap-3">
      <span className="relative h-fit">
        {subject && <Avatar roommate={subject} size="md" />}
        <span
          className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-white text-[11px] shadow-soft"
          aria-label={BADGE[event.type].label}
          role="img"
        >
          {BADGE[event.type].emoji}
        </span>
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[15px] leading-snug text-plum-soft">
          {text}
          <span className="ml-1.5 text-xs whitespace-nowrap text-plum-soft">
            · {relativeTime(event.at, now)}
          </span>
        </p>

        {event.type === "nudged" && (
          <p className="mt-2 w-fit max-w-full rounded-2xl rounded-tl-md bg-blush-50 px-3.5 py-2 text-sm text-plum">
            “{event.message}”
          </p>
        )}

        {(reactions.length > 0 || !compact) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {reactions.map(([emoji, ids]) => {
              const mine = ids.includes(me);
              return (
                <button
                  key={emoji}
                  type="button"
                  disabled={compact}
                  onClick={() => react(emoji)}
                  aria-pressed={mine}
                  aria-label={`${emoji} ${ids.length}: ${ids.map((id) => person(id)).join(", ")}`}
                  className={cn(
                    "flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-sm shadow-soft ring-1 ring-transparent transition disabled:cursor-default",
                    mine && "bg-lilac-50 ring-lilac-200",
                  )}
                >
                  <span aria-hidden>{emoji}</span>
                  <span className="text-xs font-semibold text-plum-soft" aria-hidden>
                    {ids.length}
                  </span>
                </button>
              );
            })}

            {!compact &&
              (picking ? (
                <span className="flex animate-rise gap-1 rounded-full bg-white px-1.5 py-0.5 shadow-soft">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`React with ${emoji}`}
                      onClick={() => {
                        react(emoji);
                        setPicking(false);
                      }}
                      className="rounded-full px-1 text-base transition hover:scale-125"
                    >
                      {emoji}
                    </button>
                  ))}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  aria-label="Add a reaction"
                  className="rounded-full p-1 text-plum-soft transition hover:bg-white hover:text-plum"
                >
                  <SmilePlus className="size-4" aria-hidden />
                </button>
              ))}
          </div>
        )}
      </div>
    </li>
  );
}
