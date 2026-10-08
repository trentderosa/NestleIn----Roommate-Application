"use client";

import { useState } from "react";
import { useHousehold, useNow } from "@/lib/store";
import { dayDiff } from "@/lib/time";
import type { ActivityEvent } from "@/lib/types";
import { ActivityItem } from "./activity-item";
import { EmptyState, FilterChips, Page, PageHeader, ScreenSkeleton } from "./page-bits";

type FeedFilter = "all" | "done" | "nudges" | "updates";

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "done", label: "Done ✨" },
  { value: "nudges", label: "Nudges 👀" },
  { value: "updates", label: "Updates" },
];

function matches(e: ActivityEvent, f: FeedFilter) {
  if (f === "done") return e.type === "completed";
  if (f === "nudges") return e.type === "nudged";
  if (f === "updates") return e.type === "rotated" || e.type === "created" || e.type === "status";
  return true;
}

function dayGroup(iso: string, now: Date): string {
  const days = -dayDiff(new Date(iso), now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  return "A while back";
}

export function ActivityScreen() {
  const state = useHousehold();
  const now = useNow();
  const [filter, setFilter] = useState<FeedFilter>("all");
  if (!state) return <ScreenSkeleton />;

  const events = state.activity.filter((e) => matches(e, filter));
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  for (const e of events) {
    const label = dayGroup(e.at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(e);
    else groups.push({ label, events: [e] });
  }

  return (
    <Page className="max-w-2xl">
      <PageHeader
        eyebrow={`${state.household.name} ${state.household.emoji}`}
        title="House feed"
        subtitle="What's been happening at your place."
      />

      <FilterChips label="Filter activity" options={FILTERS} value={filter} onChange={setFilter} />

      {groups.length === 0 ? (
        <EmptyState emoji="🫧" title="Quiet in here">
          Nothing to show yet. It&apos;ll fill up as your place gets things done.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mb-8">
            <h2 className="mb-3 text-xs font-bold tracking-wider text-plum-soft uppercase">{g.label}</h2>
            <ul className="space-y-6 rounded-3xl bg-white p-5 shadow-soft">
              {g.events.map((e) => (
                <ActivityItem key={e.id} event={e} state={state} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}
    </Page>
  );
}
