import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CACHE_KEY } from "../lib/storage";
import { HttpTransport } from "../todoist/api";
import { DemoTransport } from "../todoist/demo";
import { isShallow, visibleTasks } from "../todoist/select";
import { Store, type State } from "../todoist/store";
import { apiPriority } from "../todoist/types";
import { AddTask } from "./AddTask";
import { Board } from "./Board";
import { Sky } from "./Sky";
import type { RowContext } from "./TaskRow";

export function App({ demo, onSignOut }: { demo: boolean; onSignOut: (why?: string) => void }) {
  const store = useMemo(() => new Store(demo ? new DemoTransport() : new HttpTransport(), demo ? null : CACHE_KEY), [demo]);
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.getState);

  const [cursor, setCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.authFailed) onSignOut("Signed out. Enter the password again.");
  }, [state.authFailed, onSignOut]);

  useKeyboard({ store, state, cursor, setCursor, editing, setEditing, addRef, setShowKeys });

  const ctx: RowContext = { store, projects: state.projects, cursor, editing, setCursor, setEditing };
  const deepOpen = visibleTasks(state).filter((t) => !t.checked && !isShallow(t)).length;
  const ready = state.status === "ready";

  return (
    <>
      {ready && deepOpen === 0 && <Sky />}
      <div className="topbar">
        {ready ? (
          <AddTask ref={addRef} store={store} placeholder="Add a task" />
        ) : (
          <p className="loading">Reading your Todoist…</p>
        )}
        <nav className="bar-links" aria-label="App">
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
              void onSignOut();
            }}
          >
            {demo ? "Exit demo" : "Sign out"}
          </button>
        </nav>
      </div>
      <main>{ready && <Board state={state} ctx={ctx} />}</main>
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

function Keys({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["j / k", "Move"],
    ["x", "Complete"],
    ["e or ↵", "Edit"],
    ["1 – 4", "Move to P1–P4"],
    ["s", "Toggle shallow / deep"],
    ["n", "Add a task"],
    ["r", "Sync now"],
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
      const { store, state, cursor, setCursor, editing, setEditing, addRef, setShowKeys } = ref.current;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
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
            store.place(cursor, { priority: apiPriority(Number(e.key)), shallow: false });
          }
          break;
        case "s":
          if (cursor && state.items[cursor]) {
            e.preventDefault();
            store.place(cursor, { shallow: !isShallow(state.items[cursor]) });
          }
          break;
        case "n":
        case "a":
          if (addRef.current) {
            e.preventDefault();
            addRef.current.focus();
          }
          break;
        case "r":
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
