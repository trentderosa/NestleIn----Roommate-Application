import { Suspense } from "react";
import type { Metadata } from "next";
import { ChoreFormScreen } from "@/components/chore-form-screen";
import { ScreenSkeleton } from "@/components/page-bits";

export const metadata: Metadata = { title: "Edit chore" };

export default function EditChorePage() {
  return (
    // Chores live in client state, so the id is read with useParams on the client.
    <Suspense fallback={<ScreenSkeleton />}>
      <ChoreFormScreen />
    </Suspense>
  );
}
