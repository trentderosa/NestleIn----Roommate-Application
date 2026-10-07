"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { boardSections, roommateStats } from "@/lib/chores";
import { useHousehold, useNow } from "@/lib/store";
import { greeting } from "@/lib/time";
import type { Chore, HouseholdState } from "@/lib/types";
import { ActivityItem } from "./activity-item";
import { Avatar } from "./avatar";
import { ChoreCard } from "./chore-card";
import { Logo } from "./logo";
import { NudgeSheet } from "./nudge-sheet";
import { EmptyState, Page, ScreenSkeleton, Section } from "./page-bits";

export function HouseBoard() {
  const state = useHousehold();
  const now = useNow();
  const [nudging, setNudging] = useState<Chore | null>(null);

  if (!state) return <ScreenSkeleton />;

  const me = state.roommates.find((r) => r.id === state.currentUserId)!;
  const { overdue, today, upcoming, recentlyDone, todayTotal, todayDone } = boardSections(state.chores, now);
  const hello = greeting(now);
  const card = (c: Chore) => <ChoreCard key={c.id} chore={c} state={state} now={now} onNudge={setNudging} />;

  return (
    <Page>
      {/* Mobile top bar */}
      <div className="mb-5 flex items-center justify-between md:hidden">
        <Logo />
        <Link href="/roommates" aria-label={`${me.name}, see roommates`}>
          <Avatar roommate={me} size="sm" />
        </Link>
      </div>

      <header className="mb-6">
        <p className="text-sm font-semibold text-plum-soft">
          {state.household.name} {state.household.emoji}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-plum md:text-4xl">
          {hello.text}, {me.name} {hello.emoji}
        </h1>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div>
          <TodaySummary
            state={state}
            now={now}
            overdue={overdue.length}
            remainingToday={today.length}
            done={todayDone}
            total={todayTotal}
          />

          {overdue.length > 0 && (
            <Section title="Running a little late" count={overdue.length} href="/chores?filter=overdue">
              <div className="grid gap-3">{overdue.map(card)}</div>
            </Section>
          )}

          <Section title="Today" count={today.length} href="/chores?filter=today">
            {today.length > 0 ? (
              <div className="grid gap-3">{today.map(card)}</div>
            ) : (
              <EmptyState emoji="🛋️" title="Nothing else due today">
                Put your feet up. Your place is in good shape.
              </EmptyState>
            )}
          </Section>

          {upcoming.length > 0 && (
            <Section title="Coming up" href="/chores?filter=upcoming">
              <div className="grid gap-3">{upcoming.slice(0, 3).map(card)}</div>
            </Section>
          )}

          {recentlyDone.length > 0 && (
            <Section title="Recently done ✨" href="/chores?filter=completed">
              <div className="grid gap-2">{recentlyDone.map(card)}</div>
            </Section>
          )}
        </div>

        <aside className="lg:sticky lg:top-10 lg:h-fit">
          <Section title="House feed" href="/activity">
            <ul className="space-y-5 rounded-3xl bg-white/70 p-4 shadow-soft">
              {state.activity.slice(0, 4).map((e) => (
                <ActivityItem key={e.id} event={e} state={state} now={now} compact />
              ))}
            </ul>
          </Section>
        </aside>
      </div>

      <Link
        href="/chores/new"
        className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-plum shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift md:hidden"
      >
        <Plus className="size-5 text-blush-700" aria-hidden /> Add a chore
      </Link>

      <NudgeSheet chore={nudging} state={state} now={now} onClose={() => setNudging(null)} />
    </Page>
  );
}

function TodaySummary({
  state,
  now,
  overdue,
  remainingToday,
  done,
  total,
}: {
  state: HouseholdState;
  now: Date;
  overdue: number;
  remainingToday: number;
  done: number;
  total: number;
}) {
  const pct = total === 0 ? 1 : done / total;
  const allClear = overdue === 0 && remainingToday === 0;

  let headline: string;
  if (allClear) headline = "All caught up. Your place is glowing ✨";
  else if (overdue > 0)
    headline = `${remainingToday} on today's list, ${overdue} running a little late 👀`;
  else headline = `${remainingToday} thing${remainingToday === 1 ? "" : "s"} left on today's list`;

  return (
    <section
      aria-label="Today at a glance"
      className="relative mb-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-lilac-200 via-blush-200 to-coral-200 p-5 text-plum shadow-lift md:p-6"
    >
      <div aria-hidden className="absolute -top-10 -right-10 size-40 rounded-full bg-white/30 blur-2xl" />
      <div className="relative flex items-center gap-5">
        <ProgressRing value={pct} label={`${done}/${total}`} />
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider uppercase opacity-70">Today at your place</p>
          <p className="mt-1 font-display text-xl leading-tight font-bold md:text-2xl">{headline}</p>
        </div>
      </div>

      <ul className="relative mt-5 flex flex-wrap gap-2">
        {state.roommates.map((r) => {
          const stats = roommateStats(state, r, now);
          return (
            <li key={r.id}>
              <Link
                href="/roommates"
                className="flex items-center gap-2 rounded-full bg-white/60 py-1 pr-3 pl-1 text-sm font-semibold backdrop-blur transition hover:bg-white/90"
              >
                <Avatar roommate={r} size="xs" />
                {r.id === state.currentUserId ? "You" : r.name}
                <span
                  className={cn(
                    "size-2 rounded-full",
                    stats.overdueCount > 0 ? "bg-coral-700" : stats.open.length > 0 ? "bg-butter-700" : "bg-mint-700",
                  )}
                  aria-hidden
                />
                <span className="sr-only">
                  {stats.overdueCount > 0
                    ? `${stats.overdueCount} running late`
                    : `${stats.open.length} on their list`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-20 shrink-0" role="img" aria-label={`${label} done today`}>
      <svg viewBox="0 0 72 72" className="size-20 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="#3b1f3f"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center font-display leading-none font-bold">
        <span className="text-lg">{label}</span>
        <span className="text-[10px] font-semibold tracking-wide uppercase opacity-70">done</span>
      </span>
    </div>
  );
}
