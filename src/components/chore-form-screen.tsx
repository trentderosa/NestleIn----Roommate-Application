"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useHousehold, useNow } from "@/lib/store";
import { ChoreForm } from "./chore-form";
import { EmptyState, Page, PageHeader, ScreenSkeleton } from "./page-bits";

/** /chores/new (no id param) and /chores/[id]/edit. */
export function ChoreFormScreen() {
  const state = useHousehold();
  const now = useNow();
  const { id } = useParams<{ id?: string }>();

  if (!state) return <ScreenSkeleton />;

  const chore = id ? state.chores.find((c) => c.id === id) : undefined;

  return (
    <Page className="max-w-2xl">
      <Link
        href={id ? "/chores?filter=all" : "/"}
        className="mb-4 -ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-plum-soft hover:text-plum"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back
      </Link>

      {id && !chore ? (
        <EmptyState emoji="🫥" title="This chore wandered off">
          It may have been removed. <Link href="/chores?filter=all" className="font-semibold text-lilac-700 underline">See all chores</Link>
        </EmptyState>
      ) : (
        <>
          <PageHeader
            title={chore ? "Edit chore" : "New chore"}
            subtitle={chore ? chore.title : "Add something to the house board."}
          />
          <ChoreForm key={chore?.id ?? "new"} state={state} chore={chore} now={now} />
        </>
      )}
    </Page>
  );
}
