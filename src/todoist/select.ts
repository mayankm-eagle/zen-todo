import { addDays, dayKey, dueDay, dueMinutes, isOverdue } from "../lib/dates";
import type { State } from "./store";
import type { Priority, Project, Section, Task } from "./types";

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

/** Nest subtasks under their parents (parents missing from the list become roots). */
export function tree(tasks: Task[], sort: (a: Task, b: Task) => number = byOrder): Node[] {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const t of tasks) {
    if (t.parent_id && ids.has(t.parent_id)) {
      const list = kids.get(t.parent_id) ?? [];
      list.push(t);
      kids.set(t.parent_id, list);
    } else roots.push(t);
  }
  const build = (t: Task): Node => ({ task: t, children: (kids.get(t.id) ?? []).sort(byOrder).map(build) });
  return roots.sort(sort).map(build);
}

export const flat = (t: Task[]): Node[] => t.map((task) => ({ task, children: [] }));

export interface Group {
  key: string;
  title: string;
  nodes: Node[];
  /** Where a task typed into this group should go. */
  add?: { projectId?: string; sectionId?: string; dueToday?: boolean };
  /** Drop target for drag and drop (priority view). */
  priority?: Priority;
  count?: number;
}

export function todayGroups(s: State, now = new Date()): { overdue: Task[]; today: Task[] } {
  const today = dayKey(now);
  const overdue: Task[] = [];
  const todays: Task[] = [];
  for (const t of visibleTasks(s)) {
    if (!t.due) continue;
    const d = dueDay(t.due);
    if (d < today) overdue.push(t);
    else if (d === today) todays.push(t);
  }
  return { overdue: overdue.sort(byDue), today: todays.sort(byAgenda) };
}

export function upcomingDays(s: State, days = 14, now = new Date()): { key: string; tasks: Task[] }[] {
  const keys = Array.from({ length: days }, (_, i) => dayKey(addDays(now, i + 1)));
  const by = new Map(keys.map((k) => [k, [] as Task[]]));
  for (const t of visibleTasks(s)) {
    if (!t.due) continue;
    by.get(dueDay(t.due))?.push(t);
  }
  return keys.map((key) => ({ key, tasks: by.get(key)!.sort(byAgenda) }));
}

export function projectTasks(s: State, projectId: string) {
  const tasks = visibleTasks(s).filter((t) => t.project_id === projectId);
  const sections = Object.values(s.sections)
    .filter((x) => x.project_id === projectId)
    .sort(sectionOrder);
  return {
    loose: tree(tasks.filter((t) => !t.section_id || !s.sections[t.section_id])),
    sections: sections.map((sec) => ({ section: sec, nodes: tree(tasks.filter((t) => t.section_id === sec.id)) })),
    total: tasks.filter((t) => !t.checked).length,
  };
}

const sectionOrder = (a: Section, b: Section) =>
  a.order_key && b.order_key && a.order_key !== b.order_key
    ? a.order_key < b.order_key
      ? -1
      : 1
    : a.section_order - b.section_order;

export type PriorityScope = "today" | "week" | "all";

export function priorityGroups(s: State, scope: PriorityScope, now = new Date()): Record<Priority, Task[]> {
  const limit = scope === "today" ? dayKey(now) : scope === "week" ? dayKey(addDays(now, 7)) : null;
  const out: Record<Priority, Task[]> = { 4: [], 3: [], 2: [], 1: [] };
  for (const t of visibleTasks(s)) {
    if (limit && (!t.due || dueDay(t.due) > limit)) continue;
    out[t.priority].push(t);
  }
  for (const p of [1, 2, 3, 4] as Priority[]) out[p].sort(byDue);
  return out;
}

export interface ProjectRow {
  project: Project;
  depth: number;
  open: number;
}

export function projectRows(s: State): ProjectRow[] {
  const open = new Map<string, number>();
  for (const t of Object.values(s.items)) if (!t.checked) open.set(t.project_id, (open.get(t.project_id) ?? 0) + 1);
  const all = Object.values(s.projects).filter((p) => !p.inbox_project);
  const ids = new Set(all.map((p) => p.id));
  const kids = new Map<string | null, Project[]>();
  for (const p of all) {
    const parent = p.parent_id && ids.has(p.parent_id) ? p.parent_id : null;
    kids.set(parent, [...(kids.get(parent) ?? []), p]);
  }
  const order = (a: Project, b: Project) =>
    a.order_key && b.order_key && a.order_key !== b.order_key ? (a.order_key < b.order_key ? -1 : 1) : a.child_order - b.child_order;
  const rows: ProjectRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const p of (kids.get(parent) ?? []).sort(order)) {
      rows.push({ project: p, depth, open: open.get(p.id) ?? 0 });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export const inboxProject = (s: State) => Object.values(s.projects).find((p) => p.inbox_project);

export const overdue = (t: Task, now = new Date()) => !!t.due && isOverdue(t.due, now);
