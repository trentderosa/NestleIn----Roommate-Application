import { cn } from "@/lib/utils";

/** Wordmark: a soft rounded "nest" mark + NestleIn. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <defs>
          <linearGradient id="nest-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#d9cbfa" />
            <stop offset="1" stopColor="#fac9d7" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="10" fill="url(#nest-g)" />
        <path
          d="M8 17.5c0 4.2 3.6 6.5 8 6.5s8-2.3 8-6.5"
          fill="none"
          stroke="#3b1f3f"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="12.5" cy="14" r="2.6" fill="#ff8f78" />
        <circle cx="19.5" cy="14" r="2.6" fill="#fff8f1" stroke="#3b1f3f" strokeWidth="1.4" />
      </svg>
      <span className="font-display text-xl font-bold tracking-tight text-plum">
        Nestle<span className="text-blush-700">In</span>
      </span>
    </span>
  );
}
