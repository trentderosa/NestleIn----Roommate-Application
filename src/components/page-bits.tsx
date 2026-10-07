import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered content column used by every screen. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 md:pt-10 lg:px-10", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm font-medium text-plum-soft">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-bold tracking-tight text-plum md:text-4xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-plum-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Section({
  title,
  count,
  href,
  hrefLabel = "See all",
  children,
  className,
}: {
  title: React.ReactNode;
  count?: number;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-8", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-plum">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-white px-2 py-0.5 font-sans text-xs font-semibold text-plum-soft shadow-soft">
              {count}
            </span>
          )}
        </h2>
        {href && (
          <Link
            href={href}
            className="flex items-center text-sm font-semibold text-lilac-700 hover:underline"
          >
            {hrefLabel}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-border bg-white/50 px-6 py-10 text-center">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <p className="mt-3 font-display text-lg font-bold text-plum">{title}</p>
      {children && <div className="mt-1 max-w-xs text-sm text-plum-soft">{children}</div>}
    </div>
  );
}

/** Shown while household state loads on the client. */
export function ScreenSkeleton() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading your place" className="animate-pulse space-y-4">
        <div className="h-5 w-32 rounded-full bg-cream-deep" />
        <div className="h-9 w-64 rounded-full bg-cream-deep" />
        <div className="h-36 rounded-3xl bg-cream-deep" />
        <div className="h-28 rounded-3xl bg-cream-deep" />
        <div className="h-28 rounded-3xl bg-cream-deep" />
      </div>
    </Page>
  );
}

/** Pill-style filter tabs. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition",
              active
                ? "bg-plum text-cream shadow-soft"
                : "bg-white text-plum-soft shadow-soft hover:text-plum",
            )}
          >
            {o.label}
            {o.count !== undefined && o.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-white/20" : "bg-cream-deep",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
