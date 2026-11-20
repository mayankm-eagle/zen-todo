import type { Due } from "../todoist/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar day as "YYYY-MM-DD". */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Parse a "YYYY-MM-DD" key as local midnight. */
export const fromKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const isFixed = (due: Due) => due.date.endsWith("Z");
export const hasTime = (due: Due) => due.date.includes("T");

/** The local day a due date falls on. Fixed-timezone dates are UTC instants. */
export function dueDay(due: Due): string {
  if (isFixed(due)) return dayKey(new Date(due.date));
  return due.date.slice(0, 10);
}

/** Minutes since local midnight, or null for all-day dates. */
export function dueMinutes(due: Due): number | null {
  if (!hasTime(due)) return null;
  if (isFixed(due)) {
    const d = new Date(due.date);
    return d.getHours() * 60 + d.getMinutes();
  }
  const [, t] = due.date.split("T");
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad(m)}${suffix}`;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const WEEKDAY_LONG = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

export const longDate = (d: Date) => LONG.format(d);

/** "Today", "Tomorrow", "Yesterday", "Friday", "Nov 28". */
export function relativeDay(key: string, today: Date = new Date()): string {
  const t = dayKey(today);
  if (key === t) return "Today";
  if (key === dayKey(addDays(today, 1))) return "Tomorrow";
  if (key === dayKey(addDays(today, -1))) return "Yesterday";
  const d = fromKey(key);
  const diff = Math.round((d.getTime() - fromKey(t).getTime()) / 86_400_000);
  if (diff > 1 && diff < 7) return WEEKDAY_LONG.format(d);
  return MONTH_DAY.format(d);
}

/** Section heading for a day in Upcoming: "Tomorrow", "Sat 22 Nov". */
export function dayHeading(key: string, today: Date = new Date()): string {
  const rel = relativeDay(key, today);
  if (rel === "Today" || rel === "Tomorrow") return rel;
  const d = fromKey(key);
  return `${WEEKDAY.format(d)} ${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
}

/** Compact label for a task's due date, e.g. "Tomorrow 3pm". */
export function dueLabel(due: Due, today: Date = new Date()): string {
  const day = relativeDay(dueDay(due), today);
  const mins = dueMinutes(due);
  const time = mins === null ? "" : formatTime(mins);
  if (day === "Today" && time) return time;
  return time ? `${day} ${time}` : day;
}

export function isOverdue(due: Due, now: Date = new Date()): boolean {
  const day = dueDay(due);
  const today = dayKey(now);
  if (day < today) return true;
  if (day > today) return false;
  const mins = dueMinutes(due);
  return mins !== null && mins < now.getHours() * 60 + now.getMinutes();
}
