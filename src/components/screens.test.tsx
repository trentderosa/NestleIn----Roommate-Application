// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/lib/mock-data";
import { ChoresScreen } from "./chores-screen";
import { RoommatesScreen } from "./roommates-screen";

const now = new Date(2026, 9, 8, 12);
const state = createSeedState(now);
const navigation = vi.hoisted(() => ({ search: "filter=all", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => "/chores",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/lib/store", () => ({ useHousehold: () => state, useNow: () => now, actions: {} }));
vi.mock("./chore-card", () => ({ ChoreCard: ({ chore }: { chore: { id: string; title: string } }) => <p data-testid={`chore-${chore.id}`}>{chore.title}</p> }));
vi.mock("./nudge-sheet", () => ({ NudgeSheet: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

beforeEach(() => { navigation.search = "filter=all"; navigation.replace.mockClear(); });
afterEach(cleanup);

describe("Roommates privacy", () => {
  it("only shows weekly stats and the on-time bar on your own card", () => {
    render(<RoommatesScreen />);
    const own = screen.getByRole("heading", { name: /Krystiana/ }).closest("li")!;
    expect(within(own).getByText("done this week")).toBeTruthy();
    expect(within(own).getByText("pts this week")).toBeTruthy();
    expect(within(own).getByRole("progressbar")).toBeTruthy();
    for (const name of ["Ellie", "Katie", "Emery"]) {
      const card = screen.getByRole("heading", { name }).closest("li")!;
      expect(within(card).queryByText("done this week")).toBeNull();
      expect(within(card).queryByText("pts this week")).toBeNull();
      expect(within(card).queryByText("Shows up on time")).toBeNull();
      expect(within(card).queryByRole("progressbar")).toBeNull();
      expect(card.textContent).not.toMatch(/\d+%/);
      expect(within(card).getByText("Up next")).toBeTruthy();
    }
  });
});

describe("Chores URL filters", () => {
  it("applies See all mine on the already mounted Chores screen and responds to back navigation", () => {
    const { rerender } = render(<ChoresScreen />);
    const other = state.chores.find((c) => c.assigneeId !== state.currentUserId)!;
    expect(screen.getByTestId(`chore-${other.id}`)).toBeTruthy();
    navigation.search = "filter=all&mine=1";
    rerender(<ChoresScreen />);
    expect((screen.getByRole("checkbox", { name: "Just mine" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByTestId(`chore-${other.id}`)).toBeNull();
    for (const chore of state.chores.filter((c) => c.assigneeId === state.currentUserId)) {
      expect(screen.getByTestId(`chore-${chore.id}`)).toBeTruthy();
    }
    navigation.search = "filter=all";
    rerender(<ChoresScreen />);
    expect(screen.getByTestId(`chore-${other.id}`)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Just mine" }) as HTMLInputElement).checked).toBe(false);
  });

  it("updates the URL for Just mine and preserves it when switching filters", () => {
    const { rerender } = render(<ChoresScreen />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Just mine" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/chores?filter=all&mine=1", { scroll: false });
    navigation.search = "filter=all&mine=1";
    rerender(<ChoresScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^Upcoming/ }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/chores?filter=upcoming&mine=1", { scroll: false });
    fireEvent.click(screen.getByRole("checkbox", { name: "Just mine" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/chores?filter=all", { scroll: false });
  });
});
