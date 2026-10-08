"use client";

import { useEffect, useState } from "react";

let push: ((message: string) => void) | null = null;

/**
 * Announce a one-off result to screen readers (e.g. "Nudge sent to Ellie").
 * Use for events, not for values that tick: countdowns and timers must not
 * live in an aria-live region or they get re-announced on every update.
 */
export function announce(message: string) {
  push?.(message);
}

/** The single polite live region. Rendered once in the root layout. */
export function LiveAnnouncer() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    push = (next) => {
      // Clear first so repeating the same message is announced again. A
      // timeout (not requestAnimationFrame) still fires in background tabs.
      setMessage("");
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(next), 100);
    };
    return () => {
      push = null;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
