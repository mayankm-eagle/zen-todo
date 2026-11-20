import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { estimate, flat, isShallow, shallowTasks, priorityGroups } from "../todoist/select";
import type { State } from "../todoist/store";
import type { Priority, Task } from "../todoist/types";
import { storage } from "../lib/storage";
import { AddTask } from "./AddTask";
import { History } from "./History";
import { DragGhost, TaskList, type RowContext } from "./TaskRow";

// The urgent / important matrix, encoded as Todoist priority.
// On desktop it reads: important on top, urgent on the left.
const QUADRANTS: { p: Priority; title: string; hint: string }[] = [
  { p: 4, title: "P1 · Do", hint: "Urgent and important" },
  { p: 3, title: "P2 · Schedule", hint: "Important, not urgent" },
  { p: 2, title: "P3 · Delegate", hint: "Urgent, not important" },
  { p: 1, title: "P4 · Triage", hint: "Not sorted yet" },
];

type Drop = { priority: Priority } | { shallow: true };

// Mouse drags after 6px; touch after a short press so swipes still scroll.
// Prefer the target under the pointer, then fall back to overlap.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function formatMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function shallowSummary(state: State) {
  const open = shallowTasks(state).filter((t) => !t.checked);
  return { count: open.length, minutes: open.reduce((n, t) => n + estimate(t), 0) };
}

/**
 * The whole app: deep work in a 2×2 priority matrix, shallow work in a column
 * on the right. Every drop writes to Todoist.
 */
export function Board({ state, ctx }: { state: State; ctx: RowContext }) {
  const [active, setActive] = useState<Task | null>(null);
  const [tab, setTabState] = useState<"shallow" | "done">(() => (storage.get("zen.tab") === "done" ? "done" : "shallow"));
  const setTab = (t: "shallow" | "done") => {
    setTabState(t);
    storage.set("zen.tab", t);
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const rowCtx: RowContext = { ...ctx, draggable: true };
  const deep = priorityGroups({ items: only(state.items, false), done: only(state.done, false) });
  const shallow = shallowTasks(state);
  const { count, minutes } = shallowSummary(state);

  const onStart = (e: DragStartEvent) => {
    const task = e.active.data.current?.task as Task | undefined;
    if (!task) return;
    setActive(task);
    ctx.setEditing(null);
    ctx.setCursor(task.id);
  };
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const to = e.over?.data.current as Drop | undefined;
    if (!to) return;
    const id = String(e.active.id);
    if ("shallow" in to) ctx.store.place(id, { shallow: true });
    else ctx.store.place(id, { priority: to.priority, shallow: false });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="board">
        <div className="quadrants">
          {QUADRANTS.map(({ p, title, hint }) => {
            const tasks = deep[p];
            const open = tasks.filter((t) => !t.checked).length;
            return (
              <Target key={p} id={`p${p}`} data={{ priority: p }} active={active} accepts={(t) => isShallow(t) || t.priority !== p} className="quadrant" label={title}>
                <h2 title={hint}>
                  {title}
                  {open > 0 && <span className="h2-count">{open}</span>}
                  <span className="h2-hint">{hint}</span>
                </h2>
                {tasks.length ? <TaskList nodes={flat(tasks)} ctx={{ ...rowCtx, hidePriority: true }} /> : <p className="empty">{active ? "Drop here" : "Nothing here."}</p>}
              </Target>
            );
          })}
        </div>
        <Target
          id="shallow"
          data={{ shallow: true }}
          active={active}
          accepts={(t) => !isShallow(t)}
          disabled={tab !== "shallow"}
          className="rail"
          label="Shallow work and done"
        >
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "shallow"} className={tab === "shallow" ? "on" : undefined} onClick={() => setTab("shallow")}>
              Shallow
              {count > 0 && <span className="h2-count">{count}</span>}
            </button>
            <button type="button" role="tab" aria-selected={tab === "done"} className={tab === "done" ? "on" : undefined} onClick={() => setTab("done")}>
              Done
            </button>
          </div>
          {tab === "shallow" ? (
            <>
              <p className="rail-note">
                {count ? `~${formatMinutes(minutes)} in all. Batch these into one block.` : "Nothing small is waiting. Drag a task here to mark it shallow."}
              </p>
              <TaskList nodes={flat(shallow)} ctx={rowCtx} />
              <AddTask store={ctx.store} ctx={{ shallow: true }} placeholder="Add shallow work" />
            </>
          ) : (
            <History state={state} store={ctx.store} />
          )}
        </Target>
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>{active ? <DragGhost task={active} /> : null}</DragOverlay>
    </DndContext>
  );
}

function only(rec: Record<string, Task>, shallow: boolean) {
  return Object.fromEntries(Object.entries(rec).filter(([, t]) => isShallow(t) === shallow));
}

function Target(props: {
  id: string;
  data: Drop;
  active: Task | null;
  accepts: (t: Task) => boolean;
  disabled?: boolean;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id, data: props.data, disabled: props.disabled });
  const live = !props.disabled && !!props.active && props.accepts(props.active);
  const cls = [props.className, live && "target-armed", live && isOver && "target-over"].filter(Boolean).join(" ");
  return (
    <section ref={setNodeRef} className={cls} aria-label={props.label}>
      {props.children}
    </section>
  );
}
