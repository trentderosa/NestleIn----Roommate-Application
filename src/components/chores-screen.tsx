"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { filterChores, type ChoreFilter } from "@/lib/chores";
import { useHousehold, useNow } from "@/lib/store";
import type { Chore } from "@/lib/types";
import { ChoreCard } from "./chore-card";
import { NudgeSheet } from "./nudge-sheet";
import { EmptyState, FilterChips, Page, PageHeader, ScreenSkeleton } from "./page-bits";

const FILTERS: { value: ChoreFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Running late" },
  { value: "completed", label: "Done ✨" },
  { value: "all", label: "All" },
];

const EMPTY: Record<ChoreFilter, { emoji: string; title: string; body: string }> = {
  today: { emoji: "🛋️", title: "Nothing due today", body: "Enjoy the calm. Your place looks great." },
  upcoming: { emoji: "🗓️", title: "Nothing coming up", body: "Add a chore to plan ahead." },
  overdue: { emoji: "🌷", title: "Nobody's running late", body: "Look at this household go." },
  completed: { emoji: "✨", title: "Nothing done yet", body: "The first Done ✨ of the day is the best one." },
  all: { emoji: "🪴", title: "No chores yet", body: "Add your first one to get the board going." },
};

function isFilter(v: string | null): v is ChoreFilter {
  return FILTERS.some((f) => f.value === v);
}

/** Filter lives in the URL (?filter=overdue) so the board can deep-link here. */
export function ChoresScreen() {
  const state = useHousehold();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nudging, setNudging] = useState<Chore | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  if (!state) return <ScreenSkeleton />;

  const raw = params.get("filter");
  const filter: ChoreFilter = isFilter(raw) ? raw : "today";
  const scoped = mineOnly ? state.chores.filter((c) => c.assigneeId === state.currentUserId) : state.chores;
  const chores = filterChores(scoped, filter, now);
  const options = FILTERS.map((f) => ({
    ...f,
    count: f.value === "completed" || f.value === "all" ? undefined : filterChores(scoped, f.value, now).length,
  }));

  function setFilter(next: ChoreFilter) {
    router.replace(`${pathname}?filter=${next}`, { scroll: false });
  }

  const recurring = chores.filter((c) => c.recurrence !== "once" && c.status === "open").length;

  return (
    <Page>
      <PageHeader
        eyebrow={`${state.household.name} ${state.household.emoji}`}
        title="Chores"
        subtitle={
          filter === "completed"
            ? "Everything your place has knocked out lately."
            : `${chores.length} ${chores.length === 1 ? "chore" : "chores"}${recurring ? `, ${recurring} on repeat` : ""}`
        }
        action={
          <Link
            href="/chores/new"
            className="hidden items-center gap-2 rounded-full bg-plum px-5 py-3 font-semibold text-cream shadow-lift transition hover:-translate-y-0.5 sm:flex"
          >
            <Plus className="size-5" aria-hidden /> New chore
          </Link>
        }
      />

      <FilterChips label="Filter chores" options={options} value={filter} onChange={setFilter} />

      <label className="mb-5 flex w-fit cursor-pointer items-center gap-3 text-sm font-semibold text-plum">
        <input
          type="checkbox"
          checked={mineOnly}
          onChange={(e) => setMineOnly(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 rounded-full bg-cream-deep transition peer-checked:bg-lilac-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lilac-700 after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
        />
        Just mine
      </label>

      {chores.length === 0 ? (
        <EmptyState emoji={EMPTY[filter].emoji} title={EMPTY[filter].title}>
          {EMPTY[filter].body}
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {chores.map((c) => (
            <div key={c.id} className="animate-rise">
              <ChoreCard chore={c} state={state} now={now} onNudge={setNudging} />
            </div>
          ))}
        </div>
      )}

      <NudgeSheet chore={nudging} state={state} now={now} onClose={() => setNudging(null)} />
    </Page>
  );
}
