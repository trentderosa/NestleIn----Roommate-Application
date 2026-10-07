import { cn } from "@/lib/utils";
import { ACCENTS } from "@/lib/design";
import type { Roommate } from "@/lib/types";

const SIZES = {
  xs: { box: "size-6", text: "text-[10px]" },
  sm: { box: "size-8", text: "text-xs" },
  md: { box: "size-11", text: "text-sm" },
  lg: { box: "size-16", text: "text-xl" },
  xl: { box: "size-20", text: "text-2xl" },
};

/**
 * Generated placeholder avatar: initial on the roommate's accent gradient,
 * with an optional emoji badge. Swap for <img> when real photos exist.
 */
export function Avatar({
  roommate,
  size = "md",
  badge = false,
  className,
}: {
  roommate: Roommate;
  size?: keyof typeof SIZES;
  badge?: boolean;
  className?: string;
}) {
  const accent = ACCENTS[roommate.accent];
  return (
    <span className={cn("relative inline-flex shrink-0", SIZES[size].text, className)}>
      <span
        aria-hidden
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-gradient-to-br font-display font-bold text-plum ring-2 ring-white",
          accent.gradient,
          SIZES[size].box,
        )}
      >
        {roommate.name.charAt(0)}
      </span>
      {badge && (
        <span
          aria-hidden
          className="absolute -right-1 -bottom-1 grid size-[1.7em] place-items-center rounded-full bg-white text-[0.75em] leading-none shadow-soft"
        >
          {roommate.emoji}
        </span>
      )}
      <span className="sr-only">{roommate.name}</span>
    </span>
  );
}

export function AvatarStack({ roommates, size = "sm" }: { roommates: Roommate[]; size?: "xs" | "sm" | "md" }) {
  return (
    <span className="flex -space-x-2">
      {roommates.map((r) => (
        <Avatar key={r.id} roommate={r} size={size} />
      ))}
    </span>
  );
}
