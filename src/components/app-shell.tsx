"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Home, ListChecks, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHousehold } from "@/lib/store";
import { Avatar, AvatarStack } from "./avatar";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chores", label: "Chores", icon: ListChecks },
  { href: "/roommates", label: "Roommates", icon: Users },
  { href: "/activity", label: "Activity", icon: Bell },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // "/chores/new" belongs to the Add button, not the Chores tab.
  if (pathname === "/chores/new") return false;
  return pathname.startsWith(href);
}

/**
 * Responsive app frame:
 * - mobile: content + fixed bottom tab bar with a raised Add button
 * - md+: left sidebar with nav and household card, content column centered
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const state = useHousehold();
  const me = state?.roommates.find((r) => r.id === state.currentUserId);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-8 border-r border-border/70 bg-white/60 px-5 py-7 backdrop-blur-md md:flex">
        <Link href="/" aria-label="NestleIn home" className="px-2">
          <Logo />
        </Link>

        <Link
          href="/chores/new"
          className="flex items-center justify-center gap-2 rounded-full bg-plum px-4 py-3 font-semibold text-cream shadow-lift transition hover:-translate-y-0.5 hover:bg-plum/90"
        >
          <Plus className="size-5" aria-hidden />
          New chore
        </Link>

        <Suspense fallback={<SidebarNav pathname="" />}>
          <WithPathname render={(p) => <SidebarNav pathname={p} />} />
        </Suspense>

        {state && (
          <div className="mt-auto rounded-3xl bg-gradient-to-br from-lilac-50 to-blush-50 p-4">
            <p className="text-xs font-medium tracking-wide text-plum-soft uppercase">Your place</p>
            <p className="mt-1 font-display text-lg font-bold text-plum">
              {state.household.name} {state.household.emoji}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <AvatarStack roommates={state.roommates} size="xs" />
              {me && (
                <span className="flex items-center gap-1.5 text-xs text-plum-soft">
                  <Avatar roommate={me} size="xs" /> you
                </span>
              )}
            </div>
          </div>
        )}
      </aside>

      <main className="pb-28 md:pb-12 md:pl-64">{children}</main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
      >
        <Suspense fallback={<TabBarItems pathname="" />}>
          <WithPathname render={(p) => <TabBarItems pathname={p} />} />
        </Suspense>
      </nav>
    </div>
  );
}

/**
 * Reads the pathname in its own small component. In the root layout,
 * usePathname must sit under Suspense so dynamic routes can still prerender
 * their shell (Cache Components); the fallback is the same nav, unhighlighted.
 */
function WithPathname({ render }: { render: (pathname: string) => React.ReactNode }) {
  return render(usePathname());
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 font-medium text-plum-soft transition hover:bg-lilac-50 hover:text-plum",
              active && "bg-lilac-50 text-plum",
            )}
          >
            <Icon className={cn("size-5", active && "text-lilac-700")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabBarItems({ pathname }: { pathname: string }) {
  return (
    <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
      {NAV.slice(0, 2).map((item) => (
        <TabItem key={item.href} {...item} active={isActive(pathname, item.href)} />
      ))}
      <li className="flex justify-center">
        <Link
          href="/chores/new"
          aria-label="Add a chore"
          aria-current={pathname === "/chores/new" ? "page" : undefined}
          className="-mt-5 mb-2 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-plum to-[#5d3463] text-cream shadow-lift ring-4 ring-cream transition active:scale-95"
        >
          <Plus className="size-7" aria-hidden />
        </Link>
      </li>
      {NAV.slice(2).map((item) => (
        <TabItem key={item.href} {...item} active={isActive(pathname, item.href)} />
      ))}
    </ul>
  );
}

function TabItem({
  href,
  label,
  icon: Icon,
  active,
}: (typeof NAV)[number] & { active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-plum-soft transition",
          active && "text-plum",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-12 items-center justify-center rounded-full transition",
            active && "bg-lilac-50",
          )}
        >
          <Icon className={cn("size-5", active && "text-lilac-700")} aria-hidden />
        </span>
        {label}
      </Link>
    </li>
  );
}
