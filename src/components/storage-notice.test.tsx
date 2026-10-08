// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actions } from "@/lib/store";
import { STORAGE_KEY } from "@/lib/store-core";
import { StorageNotice } from "./storage-notice";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StorageNotice", () => {
  // Fix 4 (second review)
  it("offers to discard the exact number of unsaved changes, then lists dropped ones", () => {
    window.localStorage.clear();
    render(<StorageNotice />); // loads the store and saves the seed

    // Storage fills up: writes to the household key fail from here on.
    let full = true;
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (full && key === STORAGE_KEY) throw new DOMException("full", "QuotaExceededError");
      return realSet.call(this, key, value);
    });

    act(() => {
      actions.completeChore("chore_counters");
      actions.toggleReaction("evt_soap", "💕");
    });
    expect(screen.getByRole("button", { name: "Discard 2 unsaved changes" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard 2 unsaved changes" }));
    expect(screen.queryByRole("button", { name: /Discard/ })).toBeNull();

    // An edit that will stop fitting, plus one that still fits.
    act(() => {
      actions.saveChore(
        {
          title: "Fridge glow-up",
          category: "kitchen",
          assigneeId: "emery",
          dueAt: new Date().toISOString(),
          recurrence: "monthly",
          rotate: true,
          points: 3,
        },
        "chore_fridge",
      );
      actions.toggleReaction("evt_soap", "✨");
    });
    expect(screen.getByRole("button", { name: "Discard 2 unsaved changes" })).toBeTruthy();

    // Another tab deletes the fridge chore, then storage frees up.
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    saved.state.chores = saved.state.chores.filter((c: { id: string }) => c.id !== "chore_fridge");
    saved.revision += 1;
    saved.writeId = "w_other_tab";
    full = false;
    realSet.call(window.localStorage, STORAGE_KEY, JSON.stringify(saved));

    act(() => {
      actions.retrySave();
    });
    expect(screen.getByText(/One change couldn't be saved/)).toBeTruthy();
    expect(screen.getByText(/Fridge glow-up.*deleted in another tab/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Discard/ })).toBeNull(); // the rest was saved
    const after = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).state;
    expect(after.activity.find((e: { id: string }) => e.id === "evt_soap").reactions["✨"]).toEqual(["krystiana"]);

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(/couldn't be saved/)).toBeNull();
  });
});
