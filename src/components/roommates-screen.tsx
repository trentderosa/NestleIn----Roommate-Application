"use client";

import { toast } from "sonner";
import { Copy, Flame, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS } from "@/lib/design";
import { roommateStats } from "@/lib/chores";
import { actions, useHousehold, useNow } from "@/lib/store";
import { DAY, dueLabel } from "@/lib/time";
import type { HouseholdState, Roommate } from "@/lib/types";
import { Avatar } from "./avatar";
import { ProfileButton } from "./profile-sheet";
import { activeStatus } from "@/lib/profile";
import { Page, PageHeader, ScreenSkeleton } from "./page-bits";

export function RoommatesScreen() {
  const state = useHousehold();
  const now = useNow();
  if (!state) return <ScreenSkeleton />;

  const weekAgo = now.getTime() - 7 * DAY;
  const houseWeek = state.chores.filter(
    (c) => c.status === "done" && c.completedAt && new Date(c.completedAt).getTime() >= weekAgo,
  ).length;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(state!.household.inviteCode);
      toast("Invite code copied 💌", { description: "Send it to your new roomie." });
    } catch {
      toast(`Your invite code is ${state!.household.inviteCode}`);
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={`${state.household.name} ${state.household.emoji}`}
        title="Roommates"
        subtitle={`${state.roommates.length} people, one very cute place.`}
      />

      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-gradient-to-br from-mint-200 to-sky-200 p-5 text-plum shadow-soft">
          <p className="text-xs font-bold tracking-wider uppercase opacity-70">This week</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {houseWeek} chores done together 🎉
          </p>
          <p className="mt-1 text-sm opacity-80">Teamwork makes the apartment work.</p>
        </div>
        <div className="flex flex-col justify-between rounded-3xl bg-white p-5 shadow-soft">
          <div>
            <p className="text-xs font-bold tracking-wider text-plum-soft uppercase">Invite a roommate</p>
            <p className="mt-1 font-display text-2xl font-bold tracking-wider text-plum">
              {state.household.inviteCode}
            </p>
          </div>
          <button
            type="button"
            onClick={copyInvite}
            className="mt-3 flex w-fit items-center gap-2 rounded-full bg-lilac-50 px-4 py-2 text-sm font-semibold text-lilac-700 transition hover:bg-lilac-200/60"
          >
            <Copy className="size-4" aria-hidden /> Copy invite code
          </button>
        </div>
      </section>

      <ul className="grid gap-4 sm:grid-cols-2">
        {state.roommates.map((r) => (
          <RoommateCard key={r.id} roommate={r} state={state} now={now} />
        ))}
      </ul>

      <section
        aria-label="Prototype controls"
        className="mt-10 mb-6 rounded-3xl border-2 border-dashed border-border p-5"
      >
        <p className="font-display text-lg font-bold text-plum">Prototype controls</p>
        <p className="mt-1 text-sm text-plum-soft">
          There are no accounts yet. Switch who you&apos;re using the app as, or start the demo over.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-plum">View as:</span>
          {state.roommates.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === state.currentUserId}
              onClick={() => {
                const conflict = actions.switchUser(r.id);
                if (conflict) toast("That didn't go through", { description: conflict });
                else toast(`Now viewing as ${r.name} ${r.emoji}`);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm font-semibold transition",
                r.id === state.currentUserId ? "bg-plum text-cream" : "bg-white text-plum shadow-soft",
              )}
            >
              <Avatar roommate={r} size="xs" /> {r.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            actions.resetDemo();
            toast("Demo reset. Fresh start ✨");
          }}
          className="mt-4 flex items-center gap-2 text-sm font-semibold text-plum-soft hover:text-plum"
        >
          <RotateCcw className="size-4" aria-hidden /> Reset demo data
        </button>
      </section>
    </Page>
  );
}

function RoommateCard({ roommate, state, now }: { roommate: Roommate; state: HouseholdState; now: Date }) {
  const stats = roommateStats(state, roommate, now);
  const accent = ACCENTS[roommate.accent];
  const isMe = roommate.id === state.currentUserId;
  const status = activeStatus(roommate, now);

  return (
    <li className="overflow-hidden rounded-[2rem] bg-white shadow-soft">
      <div className={cn("h-16 bg-gradient-to-br", accent.gradient)} aria-hidden />
      <div className="-mt-10 px-5 pb-5">
        <ProfileButton roommate={roommate} isMe={isMe}>
          <Avatar roommate={roommate} size="xl" badge className="ring-4 ring-white rounded-full" />
        </ProfileButton>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-bold text-plum">
            {roommate.name}
            {isMe && <span className="ml-1.5 font-sans text-sm font-semibold text-plum-soft">(you)</span>}
          </h2>
          {roommate.streak > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-coral-50 px-2.5 py-1 text-xs font-bold text-coral-700">
              <Flame className="size-3.5" aria-hidden /> {roommate.streak} in a row
            </span>
          )}
        </div>
        {status && (
          <p className="mt-0.5 text-sm text-plum-soft italic">
            {status.emoji && <span className="not-italic">{status.emoji} </span>}
            {status.text && <>“{status.text}”</>}
          </p>
        )}

        {isMe && (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="on your list" value={stats.open.length} className={accent.soft} />
              <Stat label="done this week" value={stats.doneThisWeek} className={accent.soft} />
              <Stat label="pts this week" value={stats.pointsThisWeek} className={accent.soft} />
            </dl>

            <div className="mt-4">
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-plum">Shows up on time</span>
                <span className={stats.reliability === 0 ? "font-medium text-plum-soft" : "font-semibold text-plum"}>
                  {stats.reliability === 0 ? "Fresh week ✨" : `${stats.reliability}%`}
                </span>
              </div>
              <div
                className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-cream-deep"
                role="progressbar"
                aria-label={`${roommate.name} on-time rate`}
                aria-valuenow={stats.reliability}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={cn("h-full rounded-full bg-gradient-to-r", accent.gradient)}
                  style={{ width: `${stats.reliability}%` }}
                />
              </div>
            </div>
          </>
        )}

        {stats.open.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold tracking-wider text-plum-soft uppercase">Up next</p>
            <ul className="space-y-1.5">
              {stats.open
                .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt))
                .slice(0, 3)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-plum">{c.title}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        new Date(c.dueAt) < now ? "font-semibold text-coral-700" : "text-plum-soft",
                      )}
                    >
                      {new Date(c.dueAt) < now ? "running late" : dueLabel(c.dueAt, now)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("rounded-2xl px-1 py-2.5", className)}>
      <dd className={value === 0 ? "text-xs font-medium text-plum-soft" : "font-display text-2xl font-bold text-plum"}>{value === 0 ? "Fresh week ✨" : value}</dd>
      <dt className="text-[11px] leading-tight font-medium text-plum-soft">{label}</dt>
    </div>
  );
}
