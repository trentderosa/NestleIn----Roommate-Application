import {
  Bath,
  Package,
  Shirt,
  Sofa,
  Sprout,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { AccentColor, ChoreCategory, Points, Recurrence } from "./types";

/**
 * Accent color -> Tailwind classes. Written out in full so Tailwind's scanner
 * picks them up (no string interpolation of class names).
 */
export const ACCENTS: Record<
  AccentColor,
  { soft: string; fill: string; text: string; ring: string; gradient: string }
> = {
  lilac: {
    soft: "bg-lilac-50",
    fill: "bg-lilac-200",
    text: "text-lilac-700",
    ring: "ring-lilac-200",
    gradient: "from-lilac-200 to-blush-200",
  },
  blush: {
    soft: "bg-blush-50",
    fill: "bg-blush-200",
    text: "text-blush-700",
    ring: "ring-blush-200",
    gradient: "from-blush-200 to-coral-200",
  },
  coral: {
    soft: "bg-coral-50",
    fill: "bg-coral-200",
    text: "text-coral-700",
    ring: "ring-coral-200",
    gradient: "from-coral-200 to-butter-200",
  },
  butter: {
    soft: "bg-butter-50",
    fill: "bg-butter-200",
    text: "text-butter-700",
    ring: "ring-butter-200",
    gradient: "from-butter-200 to-mint-200",
  },
  mint: {
    soft: "bg-mint-50",
    fill: "bg-mint-200",
    text: "text-mint-700",
    ring: "ring-mint-200",
    gradient: "from-mint-200 to-sky-200",
  },
  sky: {
    soft: "bg-sky-50",
    fill: "bg-sky-200",
    text: "text-sky-700",
    ring: "ring-sky-200",
    gradient: "from-sky-200 to-lilac-200",
  },
};

export const CATEGORIES: Record<
  ChoreCategory,
  { label: string; icon: LucideIcon; accent: AccentColor; /** used in nudge copy */ noun: string }
> = {
  kitchen: { label: "Kitchen", icon: UtensilsCrossed, accent: "coral", noun: "the kitchen" },
  bathroom: { label: "Bathroom", icon: Bath, accent: "sky", noun: "the bathroom" },
  trash: { label: "Trash", icon: Trash2, accent: "lilac", noun: "the trash" },
  living: { label: "Living room", icon: Sofa, accent: "blush", noun: "the living room" },
  supplies: { label: "Supplies", icon: Package, accent: "butter", noun: "the supply closet" },
  plants: { label: "Plants", icon: Sprout, accent: "mint", noun: "the plants" },
  laundry: { label: "Laundry", icon: Shirt, accent: "lilac", noun: "the laundry pile" },
};

export const CATEGORY_ORDER = Object.keys(CATEGORIES) as ChoreCategory[];

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

export const RECURRENCE_ORDER = Object.keys(RECURRENCE_LABELS) as Recurrence[];

export const POINTS_LABELS: Record<Points, { label: string; hint: string }> = {
  1: { label: "Quick win", hint: "~5 min" },
  2: { label: "Medium", hint: "~20 min" },
  3: { label: "Big job", hint: "30 min+" },
};
