import { addDays, dayKey } from "../lib/dates";
import type { Command, CommandStatus, Label, Priority, Project, Section, SyncRequest, SyncResponse, Task, Transport } from "./types";

// An in-memory stand-in for Todoist so the app can be tried without a token.
// Nothing here leaves the browser.

const now = new Date();
const d = (n: number, time?: string) => {
  const key = dayKey(addDays(now, n));
  return time ? `${key}T${time}:00` : key;
};

let seq = 100;
const nextId = () => `demo${++seq}`;

function task(p: Partial<Task> & Pick<Task, "content" | "project_id">): Task {
  return {
    id: nextId(),
    section_id: null,
    parent_id: null,
    description: "",
    priority: 1,
    due: null,
    labels: [],
    child_order: seq,
    checked: false,
    is_deleted: false,
    ...p,
  };
}

const due = (date: string, string: string, is_recurring = false) => ({ date, string, timezone: null, is_recurring, lang: "en" });

function seed() {
  const projects: Project[] = [
    { id: "inbox", name: "Inbox", parent_id: null, child_order: 0, inbox_project: true },
    { id: "work", name: "Work", parent_id: null, child_order: 1 },
    { id: "launch", name: "Launch", parent_id: "work", child_order: 1 },
    { id: "home", name: "Home", parent_id: null, child_order: 2 },
    { id: "reading", name: "Reading", parent_id: null, child_order: 3 },
  ];
  const sections: Section[] = [
    { id: "s-week", name: "This week", project_id: "work", section_order: 1 },
    { id: "s-later", name: "Later", project_id: "work", section_order: 2 },
    { id: "s-errands", name: "Errands", project_id: "home", section_order: 1 },
  ];
  const labels: Label[] = [
    { id: "l1", name: "errand" },
    { id: "l2", name: "deep" },
  ];
  const draft = task({ content: "Draft the launch post", project_id: "launch", priority: 4, due: due(d(0, "10:00"), "today at 10am"), labels: ["deep"], description: "Lead with the why. Keep it under 600 words." });
  const items: Task[] = [
    draft,
    task({ content: "Outline", project_id: "launch", parent_id: draft.id }),
    task({ content: "Pick a hero image", project_id: "launch", parent_id: draft.id }),
    task({ content: "Renew passport", project_id: "home", section_id: "s-errands", priority: 3, due: due(d(-3), d(-3)), labels: ["errand"] }),
    task({ content: "Reply to Sam about the offsite", project_id: "work", section_id: "s-week", priority: 2, due: due(d(0), "today") }),
    task({ content: "Review **Q4 plan** with the team", project_id: "work", section_id: "s-week", priority: 3, due: due(d(0, "15:30"), "today at 3:30pm") }),
    task({ content: "Water the plants", project_id: "home", due: due(d(0), "every 3 days", true) }),
    task({ content: "Book flights for December", project_id: "home", priority: 2, due: due(d(1), "tomorrow") }),
    task({ content: "1:1 prep", project_id: "work", section_id: "s-week", due: due(d(2, "09:00"), "every week at 9am", true) }),
    task({ content: "Grocery run", project_id: "home", section_id: "s-errands", due: due(d(3), d(3)), labels: ["errand"] }),
    task({ content: "Write up the architecture decision", project_id: "work", section_id: "s-later", priority: 2, due: due(d(5), d(5)), labels: ["deep"] }),
    task({ content: "Clean out the garage", project_id: "home" }),
    task({ content: "Read [The Grain of Thought](https://asker.dev/grain-of-thought)", project_id: "reading" }),
    task({ content: "Finish *A Pattern Language*", project_id: "reading", due: due(d(9), d(9)) }),
    task({ content: "Look into standing desks", project_id: "inbox" }),
    task({ content: "Call mom", project_id: "inbox", priority: 3, due: due(d(0, "18:00"), "today at 6pm") }),
  ];
  return { projects, sections, labels, items };
}

export class DemoTransport implements Transport {
  private db = seed();
  private version = 1;
  private changed = new Map<string, number>(); // item id → version

  private touch(t: Task) {
    this.changed.set(t.id, ++this.version);
  }

  private find(id: unknown) {
    return this.db.items.find((t) => t.id === id && !t.is_deleted);
  }

  private apply(c: Command, map: Record<string, string>): CommandStatus {
    const a = c.args;
    const t = this.find(map[a.id as string] ?? a.id);
    switch (c.type) {
      case "item_update": {
        if (!t) return { error: "Item not found" };
        for (const k of ["content", "description", "priority", "labels"] as const) if (k in a) (t as any)[k] = a[k];
        if ("due" in a) t.due = a.due === null ? null : parseDue((a.due as { string?: string; date?: string }).string ?? "", (a.due as any).date);
        this.touch(t);
        return "ok";
      }
      case "item_move": {
        if (!t) return { error: "Item not found" };
        if (a.section_id) {
          t.section_id = a.section_id as string;
          t.project_id = this.db.sections.find((s) => s.id === a.section_id)?.project_id ?? t.project_id;
        } else if (a.project_id) {
          t.project_id = a.project_id as string;
          t.section_id = null;
        }
        t.parent_id = null;
        this.touch(t);
        return "ok";
      }
      case "item_close": {
        if (!t) return { error: "Item not found" };
        if (t.due?.is_recurring) {
          const step = /3 days/.test(t.due.string) ? 3 : /week/.test(t.due.string) ? 7 : 1;
          const [date, time] = t.due.date.split("T");
          const next = dayKey(addDays(new Date(`${date}T00:00:00`), step));
          t.due = { ...t.due, date: time ? `${next}T${time}` : next };
        } else t.checked = true;
        this.touch(t);
        return "ok";
      }
      case "item_uncomplete": {
        const x = this.db.items.find((i) => i.id === a.id);
        if (!x) return { error: "Item not found" };
        x.checked = false;
        this.touch(x);
        return "ok";
      }
      case "item_delete": {
        if (!t) return { error: "Item not found" };
        for (const x of this.db.items) if (x.id === t.id || x.parent_id === t.id) {
          x.is_deleted = true;
          this.touch(x);
        }
        return "ok";
      }
      default:
        return { error: `Demo doesn't support ${c.type}` };
    }
  }

  async sync(req: SyncRequest): Promise<SyncResponse> {
    await new Promise((r) => setTimeout(r, 120));
    const map: Record<string, string> = {};
    const sync_status: Record<string, CommandStatus> = {};
    for (const c of req.commands ?? []) sync_status[c.uuid] = this.apply(c, map);
    const full = req.sync_token === "*";
    const since = full ? 0 : Number(req.sync_token) || 0;
    const items = full
      ? this.db.items.filter((t) => !t.is_deleted && !t.checked)
      : this.db.items.filter((t) => (this.changed.get(t.id) ?? 0) > since);
    return {
      sync_token: String(this.version),
      full_sync: full,
      items: structuredClone(items),
      projects: full ? structuredClone(this.db.projects) : [],
      sections: full ? structuredClone(this.db.sections) : [],
      labels: full ? structuredClone(this.db.labels) : [],
      user: full ? { id: "demo", full_name: "Demo" } : undefined,
      sync_status,
      temp_id_mapping: map,
    };
  }

  async quickAdd(text: string): Promise<Task> {
    await new Promise((r) => setTimeout(r, 150));
    let content = ` ${text} `;
    let priority: Priority = 1;
    let project_id = "inbox";
    const labels: string[] = [];
    content = content.replace(/\sp([1-4])\s/i, (_, n) => ((priority = (5 - Number(n)) as Priority), " "));
    content = content.replace(/\s#(\S+)/, (_, name: string) => {
      const p = this.db.projects.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (p) project_id = p.id;
      return " ";
    });
    content = content.replace(/\s@(\S+)/g, (_, l: string) => (labels.push(l), " "));
    let dueObj = null;
    const m = content.match(/\s(today|tomorrow|tmr|next week|mon|tue|wed|thu|fri|sat|sun)\b(\s(at\s)?\d{1,2}(:\d{2})?\s?(am|pm))?/i);
    if (m) {
      dueObj = parseDue(m[0].trim());
      content = content.replace(m[0], " ");
    }
    const t = task({ content: content.replace(/\s+/g, " ").trim(), project_id, priority, labels, due: dueObj });
    this.db.items.push(t);
    this.touch(t);
    return structuredClone(t);
  }
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** A tiny subset of Todoist's date language, enough for the demo. */
function parseDue(input: string, date?: string) {
  const s = input.toLowerCase().trim();
  if (date) return due(date, input, /every/.test(s));
  if (!s) return null;
  let day = 0;
  if (/tomorrow|tmr/.test(s)) day = 1;
  else if (/next week/.test(s)) day = 7;
  else {
    const i = DAYS.findIndex((x) => s.includes(x));
    if (i >= 0) day = ((i - now.getDay() + 7) % 7) || 7;
    else if (!/today/.test(s)) {
      const parsed = new Date(input);
      if (!Number.isNaN(parsed.getTime())) return due(dayKey(parsed), input);
    }
  }
  const t = s.match(/(\d{1,2})(?::(\d{2}))?\s?(am|pm)/);
  let time: string | undefined;
  if (t) {
    let h = Number(t[1]) % 12;
    if (t[3] === "pm") h += 12;
    time = `${String(h).padStart(2, "0")}:${t[2] ?? "00"}`;
  }
  return due(d(day, time), input, /every/.test(s));
}
