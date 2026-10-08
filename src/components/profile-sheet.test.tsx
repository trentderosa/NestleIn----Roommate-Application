// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/lib/mock-data";
import { actions, useHousehold, useNow } from "@/lib/store";
import { STORAGE_KEY } from "@/lib/store-core";
import { statusExpiry } from "@/lib/profile";
import { ProfileSheetHost, ProfileView, openProfile } from "./profile-sheet";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** Renders a profile from the live store, like the sheet does. */
function LiveProfile({ id }: { id: string }) {
  const state = useHousehold();
  const now = useNow();
  if (!state) return null;
  const roommate = state.roommates.find((r) => r.id === id)!;
  return <ProfileView state={state} roommate={roommate} now={now} />;
}

/** Every interactive control in the profile meets the 44px target via h-11/min-h-11/size-11. */
function expectTouchTargets(container: HTMLElement) {
  const controls = container.querySelectorAll("button, a, label:has(input[type=radio])");
  for (const el of controls) {
    expect(el.className, `${el.textContent} should be at least 44px`).toMatch(/(^|\s)(h-11|min-h-11|size-11)(\s|$)/);
  }
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("ProfileView: your own profile", () => {
  it("shows status, Edit, upcoming chores with Done, and private stats and badges", () => {
    const { container } = render(<LiveProfile id="krystiana" />);
    expect(screen.getByRole("heading", { name: /Krystiana/ })).toBeTruthy();
    expect(screen.getByTestId("profile-status").textContent).toContain("matcha-powered today");
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Up next for you" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Mark .* done$/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "See all mine" }).getAttribute("href")).toBe("/chores?filter=all&mine=1");
    expect(screen.getByRole("heading", { name: "Just for you" })).toBeTruthy();
    expect(screen.getByText("Only you can see these.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Badges" })).toBeTruthy();
    expect(screen.getAllByText(/Locked:/).length).toBeGreaterThan(0); // unearned badges explain how to earn them
    expectTouchTargets(container);
  });

  it("edits the status inline: text, emoji, quick pick, and clear-after", () => {
    const { container } = render(<LiveProfile id="krystiana" />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const form = screen.getByRole("form", { name: "Edit your status" });
    expectTouchTargets(container);

    // A quick pick fills both fields...
    fireEvent.click(within(form).getByRole("button", { name: /at the gym/ }));
    expect((screen.getByLabelText("Your status") as HTMLInputElement).value).toBe("at the gym");
    expect((screen.getByLabelText("Emoji 🏋️") as HTMLInputElement).checked).toBe(true);

    // ...and can be adjusted. Typing past 60 characters is cut off.
    fireEvent.change(screen.getByLabelText("Your status"), { target: { value: "at the library ".repeat(6) } });
    expect(Array.from((screen.getByLabelText("Your status") as HTMLInputElement).value)).toHaveLength(60);
    fireEvent.change(screen.getByLabelText("Your status"), { target: { value: "at the library" } });
    fireEvent.click(screen.getByLabelText("Emoji 📚"));
    fireEvent.click(screen.getByLabelText("Today"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    });

    expect(screen.queryByRole("form", { name: "Edit your status" })).toBeNull();
    expect(screen.getByTestId("profile-status").textContent).toBe("📚at the library");

    // Saved through the store, with a quiet feed entry and an expiry tonight.
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).state;
    const me = saved.roommates.find((r: { id: string }) => r.id === "krystiana");
    expect(me).toMatchObject({ status: "at the library", statusEmoji: "📚" });
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    expect(new Date(me.statusExpiresAt).getTime()).toBe(end.getTime());
    expect(saved.activity[0]).toMatchObject({ type: "status", actorId: "krystiana", text: "at the library" });
  });

  it("clears the status", () => {
    render(<LiveProfile id="krystiana" />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Clear status" }));
    });
    expect(screen.getByTestId("profile-status").textContent).toBe("No status yet");
  });
});

describe("ProfileView: someone else's profile (read-only)", () => {
  it("shows only status, streak, and upcoming chores", () => {
    render(<LiveProfile id="katie" />);
    expect(screen.getByRole("heading", { name: "Katie" })).toBeTruthy();
    expect(screen.getByTestId("profile-status").textContent).toContain("plant mom era");
    expect(screen.getByText(/on time in a row/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Up next" })).toBeTruthy();

    // Nothing to edit or act on, and nothing private.
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Mark .* done$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "See all mine" })).toBeNull();
    expect(screen.queryByText("Just for you")).toBeNull();
    expect(screen.queryByText("Badges")).toBeNull();
    expect(screen.queryByText(/on time$/)).toBeNull();
  });
});

describe("ProfileSheetHost", () => {
  it("opens from openProfile as a labelled dialog and closes with Escape", () => {
    render(<ProfileSheetHost />);
    act(() => openProfile("krystiana"));
    const dialog = screen.getByRole("dialog", { name: "Your profile" });
    expectTouchTargets(dialog);
    expect(within(dialog).getByRole("button", { name: "Close profile" })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Your profile" })).toBeNull();

    act(() => openProfile("ellie"));
    expect(screen.getByRole("dialog", { name: "Ellie's profile" })).toBeTruthy();
  });

  it("returns focus to the button that opened it", async () => {
    render(
      <>
        <button type="button" onClick={() => openProfile("krystiana")}>
          Open me
        </button>
        <ProfileSheetHost />
      </>,
    );
    const opener = screen.getByRole("button", { name: "Open me" });
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    const dialog = screen.getByRole("dialog", { name: "Your profile" });
    expect(dialog.contains(document.activeElement)).toBe(true); // focus moved into the sheet
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
      await new Promise((r) => setTimeout(r, 0)); // Radix restores focus after unmount
    });
    expect(document.activeElement).toBe(opener);
  });
});


describe("status editor accessibility and expiry", () => {
  it.each(["Save status", "Cancel", "Clear status"])("focuses the input and returns focus after %s", (button) => {
    render(<LiveProfile id="krystiana" />);
    act(() => { actions.setStatus({ text: "hello", emoji: "", clearAfter: "never" }); });
    fireEvent.click(screen.getByRole("button", { name: "Edit status" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Your status"));
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit status" }));
  });

  it.each(["today", "week"] as const)("keeps the %s clear-after selection when re-editing and saving", (clearAfter) => {
    render(<LiveProfile id="krystiana" />);
    act(() => { actions.setStatus({ text: "hello", emoji: "", clearAfter }); });
    fireEvent.click(screen.getByRole("button", { name: "Edit status" }));
    expect((screen.getByLabelText(clearAfter === "today" ? "Today" : "This week") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Your status"), { target: { value: "updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).state;
    expect(saved.roommates[0].statusClearAfter).toBe(clearAfter);
    expect(saved.roommates[0].statusExpiresAt).toBe(statusExpiry(clearAfter, new Date()));
  });

  it("recovers the selection from earlier v2 timestamp-only statuses", () => {
    const now = new Date(2026, 9, 8, 12);
    const state = createSeedState(now);
    const roommate = { ...state.roommates[0], statusExpiresAt: statusExpiry("week", now), statusUpdatedAt: now.toISOString() };
    render(<ProfileView state={state} roommate={roommate} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit status" }));
    expect((screen.getByLabelText("This week") as HTMLInputElement).checked).toBe(true);
  });

  it("uses soft zero states for private stats", () => {
    const now = new Date();
    const state = createSeedState(now);
    state.chores = [];
    const roommate = { ...state.roommates[0], streak: 0, history: { completed: 0, onTime: 0 } };
    render(<ProfileView state={state} roommate={roommate} now={now} />);
    expect(screen.getAllByText("Fresh week ✨")).toHaveLength(3);
    expect(screen.queryByText("0%")).toBeNull();
  });
});
