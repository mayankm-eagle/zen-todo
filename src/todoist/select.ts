import { dueDay, dueMinutes } from "../lib/dates";
import type { State } from "./store";
import type { Priority, Task } from "./types";

/** The Todoist label that marks shallow work (case-insensitive). Unlabeled tasks are deep. */
export const SHALLOW = "shallow";
export const isShallow = (t: Task) => t.labels.some((l) => l.toLowerCase() === SHALLOW);

/** Minutes a task is expected to take: its Todoist duration, else a 10-minute guess. */
export const estimate = (t: Task) =>
  t.duration ? (t.duration.unit === "day" ? t.duration.amount * 8 * 60 : t.duration.amount) : 10;

export function shallowTasks(s: Pick<State, "items" | "done">): Task[] {
  return visibleTasks(s).filter(isShallow).sort(byPile);
}

/** Dated first (soonest first), then by priority, then oldest first. */
const byPile = (a: Task, b: Task) => {
  if (!!a.due !== !!b.due) return a.due ? -1 : 1;
  if (a.due && b.due) {
    const c = byDueOnly(a, b);
    if (c) return c;
  }
  if (a.priority !== b.priority) return b.priority - a.priority;
  return (a.added_at ?? "").localeCompare(b.added_at ?? "");
};
const byDueOnly = (a: Task, b: Task) => {
  const da = dueDay(a.due!);
  const db = dueDay(b.due!);
  return da < db ? -1 : da > db ? 1 : 0;
};

/** Tasks to show: open tasks, plus ones completed a moment ago (as they were). */
export function visibleTasks(s: Pick<State, "items" | "done">): Task[] {
  const out: Task[] = [];
  for (const t of Object.values(s.items)) {
    const snap = s.done[t.id];
    if (snap) out.push({ ...snap, checked: true });
    else if (!t.checked) out.push(t);
  }
  for (const [id, snap] of Object.entries(s.done)) if (!s.items[id]) out.push({ ...snap, checked: true });
  return out;
}

const byOrder = (a: Task, b: Task) =>
  a.order_key && b.order_key && a.order_key !== b.order_key
    ? a.order_key < b.order_key
      ? -1
      : 1
    : a.child_order - b.child_order;

/** Timed first (by time), then priority, then Todoist's own day order. */
export const byAgenda = (a: Task, b: Task) => {
  const ta = a.due ? dueMinutes(a.due) : null;
  const tb = b.due ? dueMinutes(b.due) : null;
  if (ta !== null && tb !== null && ta !== tb) return ta - tb;
  if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return (a.day_order ?? 0) - (b.day_order ?? 0) || byOrder(a, b);
};

const byDue = (a: Task, b: Task) => {
  const da = a.due ? dueDay(a.due) : "9999";
  const db = b.due ? dueDay(b.due) : "9999";
  return da < db ? -1 : da > db ? 1 : byAgenda(a, b);
};

export interface Node {
  task: Task;
  children: Node[];
}

export const flat = (t: Task[]): Node[] => t.map((task) => ({ task, children: [] }));

export function priorityGroups(s: Pick<State, "items" | "done">): Record<Priority, Task[]> {
  const out: Record<Priority, Task[]> = { 4: [], 3: [], 2: [], 1: [] };
  for (const t of visibleTasks(s)) out[t.priority].push(t);
  for (const p of [1, 2, 3, 4] as Priority[]) out[p].sort(byDue);
  return out;
}
