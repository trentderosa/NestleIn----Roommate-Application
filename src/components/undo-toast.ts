"use client";

import { toast } from "sonner";
import type { UndoRecord } from "@/lib/chores";
import { actions } from "@/lib/store";

/** The Undo toast currently on screen, if any. Only the latest one is offered. */
let current: string | number | null = null;

/**
 * A toast with an Undo action that stays until the user dismisses it, so
 * Undo never disappears on a timer. Sonner keeps toasts reachable from the
 * keyboard (Alt+T focuses the toast region).
 *
 * Showing a new Undo toast closes the previous one, so toasts don't pile up
 * and Undo always refers to the most recent change.
 */
export function showUndoToast(
  message: string,
  record: UndoRecord,
  options: { description?: string } = {},
) {
  if (current !== null) toast.dismiss(current);
  const id = toast(message, {
    description: options.description,
    duration: Infinity,
    closeButton: true,
    onDismiss: () => {
      if (current === id) current = null;
    },
    action: {
      label: "Undo",
      onClick: () => {
        if (current === id) current = null;
        const result = actions.undo(record);
        if (result.ok) {
          toast("Undone", { description: "Back the way it was." });
        } else {
          toast("Can't undo that", { description: result.reason });
        }
      },
    },
  });
  current = id;
  return id;
}
