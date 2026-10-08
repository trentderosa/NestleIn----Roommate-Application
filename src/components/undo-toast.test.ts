// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { UndoRecord } from "@/lib/chores";

const { toast } = vi.hoisted(() => {
  let next = 0;
  const toast = Object.assign(
    vi.fn(() => `toast-${++next}`),
    { dismiss: vi.fn() },
  );
  return { toast };
});
vi.mock("sonner", () => ({ toast }));

import { showUndoToast } from "./undo-toast";

const record: UndoRecord = { kind: "complete", choreId: "chore_counters", eventIds: [] };

describe("showUndoToast", () => {
  // Fix 7
  it("closes the previous Undo toast when a new one appears", () => {
    const first = showUndoToast("Trash: done ✨", record);
    expect(toast.dismiss).not.toHaveBeenCalled();

    const second = showUndoToast("Dishes: done ✨", record);
    expect(toast.dismiss).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledWith(first);

    showUndoToast("Counters: done ✨", record);
    expect(toast.dismiss).toHaveBeenLastCalledWith(second);
  });

  it("keeps Undo toasts open until dismissed", () => {
    showUndoToast("Trash: done ✨", record);
    expect(toast).toHaveBeenLastCalledWith(
      "Trash: done ✨",
      expect.objectContaining({ duration: Infinity, closeButton: true }),
    );
  });
});
