"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Route-level errors (inside the app shell, so navigation stays usable). */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} retry={reset} />;
}
