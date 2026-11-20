import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { Inline } from "../lib/inline";
import { count } from "../lib/words";
import { priorityGroups, type PriorityScope } from "../todoist/select";
import type { State } from "../todoist/store";
import type { Priority, Task } from "../todoist/types";
import { TaskRow, type RowContext } from "./TaskRow";

const CAP = 30;
const LEVELS: { p: Priority; title: string }[] = [
  { p: 4, title: "P1 · Urgent" },
  { p: 3, title: "P2 · High" },
  { p: 2, title: "P3 · Medium" },
  { p: 1, title: "P4 · Someday" },
];

// Mouse drags after 6px of movement; touch drags after a short press, so swipes still scroll.
// Prefer the group under the pointer; fall back to overlap (keyboard/touch edge cases).
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function PriorityView({ state, ctx, scope }: { state: State; ctx: RowContext; scope: PriorityScope }) {
  const groups = priorityGroups(state, scope);
  const [active, setActive] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const onStart = (e: DragStartEvent) => {
    const task = state.items[String(e.active.id)];
    if (task) {
      setActive(task);
      ctx.setEditing(null);
      ctx.setCursor(task.id);
    }
  };
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const to = e.over?.data.current?.priority as Priority | undefined;
    if (to) ctx.store.setPriority(String(e.active.id), to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      {LEVELS.map(({ p, title }) => {
        const tasks = groups[p];
        const open = tasks.filter((t) => !t.checked).length;
        const shown = expanded[p] ? tasks : tasks.slice(0, CAP);
        return (
          <DropGroup key={p} priority={p} title={title} countLabel={open ? String(open) : ""} dragging={!!active} from={active?.priority}>
            {tasks.length === 0 ? (
              <p className="empty drop-empty">{active ? "Drop here" : "Nothing here."}</p>
            ) : (
              <ul className="tasks">
                {shown.map((t) => (
                  <DraggableRow key={t.id} task={t} ctx={ctx} />
                ))}
              </ul>
            )}
            {tasks.length > shown.length && (
              <button type="button" className="chrome-button quiet more" onClick={() => setExpanded({ ...expanded, [p]: true })}>
                Show {count(tasks.length - shown.length, "more", "more")}
              </button>
            )}
          </DropGroup>
        );
      })}
      <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>
        {active ? (
          <div className={`drag-ghost p${5 - active.priority}`}>
            <span className="check" aria-hidden="true" />
            <span>
              <Inline text={active.content} />
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DropGroup(props: {
  priority: Priority;
  title: string;
  countLabel: string;
  dragging: boolean;
  from?: Priority;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `p${props.priority}`, data: { priority: props.priority } });
  const cls = ["drop", props.dragging && "drop-armed", isOver && props.from !== props.priority && "drop-over"]
    .filter(Boolean)
    .join(" ");
  return (
    <section ref={setNodeRef} className={cls} aria-label={props.title}>
      <h2>
        {props.title}
        {props.countLabel && <span className="h2-count">{props.countLabel}</span>}
      </h2>
      {props.children}
    </section>
  );
}

function DraggableRow({ task, ctx }: { task: Task; ctx: RowContext }) {
  const disabled = task.checked || task.id.startsWith("tmp-") || ctx.editing === task.id;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.id, disabled });
  return (
    <TaskRow
      task={task}
      ctx={ctx}
      dragging={isDragging}
      dragProps={{ ref: setNodeRef, ...listeners, ...attributes, role: undefined, tabIndex: undefined }}
    />
  );
}
