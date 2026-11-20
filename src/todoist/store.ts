import { uuid, TodoistError } from "./api";
import { emptyData, mergeSync, remapIds, type Data } from "./merge";
import type { Command, Priority, SyncResponse, Task, Transport } from "./types";

const RESOURCES = ["items", "projects", "sections", "labels", "user"];
const POLL_MS = 30_000;
const DONE_LINGER_MS = 2_600;

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

export interface State extends Data {
  status: "loading" | "ready";
  syncing: boolean;
  lastSyncedAt?: number;
  error?: string;
  authFailed?: boolean;
  /** Snapshots of tasks completed a moment ago, kept on screen (struck through). */
  done: Record<string, Task>;
  toast?: Toast;
}

export interface TaskEdit {
  content?: string;
  description?: string;
  priority?: Priority;
  labels?: string[];
  /** Natural-language due string ("tomorrow 3pm", "every mon"); null clears it. */
  dueString?: string | null;
}

export interface AddContext {
  projectId?: string;
  sectionId?: string;
  dueToday?: boolean;
}

type Listener = () => void;

export class Store {
  private state: State;
  private listeners = new Set<Listener>();
  private queue: Command[] = [];
  /** Task IDs with unconfirmed edits (ref-counted), so stale reads can't clobber them. */
  private pending = new Map<string, number>();
  /** Server versions of just-completed tasks, applied once they leave the screen. */
  private deferred: Record<string, Task> = {};
  private chain: Promise<unknown> = Promise.resolve();
  private timers: number[] = [];
  private toastSeq = 0;
  private stopped = false;

  constructor(
    private transport: Transport,
    private cacheKey: string | null,
  ) {
    const cached = this.readCache();
    this.state = {
      ...(cached ?? emptyData()),
      status: cached ? "ready" : "loading",
      syncing: false,
      done: {},
    };
  }

  // ── subscription (for useSyncExternalStore) ──────────────────────────────
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private setData(data: Data) {
    this.set(data);
    this.writeCache();
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  start() {
    this.stopped = false;
    void this.sync();
    const poll = window.setInterval(() => void this.sync(), POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && void this.sync();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    this.cleanup = () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }
  private cleanup = () => {};
  stop() {
    this.stopped = true;
    this.cleanup();
    this.timers.forEach(clearTimeout);
  }

  // ── network (all calls serialized so tokens and writes never race) ────────
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  sync(full = false): Promise<void> {
    return this.exclusive(() => this.roundTrip(full));
  }

  private async roundTrip(full = false, extra: Command[] = []): Promise<void> {
    if (this.stopped) return;
    const commands = [...this.queue, ...extra];
    this.queue = [];
    this.set({ syncing: true });
    let res: SyncResponse;
    try {
      res = await this.transport.sync({
        sync_token: full ? "*" : this.state.syncToken,
        resource_types: RESOURCES,
        commands,
      });
    } catch (err) {
      this.queue = [...commands, ...this.queue]; // same UUIDs → safe to resend
      this.fail(err);
      return;
    }

    const failed = Object.entries(res.sync_status ?? {}).filter(([, s]) => s !== "ok");
    for (const c of commands) this.release(c);
    const skip = new Set(this.pending.keys());
    for (const t of res.items ?? []) {
      if (this.state.done[t.id]) {
        this.deferred[t.id] = t;
        skip.add(t.id);
      }
    }
    const data = mergeSync(remapIds(this.state, res.temp_id_mapping), res, skip);
    this.setData(data);
    this.set({ status: "ready", syncing: false, lastSyncedAt: Date.now(), error: undefined, authFailed: false });

    if (failed.length) {
      const [, status] = failed[0];
      const msg = typeof status === "object" ? status.error : "Todoist rejected a change";
      this.showToast(`Couldn't save: ${msg}`);
      // Our optimistic state may be wrong now. Start over from Todoist's truth.
      await this.roundTrip(true);
    }
  }

  private fail(err: unknown) {
    const status = err instanceof TodoistError ? err.status : 0;
    if (status === 401 || status === 403) {
      this.set({ syncing: false, authFailed: true, error: "Todoist didn't accept that token." });
      return;
    }
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    this.set({
      syncing: false,
      status: "ready",
      error: offline ? "Offline. Changes will sync when you're back." : `Sync failed: ${(err as Error)?.message ?? err}`,
    });
  }

  private hold(c: Command) {
    const id = c.args.id;
    if (typeof id === "string") this.pending.set(id, (this.pending.get(id) ?? 0) + 1);
  }
  private release(c: Command) {
    const id = c.args.id;
    if (typeof id !== "string") return;
    const n = (this.pending.get(id) ?? 1) - 1;
    if (n <= 0) this.pending.delete(id);
    else this.pending.set(id, n);
  }

  private send(commands: Command[]) {
    commands.forEach((c) => this.hold(c));
    this.queue.push(...commands);
    void this.exclusive(() => this.roundTrip());
  }

  private patchItem(id: string, patch: Partial<Task>) {
    const t = this.state.items[id];
    if (!t) return;
    this.setData({ ...this.state, items: { ...this.state.items, [id]: { ...t, ...patch } } });
  }

  private showToast(message: string, undo?: () => void) {
    const id = ++this.toastSeq;
    this.set({ toast: { id, message, undo } });
    this.later(() => this.state.toast?.id === id && this.set({ toast: undefined }), 6000);
  }
  dismissToast = () => this.set({ toast: undefined });

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  // ── writes ────────────────────────────────────────────────────────────────
  complete(id: string) {
    const task = this.state.items[id];
    if (!task || this.state.done[id]) return;
    this.set({ done: { ...this.state.done, [id]: task } });
    this.patchItem(id, { checked: true });
    this.send([{ type: "item_close", uuid: uuid(), args: { id } }]);
    this.showToast(task.due?.is_recurring ? "Done. Next one scheduled." : "Done.", () => this.undoComplete(task));
    this.later(() => {
      if (!this.state.done[id]) return; // undone in the meantime
      const { [id]: _snap, ...done } = this.state.done;
      const items = { ...this.state.items };
      const server = this.deferred[id];
      delete this.deferred[id];
      if (server && !server.checked && !server.is_deleted) items[id] = server; // recurring: next occurrence
      else if (server || items[id]?.checked) delete items[id];
      this.set({ done });
      this.setData({ ...this.state, items });
    }, DONE_LINGER_MS);
  }

  private undoComplete(snapshot: Task) {
    const id = snapshot.id;
    const { [id]: _s, ...done } = this.state.done;
    delete this.deferred[id];
    this.set({ done, toast: undefined });
    this.setData({ ...this.state, items: { ...this.state.items, [id]: { ...snapshot, checked: false } } });
    if (snapshot.due?.is_recurring) {
      // Put the recurring task back on the occurrence it was on.
      this.send([
        {
          type: "item_update",
          uuid: uuid(),
          args: { id, due: { date: snapshot.due.date, string: snapshot.due.string, lang: snapshot.due.lang ?? "en" } },
        },
      ]);
    } else {
      this.send([{ type: "item_uncomplete", uuid: uuid(), args: { id } }]);
    }
  }

  update(id: string, edit: TaskEdit) {
    const task = this.state.items[id];
    if (!task) return;
    const args: Record<string, unknown> = { id };
    const patch: Partial<Task> = {};
    if (edit.content !== undefined && edit.content !== task.content) patch.content = args.content = edit.content;
    if (edit.description !== undefined && edit.description !== task.description)
      patch.description = args.description = edit.description;
    if (edit.priority !== undefined && edit.priority !== task.priority) patch.priority = args.priority = edit.priority;
    if (edit.labels !== undefined && edit.labels.join("\0") !== task.labels.join("\0"))
      patch.labels = args.labels = edit.labels;
    if (edit.dueString !== undefined && edit.dueString !== (task.due?.string ?? null)) {
      if (edit.dueString === null || edit.dueString.trim() === "") {
        args.due = null;
        patch.due = null;
      } else {
        args.due = { string: edit.dueString };
        // Todoist parses the string; show it right away, real date arrives on sync.
        if (task.due) patch.due = { ...task.due, string: edit.dueString };
      }
    }
    if (Object.keys(args).length === 1) return;
    this.patchItem(id, patch);
    this.send([{ type: "item_update", uuid: uuid(), args }]);
  }

  setPriority(id: string, priority: Priority) {
    const task = this.state.items[id];
    if (!task || task.priority === priority) return;
    const before = task.priority;
    this.update(id, { priority });
    this.showToast(`Moved to P${5 - priority}.`, () => this.update(id, { priority: before }));
  }

  move(id: string, to: { projectId?: string; sectionId?: string | null }) {
    const task = this.state.items[id];
    if (!task) return;
    const args: Record<string, unknown> = { id };
    const patch: Partial<Task> = { parent_id: null };
    if (to.sectionId) {
      const s = this.state.sections[to.sectionId];
      args.section_id = to.sectionId;
      patch.section_id = to.sectionId;
      if (s) patch.project_id = s.project_id;
    } else if (to.projectId) {
      if (to.projectId === task.project_id && !task.section_id && !task.parent_id) return;
      args.project_id = to.projectId;
      patch.project_id = to.projectId;
      patch.section_id = null;
    } else return;
    this.patchItem(id, patch);
    this.send([{ type: "item_move", uuid: uuid(), args }]);
  }

  remove(id: string) {
    const task = this.state.items[id];
    if (!task) return;
    const items = { ...this.state.items };
    for (const t of Object.values(items)) if (t.id === id || t.parent_id === id) delete items[t.id];
    this.setData({ ...this.state, items });
    this.send([{ type: "item_delete", uuid: uuid(), args: { id } }]);
    this.showToast("Deleted.");
  }

  /** Add via Todoist Quick Add, then nudge it into the view it was typed in. */
  add(text: string, ctx: AddContext = {}): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    const tempId = `tmp-${uuid()}`;
    const inbox = Object.values(this.state.projects).find((p) => p.inbox_project);
    const section = ctx.sectionId ? this.state.sections[ctx.sectionId] : undefined;
    const placeholder: Task = {
      id: tempId,
      project_id: section?.project_id ?? ctx.projectId ?? inbox?.id ?? "",
      section_id: ctx.sectionId ?? null,
      parent_id: null,
      content: trimmed,
      description: "",
      priority: 1,
      due: ctx.dueToday ? { date: new Date().toISOString().slice(0, 10), string: "today", timezone: null, is_recurring: false } : null,
      labels: [],
      child_order: Number.MAX_SAFE_INTEGER,
      checked: false,
      is_deleted: false,
    };
    this.setData({ ...this.state, items: { ...this.state.items, [tempId]: placeholder } });
    this.pending.set(tempId, 1);

    return this.exclusive(async () => {
      let task: Task;
      try {
        task = await this.transport.quickAdd(trimmed);
      } catch (err) {
        const { [tempId]: _p, ...items } = this.state.items;
        this.pending.delete(tempId);
        this.setData({ ...this.state, items });
        this.fail(err);
        this.showToast("Couldn't add that task.");
        return;
      }
      const { [tempId]: _p, ...items } = this.state.items;
      this.pending.delete(tempId);
      this.setData({ ...this.state, items: task?.id ? { ...items, [task.id]: { ...placeholder, ...task } } : items });

      const fix: Command[] = [];
      const typedProject = /(^|\s)#\S/.test(trimmed);
      const typedSection = /(^|\s)\/\S/.test(trimmed);
      if (task?.id && ctx.sectionId && !typedProject && !typedSection && task.section_id !== ctx.sectionId)
        fix.push({ type: "item_move", uuid: uuid(), args: { id: task.id, section_id: ctx.sectionId } });
      else if (task?.id && ctx.projectId && !typedProject && task.project_id !== ctx.projectId)
        fix.push({ type: "item_move", uuid: uuid(), args: { id: task.id, project_id: ctx.projectId } });
      if (task?.id && ctx.dueToday && !task.due)
        fix.push({ type: "item_update", uuid: uuid(), args: { id: task.id, due: { string: "today" } } });
      await this.roundTrip(false, fix);
    });
  }

  // ── cache ─────────────────────────────────────────────────────────────────
  private readCache(): Data | null {
    if (!this.cacheKey) return null;
    try {
      const raw = localStorage.getItem(this.cacheKey);
      return raw ? (JSON.parse(raw) as Data) : null;
    } catch {
      return null;
    }
  }
  private cacheTimer = 0;
  private writeCache() {
    if (!this.cacheKey) return;
    clearTimeout(this.cacheTimer);
    this.cacheTimer = window.setTimeout(() => {
      try {
        const { syncToken, items, projects, sections, labels, user } = this.state;
        const real = Object.fromEntries(Object.entries(items).filter(([id, t]) => !id.startsWith("tmp-") && !t.checked));
        localStorage.setItem(this.cacheKey!, JSON.stringify({ syncToken, items: real, projects, sections, labels, user }));
      } catch {
        /* storage full or blocked: the cache is only a speed-up */
      }
    }, 400);
  }
  clearCache() {
    if (!this.cacheKey) return;
    try {
      localStorage.removeItem(this.cacheKey);
    } catch {
      /* ignore */
    }
  }
}
