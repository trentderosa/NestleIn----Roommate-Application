"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Shuffle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCENTS,
  CATEGORIES,
  CATEGORY_ORDER,
  POINTS_LABELS,
  RECURRENCE_LABELS,
  RECURRENCE_ORDER,
} from "@/lib/design";
import { actions, isPersisted } from "@/lib/store";
import { fromDateTimeInputs, toDateInput, toTimeInput } from "@/lib/time";
import type { Chore, ChoreCategory, ChoreInput, HouseholdState, Points, Recurrence } from "@/lib/types";
import { Avatar } from "./avatar";
import { showUndoToast } from "./undo-toast";

const TEMPLATES: { title: string; category: ChoreCategory; recurrence: Recurrence; points: Points }[] = [
  { title: "Take out the trash", category: "trash", recurrence: "weekly", points: 1 },
  { title: "Unload dishwasher", category: "kitchen", recurrence: "daily", points: 1 },
  { title: "Clean bathroom", category: "bathroom", recurrence: "weekly", points: 3 },
  { title: "Vacuum living room", category: "living", recurrence: "weekly", points: 2 },
  { title: "Water plants", category: "plants", recurrence: "weekly", points: 1 },
  { title: "Restock toilet paper", category: "supplies", recurrence: "monthly", points: 1 },
];

/** Roommate with the lightest open load (by points). Keeps new chores fair by default. */
function lightestLoad(state: HouseholdState): string {
  const load = new Map(state.household.memberIds.map((id) => [id, 0]));
  for (const c of state.chores) {
    if (c.status === "open") load.set(c.assigneeId, (load.get(c.assigneeId) ?? 0) + c.points);
  }
  return [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

function defaultDue(now: Date): Date {
  const d = new Date(now);
  if (d.getHours() >= 19) d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

function quickDates(now: Date) {
  const tonight = new Date(now);
  tonight.setHours(21, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  const weekend = new Date(now);
  weekend.setDate(weekend.getDate() + ((6 - weekend.getDay() + 7) % 7 || 7));
  weekend.setHours(11, 0, 0, 0);
  return [
    ...(now.getHours() < 20 ? [{ label: "Tonight", date: tonight }] : []),
    { label: "Tomorrow", date: tomorrow },
    { label: "This weekend", date: weekend },
  ];
}

/** Create/edit form. Pass `chore` to edit. */
export function ChoreForm({ state, chore, now }: { state: HouseholdState; chore?: Chore; now: Date }) {
  const router = useRouter();
  const editing = !!chore;
  const initialDue = chore ? new Date(chore.dueAt) : defaultDue(now);

  const [title, setTitle] = useState(chore?.title ?? "");
  const [category, setCategory] = useState<ChoreCategory>(chore?.category ?? "kitchen");
  const [description, setDescription] = useState(chore?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(chore?.assigneeId ?? lightestLoad(state));
  const [date, setDate] = useState(toDateInput(initialDue));
  const [time, setTime] = useState(toTimeInput(initialDue));
  const [recurrence, setRecurrence] = useState<Recurrence>(chore?.recurrence ?? "weekly");
  const [rotate, setRotate] = useState(chore?.rotate ?? true);
  const [points, setPoints] = useState<Points>(chore?.points ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canRotate = recurrence !== "once";
  const members = state.household.memberIds;
  const nameOf = (id: string) =>
    id === state.currentUserId ? "You" : (state.roommates.find((r) => r.id === id)?.name ?? "");
  const start = Math.max(0, members.indexOf(assigneeId));
  const rotationOrder = members.map((_, i) => members[(start + i) % members.length]);

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setTitle(t.title);
    setCategory(t.category);
    setRecurrence(t.recurrence);
    setPoints(t.points);
    setError(null);
  }

  function setQuickDate(d: Date) {
    setDate(toDateInput(d));
    setTime(toTimeInput(d));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give this chore a name first 🙂");
      document.getElementById("chore-title")?.focus();
      return;
    }
    const input: ChoreInput = {
      title,
      category,
      description,
      assigneeId,
      dueAt: fromDateTimeInputs(date, time).toISOString(),
      recurrence,
      rotate: canRotate && rotate,
      points,
    };
    if (!actions.saveChore(input, chore?.id)) {
      toast("That chore was removed", { description: "It was deleted in another tab, so there was nothing to save." });
      router.push("/chores?filter=all");
      return;
    }
    const firstUp = `${nameOf(assigneeId) === "You" ? "You're" : `${nameOf(assigneeId)} is`} up first.`;
    if (isPersisted()) {
      toast(editing ? "Saved ✨" : `${title.trim()} is on the board ✨`, {
        description: editing ? undefined : firstUp,
      });
    } else {
      // Don't promise persistence when storage failed; the banner explains.
      toast(editing ? "Updated for now" : `${title.trim()} added for now`, {
        description: "It isn't saved on this device yet.",
      });
    }
    router.push(editing ? "/chores?filter=all" : "/");
  }

  function remove() {
    if (!chore) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const undo = actions.deleteChore(chore.id);
    if (undo) showUndoToast(`${chore.title} removed`, undo);
    router.push("/chores?filter=all");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-7 pb-4">
      {/* Name */}
      <Field label="What needs doing?" htmlFor="chore-title">
        <input
          id="chore-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="e.g. Take out the trash"
          maxLength={60}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? "chore-title-error" : undefined}
          className="h-14 w-full rounded-2xl bg-white px-4 font-display text-lg font-semibold text-plum shadow-soft ring-2 ring-transparent outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-plum-soft focus:ring-lilac-200 aria-invalid:ring-coral-200"
        />
        {error && (
          <p id="chore-title-error" className="mt-2 text-sm font-medium text-coral-700">
            {error}
          </p>
        )}
        {!editing && (
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.title}
                type="button"
                onClick={() => applyTemplate(t)}
                className="rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium text-plum-soft ring-1 ring-border transition hover:bg-white hover:text-plum"
              >
                {t.title}
              </button>
            ))}
          </div>
        )}
      </Field>

      {/* Category */}
      <fieldset>
        <Legend>Category</Legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {CATEGORY_ORDER.map((key) => {
            const c = CATEGORIES[key];
            const Icon = c.icon;
            const accent = ACCENTS[c.accent];
            const active = key === category;
            return (
              <Choice key={key} name="category" checked={active} onChange={() => setCategory(key)}>
                <span
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-xs font-semibold text-plum-soft transition",
                    active ? cn(accent.soft, accent.text, "ring-2", accent.ring) : "bg-white shadow-soft",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {c.label}
                </span>
              </Choice>
            );
          })}
        </div>
      </fieldset>

      {/* Description */}
      <Field label="Notes" hint="optional" htmlFor="chore-notes">
        <textarea
          id="chore-notes"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Any tips? Where's the good spray?"
          className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-plum shadow-soft ring-2 ring-transparent outline-none placeholder:text-plum-soft focus:ring-lilac-200"
        />
      </Field>

      {/* Assignee + rotation */}
      <fieldset>
        <Legend>Who&apos;s on it{canRotate && rotate ? " first" : ""}?</Legend>
        <div className="flex flex-wrap gap-2">
          {state.roommates.map((r) => {
            const active = r.id === assigneeId;
            return (
              <Choice key={r.id} name="assignee" checked={active} onChange={() => setAssigneeId(r.id)}>
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold text-plum transition",
                    active ? cn(ACCENTS[r.accent].soft, "ring-2 ring-plum") : "bg-white shadow-soft",
                  )}
                >
                  <Avatar roommate={r} size="sm" />
                  {nameOf(r.id)}
                </span>
              </Choice>
            );
          })}
        </div>

        <label
          className={cn(
            "mt-4 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-soft",
            canRotate ? "cursor-pointer" : "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="checkbox"
            checked={canRotate && rotate}
            disabled={!canRotate}
            onChange={(e) => setRotate(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-cream-deep transition peer-checked:bg-lilac-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lilac-700 after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold text-plum">
              <Shuffle className="size-4 text-lilac-700" aria-hidden /> Rotate between roommates
            </span>
            <span className="mt-0.5 block text-sm text-plum-soft">
              {canRotate
                ? "Each time it's done, the next person is up. Fair and square."
                : "Pick a repeat schedule to rotate this one."}
            </span>
            {canRotate && rotate && (
              <span className="mt-2 flex flex-wrap items-center gap-1 text-sm font-medium text-plum">
                {rotationOrder.map((id, i) => (
                  <span key={id} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="size-3.5 text-plum-soft" aria-label="then" />}
                    {nameOf(id)}
                  </span>
                ))}
              </span>
            )}
          </span>
        </label>
      </fieldset>

      {/* Due */}
      <fieldset>
        <Legend>When&apos;s it due?</Legend>
        <div className="mb-3 flex flex-wrap gap-2">
          {quickDates(now).map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setQuickDate(q.date)}
              className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-plum shadow-soft transition hover:bg-butter-50"
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <label className="sr-only" htmlFor="chore-date">
            Date
          </label>
          <input
            id="chore-date"
            type="date"
            required
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-12 w-full rounded-2xl bg-white px-4 text-plum shadow-soft outline-none focus:ring-2 focus:ring-lilac-200"
          />
          <label className="sr-only" htmlFor="chore-time">
            Time
          </label>
          <input
            id="chore-time"
            type="time"
            required
            value={time}
            onChange={(e) => e.target.value && setTime(e.target.value)}
            className="h-12 w-full rounded-2xl bg-white px-4 text-plum shadow-soft outline-none focus:ring-2 focus:ring-lilac-200"
          />
        </div>
      </fieldset>

      {/* Recurrence */}
      <fieldset>
        <Legend>Repeats</Legend>
        <div className="flex flex-wrap gap-2">
          {RECURRENCE_ORDER.map((r) => (
            <Choice key={r} name="recurrence" checked={r === recurrence} onChange={() => setRecurrence(r)}>
              <span
                className={cn(
                  "block rounded-full px-4 py-2 text-sm font-semibold transition",
                  r === recurrence ? "bg-plum text-cream" : "bg-white text-plum-soft shadow-soft",
                )}
              >
                {RECURRENCE_LABELS[r]}
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>

      {/* Points */}
      <fieldset>
        <Legend>How big is it?</Legend>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as Points[]).map((p) => (
            <Choice key={p} name="points" checked={p === points} onChange={() => setPoints(p)}>
              <span
                className={cn(
                  "flex flex-col items-center rounded-2xl py-3 transition",
                  p === points ? "bg-butter-50 ring-2 ring-butter-200" : "bg-white shadow-soft",
                )}
              >
                <span className="text-butter-700" aria-hidden>
                  {"★".repeat(p)}
                </span>
                <span className="mt-0.5 text-sm font-semibold text-plum">{POINTS_LABELS[p].label}</span>
                <span className="text-xs text-plum-soft">{POINTS_LABELS[p].hint}</span>
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>

      <div className="sticky bottom-24 z-10 flex flex-col gap-3 pt-2 md:bottom-6">
        <button
          type="submit"
          className="h-14 w-full rounded-full bg-plum text-base font-semibold text-cream shadow-lift transition hover:bg-plum/90 active:scale-[0.98]"
        >
          {editing ? "Save changes" : "Add to the board ✨"}
        </button>
      </div>

      {editing && (
        <button
          type="button"
          onClick={remove}
          onBlur={() => setConfirmDelete(false)}
          className={cn(
            "mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
            confirmDelete ? "bg-coral-50 text-coral-700" : "text-plum-soft hover:text-coral-700",
          )}
        >
          <Trash2 className="size-4" aria-hidden />
          {confirmDelete ? "Tap again to remove" : "Remove this chore"}
        </button>
      )}
    </form>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return <legend className="mb-3 font-display text-lg font-bold text-plum">{children}</legend>;
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-3 block font-display text-lg font-bold text-plum">
        {label} {hint && <span className="font-sans text-sm font-normal text-plum-soft">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

/** Visually custom radio: real input for keyboard + screen readers, styled child. */
function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="cursor-pointer rounded-2xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lilac-700">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}
