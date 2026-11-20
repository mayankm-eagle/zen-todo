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
import { count } from "../lib/words";
import { estimate, isShallow, shallowTasks } from "../todoist/select";
import type { State } from "../todoist/store";
import type { Task } from "../todoist/types";
import { AddTask } from "./AddTask";
import { DragGhost, TaskList, type RowContext } from "./TaskRow";
import { flat } from "../todoist/select";

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

/**
 * Deep work in the main column, shallow work in a pile beside it (below it on
 * phones). Dragging a task across writes the `shallow` label to Todoist.
 */
export function WorkLayout({ state, ctx, children }: { state: State; ctx: RowContext; children: ReactNode }) {
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const dragCtx = { ...ctx, draggable: true };

  const onStart = (e: DragStartEvent) => {
    const task = e.active.data.current?.task as Task | undefined;
    if (!task) return;
    setActive(task);
    ctx.setEditing(null);
    ctx.setCursor(task.id);
  };
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const zone = e.over?.data.current?.zone as "deep" | "shallow" | undefined;
    if (zone) ctx.store.setShallow(String(e.active.id), zone === "shallow");
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="work">
        <Zone zone="deep" className="work-main" from={active}>
          {children}
        </Zone>
        <ShallowPile state={state} ctx={dragCtx} dragging={active} />
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>{active ? <DragGhost task={active} /> : null}</DragOverlay>
    </DndContext>
  );
}

function Zone({ zone, className, from, children }: { zone: "deep" | "shallow"; className: string; from: Task | null; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone-${zone}`, data: { zone } });
  const crossing = !!from && isShallow(from) !== (zone === "shallow");
  const cls = [className, "zone", crossing && "zone-armed", crossing && isOver && "zone-over"].filter(Boolean).join(" ");
  return (
    <div ref={setNodeRef} className={cls}>
      {children}
    </div>
  );
}

function ShallowPile({ state, ctx, dragging }: { state: State; ctx: RowContext; dragging: Task | null }) {
  const tasks = shallowTasks(state);
  const open = tasks.filter((t) => !t.checked);
  const minutes = open.reduce((n, t) => n + estimate(t), 0);
  return (
    <Zone zone="shallow" className="rail" from={dragging}>
      <aside aria-label="Shallow work">
        <h2>
          Shallow
          {open.length > 0 && (
            <span className="h2-count">
              {open.length} · ~{formatMinutes(minutes)}
            </span>
          )}
        </h2>
        <p className="rail-note">
          {open.length
            ? `${capitalizeFirst(count(open.length, "small thing"))} to batch into one block.`
            : "Nothing small is waiting. Drag a task here to mark it shallow."}
        </p>
        <TaskList nodes={flat(tasks)} ctx={ctx} />
        <AddTask store={ctx.store} ctx={{ shallow: true }} placeholder="Add shallow work" />
      </aside>
    </Zone>
  );
}

const capitalizeFirst = (s: string) => s[0].toUpperCase() + s.slice(1);
