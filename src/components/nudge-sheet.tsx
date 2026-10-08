"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isOverdue, nudgeCooldownRemaining, nudgeSuggestions } from "@/lib/chores";
import { actions } from "@/lib/store";
import { dueLabel } from "@/lib/time";
import type { Chore, HouseholdState, NudgeTone, Roommate } from "@/lib/types";
import { Avatar } from "./avatar";
import { announce } from "./live-announcer";

const TONES: { value: NudgeTone; label: string; emoji: string; className: string }[] = [
  { value: "sweet", label: "Sweet", emoji: "💕", className: "data-[active=true]:bg-blush-50 data-[active=true]:ring-blush-700" },
  { value: "funny", label: "Funny", emoji: "😂", className: "data-[active=true]:bg-butter-50 data-[active=true]:ring-butter-700" },
  { value: "direct", label: "Direct", emoji: "👉", className: "data-[active=true]:bg-lilac-50 data-[active=true]:ring-lilac-700" },
];

const MAX_LENGTH = 140;
const CONFIRM_MS = 1300;

/**
 * Bottom sheet for nudging a roommate about a chore.
 * Controlled by the parent: pass the chore to open it, null to close.
 */
export function NudgeSheet({
  chore,
  state,
  now,
  onClose,
}: {
  chore: Chore | null;
  state: HouseholdState;
  now: Date;
  onClose: () => void;
}) {
  const assignee = chore && state.roommates.find((r) => r.id === chore.assigneeId);
  return (
    <Sheet open={!!chore} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-lg overflow-y-auto rounded-t-[2rem] border-none bg-cream pb-[max(1.5rem,env(safe-area-inset-bottom))] md:bottom-6 md:rounded-[2rem]"
      >
        {chore && assignee && (
          // Keyed so tone/message reset for each chore.
          <NudgeForm key={chore.id} chore={chore} assignee={assignee} state={state} now={now} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function NudgeForm({
  chore,
  assignee,
  state,
  now,
  onClose,
}: {
  chore: Chore;
  assignee: Roommate;
  state: HouseholdState;
  now: Date;
  onClose: () => void;
}) {
  const [suggestions] = useState(() => nudgeSuggestions(chore, assignee, now));
  const [tone, setTone] = useState<NudgeTone>("sweet");
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState(suggestions.sweet[0]);
  const [sent, setSent] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // If this sheet unmounts (closed early, or reopened for another chore), its
  // pending auto-close must not fire and close whichever sheet is open next.
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const coolingDown = nudgeCooldownRemaining(state, chore.id, state.currentUserId, now) > 0;
  const late = isOverdue(chore, now);

  function pickTone(next: NudgeTone) {
    setTone(next);
    setIndex(0);
    setMessage(suggestions[next][0]);
  }

  function shuffle() {
    const next = (index + 1) % suggestions[tone].length;
    setIndex(next);
    setMessage(suggestions[tone][next]);
  }

  function send() {
    if (sent || coolingDown || !message.trim()) return;
    const { sent: delivered, conflict } = actions.sendNudge({ choreId: chore.id, tone, message });
    if (!delivered) {
      // Another tab nudged, finished, or reset it in the meantime.
      toast("Nudge not sent", { description: conflict ?? "It was already nudged or finished." });
      onClose();
      return;
    }
    setSent(true);
    announce(`Nudge sent to ${assignee.name}.`);
    closeTimer.current = setTimeout(onClose, CONFIRM_MS);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="animate-pop text-6xl" aria-hidden>
          💌
        </span>
        <SheetTitle className="mt-4 font-display text-2xl font-bold">Nudge sent!</SheetTitle>
        <SheetDescription className="mt-1 text-plum-soft">
          {assignee.name} will see it in the house feed.
        </SheetDescription>
      </div>
    );
  }

  return (
    <>
      <SheetHeader className="items-center px-6 pt-7 text-center">
        <div className="mb-3 h-1.5 w-10 rounded-full bg-cream-deep md:hidden" aria-hidden />
        <Avatar roommate={assignee} size="lg" badge />
        <SheetTitle className="mt-3 font-display text-2xl font-bold">Nudge {assignee.name}</SheetTitle>
        <SheetDescription className="text-plum-soft">
          about <span className="font-semibold text-plum">{chore.title}</span>
          {" · "}
          {late ? "was due " : "due "}
          {dueLabel(chore.dueAt, now)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-plum">Pick a vibe</legend>
          <div className="grid grid-cols-3 gap-2">
            {TONES.map((t) => (
              <label
                key={t.value}
                data-active={tone === t.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-2xl bg-white py-3 text-sm font-semibold text-plum shadow-soft ring-2 ring-transparent transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lilac-700",
                  t.className,
                )}
              >
                <input
                  type="radio"
                  name="tone"
                  value={t.value}
                  checked={tone === t.value}
                  onChange={() => pickTone(t.value)}
                  className="sr-only"
                />
                <span className="text-2xl" aria-hidden>
                  {t.emoji}
                </span>
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="nudge-message" className="text-sm font-semibold text-plum">
              Your message
            </label>
            <button
              type="button"
              onClick={shuffle}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-lilac-700 hover:bg-lilac-50"
            >
              <Shuffle className="size-3.5" aria-hidden /> Try another
            </button>
          </div>
          <div className="rounded-3xl rounded-br-md bg-white p-1 shadow-soft">
            <textarea
              id="nudge-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_LENGTH}
              rows={3}
              className="block w-full resize-none rounded-[1.25rem] bg-transparent px-4 py-3 text-plum outline-none placeholder:text-plum-soft"
            />
          </div>
          <p className="mt-1 text-right text-xs text-plum-soft">
            {message.length}/{MAX_LENGTH}
          </p>
        </div>

        <button
          type="button"
          onClick={send}
          disabled={coolingDown || !message.trim()}
          className="flex h-13 w-full items-center justify-center rounded-full bg-plum text-base font-semibold text-cream shadow-lift transition hover:bg-plum/90 active:scale-[0.98] disabled:opacity-50"
        >
          {coolingDown ? "Already nudged. Give it a bit 💭" : "Send nudge 👀"}
        </button>
        <p className="text-center text-xs text-plum-soft">
          Nudges show up in the house feed. Be nice, you live together 🫶
        </p>
      </div>
    </>
  );
}
