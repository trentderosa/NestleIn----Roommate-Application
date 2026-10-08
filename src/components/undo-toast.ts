"use client";

import { toast } from "sonner";
import type { UndoRecord } from "@/lib/chores";
import { actions } from "@/lib/store";

/**
 * A toast with an Undo action that stays until the user dismisses it, so
 * Undo never disappears on a timer. Sonner keeps toasts reachable from the
 * keyboard (Alt+T focuses the toast region).
 */
export function showUndoToast(
  message: string,
  record: UndoRecord,
  options: { description?: string } = {},
) {
  const id = toast(message, {
    description: options.description,
    duration: Infinity,
    closeButton: true,
    action: {
      label: "Undo",
      onClick: () => {
        const result = actions.undo(record);
        if (result.ok) {
          toast("Undone", { description: "Back the way it was." });
        } else {
          toast("Can't undo that", { description: result.reason });
        }
      },
    },
  });
  return id;
}
