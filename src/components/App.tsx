import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dayHeading, longDate } from "../lib/dates";
import { go, href, useRoute, type Route } from "../lib/route";
import { storage, CACHE_KEY } from "../lib/storage";
import { capitalize, count } from "../lib/words";
import { HttpTransport } from "../todoist/api";
import { DemoTransport } from "../todoist/demo";
import {
  flat,
  inboxProject,
  projectRows,
  projectTasks,
  todayGroups,
  upcomingDays,
  type PriorityScope,
} from "../todoist/select";
import { Store, type State } from "../todoist/store";
import { apiPriority } from "../todoist/types";
import { AddTask } from "./AddTask";
import { PriorityView } from "./PriorityView";
import { Sky } from "./Sky";
import { TaskList, type RowContext } from "./TaskRow";

const NAV: { route: Route; label: string; key: string }[] = [
  { route: { name: "today" }, label: "Today", key: "t" },
  { route: { name: "upcoming" }, label: "Upcoming", key: "u" },
  { route: { name: "inbox" }, label: "Inbox", key: "i" },
  { route: { name: "priority" }, label: "Priority", key: "p" },
  { route: { name: "projects" }, label: "Projects", key: "o" },
];

export function App({ token, onSignOut }: { token: string; onSignOut: (why?: string) => void }) {
  const demo = token === "demo";
  const store = useMemo(
    () => new Store(demo ? new DemoTransport() : new HttpTransport(token), demo ? null : CACHE_KEY),
    [token, demo],
  );
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const route = useRoute();

  const [cursor, setCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [scope, setScope] = useState<PriorityScope>(() => (storage.get("zen.scope") as PriorityScope) || "all");
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.authFailed) onSignOut("Todoist didn't accept that token. Paste a fresh one.");
  }, [state.authFailed, onSignOut]);

  useEffect(() => {
    document.documentElement.dataset.view = route.name; // lets CSS widen the page for the quadrant
  }, [route.name]);

  useEffect(() => {
    setEditing(null);
    setCursor(null);
    window.scrollTo(0, 0);
  }, [route.name, route.name === "project" ? route.id : ""]);

  useKeyboard({ store, state, cursor, setCursor, editing, setEditing, addRef, setShowKeys });

  const ctx: RowContext = { store, projects: state.projects, cursor, editing, setCursor, setEditing };

  const view = renderView(route, state, ctx, addRef, scope, (s) => {
    setScope(s);
    storage.set("zen.scope", s);
  });

  return (
    <>
      {view.sky && <Sky />}
      <nav className="nav" aria-label="Views">
        {NAV.map((n) => {
          const on = n.route.name === route.name || (n.route.name === "projects" && route.name === "project");
          return (
            <a key={n.label} href={href(n.route)} aria-current={on ? "page" : undefined}>
              {n.label}
            </a>
          );
        })}
      </nav>
      <main>
        <header>
          <h1>{view.title}</h1>
        </header>
        <p className="lead">{state.status === "loading" ? "Reading your Todoist…" : view.lead}</p>
        {state.status === "ready" && view.body}
      </main>
      <footer>
        <span className={state.error ? "status error" : "status"} title={state.error}>
          {state.error ? state.error : state.syncing ? "Syncing…" : demo ? "Sample data" : state.lastSyncedAt ? "Synced" : "Cached"}
        </span>
        <button type="button" className="footer-link" onClick={() => void store.sync()}>
          Sync
        </button>
        <a href={demo ? "https://todoist.com" : "https://app.todoist.com/app/today"} target="_blank" rel="noopener noreferrer">
          Todoist
        </a>
        <button type="button" className="footer-link" onClick={() => setShowKeys((v) => !v)} aria-expanded={showKeys}>
          Keys
        </button>
        <button
          type="button"
          className="footer-link"
          onClick={() => {
            store.clearCache();
            onSignOut();
          }}
        >
          {demo ? "Exit demo" : "Sign out"}
        </button>
      </footer>
      {showKeys && <Keys onClose={() => setShowKeys(false)} />}
      {state.toast && (
        <div className="toast" role="status" key={state.toast.id}>
          <span>{state.toast.message}</span>
          {state.toast.undo && (
            <button type="button" className="footer-link" onClick={state.toast.undo}>
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );
}

interface View {
  title: string;
  lead: string;
  body: React.ReactNode;
  sky?: boolean;
}

function renderView(
  route: Route,
  state: State,
  ctx: RowContext,
  addRef: React.RefObject<HTMLInputElement | null>,
  scope: PriorityScope,
  setScope: (s: PriorityScope) => void,
): View {
  switch (route.name) {
    case "today": {
      const { overdue, today } = todayGroups(state);
      const openToday = today.filter((t) => !t.checked).length;
      const openLate = overdue.filter((t) => !t.checked).length;
      const clear = openToday + openLate === 0;
      const lead = clear
        ? `${longDate(new Date())}. Nothing left today.`
        : `${longDate(new Date())}. ${capitalize(count(openToday, "task"))} today${openLate ? `, ${count(openLate, "overdue", "overdue")}` : ""}.`;
      return {
        title: "Today",
        lead,
        sky: clear,
        body: (
          <>
            <AddTask ref={addRef} store={ctx.store} ctx={{ dueToday: true }} placeholder="Add a task for today" />
            {overdue.length > 0 && (
              <section>
                <h2>Overdue</h2>
                <TaskList nodes={flat(overdue)} ctx={ctx} />
              </section>
            )}
            {today.length > 0 && (
              <section>
                {overdue.length > 0 && <h2>Today</h2>}
                <TaskList nodes={flat(today)} ctx={{ ...ctx, hideDate: "today" }} />
              </section>
            )}
          </>
        ),
      };
    }
    case "upcoming": {
      const days = upcomingDays(state, 14);
      const total = days.reduce((n, d) => n + d.tasks.filter((t) => !t.checked).length, 0);
      return {
        title: "Upcoming",
        lead: total ? `${capitalize(count(total, "task"))} over the next two weeks.` : "A clear two weeks ahead.",
        body: (
          <>
            <AddTask ref={addRef} store={ctx.store} placeholder="Add a task — “fri 2pm” sets the day" />
            {days
              .filter((d) => d.tasks.length)
              .map((d) => (
                <section key={d.key}>
                  <h2>{dayHeading(d.key)}</h2>
                  <TaskList nodes={flat(d.tasks)} ctx={{ ...ctx, hideDate: "all" }} />
                </section>
              ))}
          </>
        ),
      };
    }
    case "inbox": {
      const inbox = inboxProject(state);
      const data = inbox ? projectTasks(state, inbox.id) : null;
      return {
        title: "Inbox",
        lead: data?.total ? `${capitalize(count(data.total, "task"))} waiting to be sorted.` : "Inbox zero.",
        body: (
          <>
            <AddTask ref={addRef} store={ctx.store} ctx={{ projectId: inbox?.id }} />
            {data && <ProjectBody data={data} ctx={{ ...ctx, hideProject: true }} />}
          </>
        ),
      };
    }
    case "priority": {
      return {
        title: "Priority",
        lead: "Drag a task to another priority. It saves to Todoist as you drop it.",
        body: (
          <>
            <div className="scope" role="radiogroup" aria-label="Which tasks">
              {(["today", "week", "all"] as PriorityScope[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={scope === s} className={scope === s ? "on" : undefined} onClick={() => setScope(s)}>
                  {s === "today" ? "Due today" : s === "week" ? "Next 7 days" : "Everything"}
                </button>
              ))}
            </div>
            <PriorityView state={state} ctx={{ ...ctx, hidePriority: true }} scope={scope} />
          </>
        ),
      };
    }
    case "projects": {
      const rows = projectRows(state);
      return {
        title: "Projects",
        lead: `${capitalize(count(rows.length, "project"))}.`,
        body: (
          <section>
            <ul className="projects">
              {rows.map((r) => (
                <li key={r.project.id} style={{ paddingLeft: `${r.depth * 1.25}rem` }}>
                  <a href={href({ name: "project", id: r.project.id })}>{r.project.name}</a>
                  {r.open > 0 && <span className="note">: {count(r.open, "task")}</span>}
                </li>
              ))}
            </ul>
          </section>
        ),
      };
    }
    case "project": {
      const project = state.projects[route.id];
      if (!project) return { title: "Project", lead: "That project isn't in your Todoist anymore.", body: <p><a href={href({ name: "projects" })}>All projects</a></p> };
      const data = projectTasks(state, project.id);
      const parent = project.parent_id ? state.projects[project.parent_id] : undefined;
      return {
        title: project.name,
        lead: data.total ? `${capitalize(count(data.total, "open task"))}.` : "Nothing open here.",
        body: (
          <>
            {parent && (
              <p className="crumb">
                <a href={href({ name: "project", id: parent.id })}>{parent.name}</a>
              </p>
            )}
            <AddTask ref={addRef} store={ctx.store} ctx={{ projectId: project.id }} placeholder={`Add to ${project.name}`} />
            <ProjectBody data={data} ctx={{ ...ctx, hideProject: true }} />
          </>
        ),
      };
    }
  }
}

function ProjectBody({ data, ctx }: { data: ReturnType<typeof projectTasks>; ctx: RowContext }) {
  return (
    <>
      {data.loose.length > 0 && (
        <section>
          <TaskList nodes={data.loose} ctx={ctx} />
        </section>
      )}
      {data.sections.map(({ section, nodes }) => (
        <section key={section.id}>
          <h2>{section.name}</h2>
          {nodes.length ? <TaskList nodes={nodes} ctx={ctx} /> : <p className="empty">Empty.</p>}
          <AddTask store={ctx.store} ctx={{ sectionId: section.id }} placeholder={`Add to ${section.name}`} />
        </section>
      ))}
    </>
  );
}

function Keys({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["j / k", "Move"],
    ["x", "Complete"],
    ["e or ↵", "Edit"],
    ["1 – 4", "Set priority"],
    ["n", "Add a task"],
    ["t u i p o", "Today, Upcoming, Inbox, Priority, Projects"],
    ["s", "Sync now"],
    ["esc", "Close"],
  ];
  return (
    <aside className="keys" aria-label="Keyboard shortcuts">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="footer-link" onClick={onClose}>
        Close
      </button>
    </aside>
  );
}

// ── keyboard ─────────────────────────────────────────────────────────────────

function useKeyboard(o: {
  store: Store;
  state: State;
  cursor: string | null;
  setCursor: (id: string | null) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
  addRef: React.RefObject<HTMLInputElement | null>;
  setShowKeys: (f: (v: boolean) => boolean) => void;
}) {
  const ref = useRef(o);
  ref.current = o;

  const rows = () => Array.from(document.querySelectorAll<HTMLElement>("li.task[data-task-id]:not(.done)"));
  const moveCursor = useCallback((delta: number) => {
    const list = rows();
    if (!list.length) return;
    const ids = list.map((el) => el.dataset.taskId!);
    const i = ref.current.cursor ? ids.indexOf(ref.current.cursor) : -1;
    const next = i === -1 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + delta));
    ref.current.setCursor(ids[next]);
    list[next].scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { store, cursor, setCursor, editing, setEditing, addRef, setShowKeys } = ref.current;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;

      const nav = NAV.find((n) => n.key === e.key);
      if (nav) {
        e.preventDefault();
        go(nav.route);
        return;
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveCursor(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveCursor(-1);
          break;
        case "x":
        case " ":
          if (cursor) {
            e.preventDefault();
            const list = rows().map((el) => el.dataset.taskId!);
            const i = list.indexOf(cursor);
            store.complete(cursor);
            setCursor(list[i + 1] ?? list[i - 1] ?? null);
          }
          break;
        case "e":
        case "Enter":
          if (cursor) {
            e.preventDefault();
            setEditing(editing === cursor ? null : cursor);
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          if (cursor) {
            e.preventDefault();
            store.setPriority(cursor, apiPriority(Number(e.key)));
          }
          break;
        case "n":
        case "a":
          if (addRef.current) {
            e.preventDefault();
            addRef.current.focus();
          }
          break;
        case "s":
          e.preventDefault();
          void store.sync();
          break;
        case "?":
          e.preventDefault();
          setShowKeys((v) => !v);
          break;
        case "Escape":
          if (editing) setEditing(null);
          else if (cursor) setCursor(null);
          else setShowKeys(() => false);
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moveCursor]);
}

