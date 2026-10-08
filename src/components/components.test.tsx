// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendNudge } from "@/lib/chores";
import { createSeedState } from "@/lib/mock-data";
import { ChoreCard } from "./chore-card";
import { AppErrorBoundary } from "./error-screen";
import { LiveAnnouncer, announce } from "./live-announcer";
import { NudgeSheet } from "./nudge-sheet";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 9, 7, 15, 0);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NudgeSheet", () => {
  it("a closed sheet's confirmation timer can't close the next sheet", () => {
    vi.useFakeTimers();
    const state = createSeedState(new Date());
    const trash = state.chores.find((c) => c.id === "chore_trash")!;
    const dishes = state.chores.find((c) => c.id === "chore_dishwasher")!;
    const onClose = vi.fn();

    const { rerender } = render(<NudgeSheet chore={trash} state={state} now={new Date()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /send nudge/i }));
    expect(screen.getByText("Nudge sent!")).toBeTruthy();

    // The user closes it right away, then opens a nudge for another chore.
    rerender(<NudgeSheet chore={null} state={state} now={new Date()} onClose={onClose} />);
    rerender(<NudgeSheet chore={dishes} state={state} now={new Date()} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /nudge emery/i })).toBeTruthy();
  });

  it("closes itself after the confirmation when left open", () => {
    vi.useFakeTimers();
    const state = createSeedState(new Date());
    const trash = state.chores.find((c) => c.id === "chore_trash")!;
    const onClose = vi.fn();
    render(<NudgeSheet chore={trash} state={state} now={new Date()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /send nudge/i }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ChoreCard", () => {
  it("doesn't put the ticking cooldown text in a live region", () => {
    const state = sendNudge(
      createSeedState(NOW),
      { choreId: "chore_trash", tone: "sweet", message: "hi" },
      NOW,
    );
    const trash = state.chores.find((c) => c.id === "chore_trash")!;
    const { container } = render(<ChoreCard chore={trash} state={state} now={NOW} onNudge={() => {}} />);
    expect(screen.getByText(/you can nudge again/i)).toBeTruthy();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});

describe("AppErrorBoundary", () => {
  it("catches a crash in the app shell and recovers with Try again", () => {
    // React logs caught errors; keep the test output readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function FlakyShell() {
      if (shouldThrow) throw new Error("shell exploded");
      return <p>shell is fine</p>;
    }

    render(
      <AppErrorBoundary>
        <FlakyShell />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Something got tangled")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("shell is fine")).toBeTruthy();
    spy.mockRestore();
  });
});

describe("LiveAnnouncer", () => {
  it("announces a result once through the single live region", () => {
    vi.useFakeTimers();
    render(<LiveAnnouncer />);
    const region = screen.getByRole("status");
    act(() => announce("Nudge sent to Ellie."));
    expect(region.textContent).toBe(""); // cleared first so repeats re-announce
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(region.textContent).toBe("Nudge sent to Ellie.");
  });
});
