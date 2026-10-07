/** Small date helpers. Kept dependency-free on purpose. */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Whole calendar days from `now` to `d` (negative = past). */
export function dayDiff(d: Date, now: Date): number {
  return Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY);
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
}

export function formatWeekday(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "just now", "5m ago", "3h ago", "yesterday", "Mon", "Sep 12" */
export function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const diff = now.getTime() - d.getTime();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  const days = -dayDiff(d, now);
  if (days === 0) return `${Math.floor(diff / HOUR)}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return formatWeekday(d);
  return formatShortDate(d);
}

/** Friendly due label: "tonight at 9 PM", "today at 2 PM", "tomorrow at 10 AM", "Thu at 6 PM". */
export function dueLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = dayDiff(d, now);
  const time = formatTime(d);
  if (days === 0) {
    if (d < now || d.getHours() < 17) return `today at ${time}`;
    return `tonight at ${time}`;
  }
  if (days === 1) return `tomorrow at ${time}`;
  if (days === -1) return `yesterday at ${time}`;
  if (days > 1 && days < 7) return `${formatWeekday(d)} at ${time}`;
  return `${formatShortDate(d)} at ${time}`;
}

export function greeting(now: Date): { text: string; emoji: string } {
  const h = now.getHours();
  if (h < 5) return { text: "Up late", emoji: "🌙" };
  if (h < 12) return { text: "Good morning", emoji: "☀️" };
  if (h < 17) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
}

/** Value for <input type="date"> / <input type="time"> in local time. */
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInputs(date: string, time: string): Date {
  const [y, m, day] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, day, h, min);
}
