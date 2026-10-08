import { Suspense } from "react";
import type { Metadata } from "next";
import { ChoresScreen } from "@/components/chores-screen";
import { ScreenSkeleton } from "@/components/page-bits";

export const metadata: Metadata = { title: "Chores" };

export default function ChoresPage() {
  return (
    // useSearchParams needs a Suspense boundary to prerender the shell.
    <Suspense fallback={<ScreenSkeleton />}>
      <ChoresScreen />
    </Suspense>
  );
}
