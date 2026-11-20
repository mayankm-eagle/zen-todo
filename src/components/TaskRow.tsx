import { useDraggable } from "@dnd-kit/core";
import type { HTMLAttributes, ReactNode } from "react";
import { dueLabel, isOverdue } from "../lib/dates";
import { Inline } from "../lib/inline";
import { isShallow, SHALLOW, type Node } from "../todoist/select";
import type { Store } from "../todoist/store";
import { displayPriority, type Project, type Task } from "../todoist/types";
import { TaskEditor } from "./TaskEditor";

export interface RowContext {
  store: Store;
  projects: Record<string, Project>;
  cursor: string | null;
  editing: string | null;
  setCursor: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  /** Hide the project name in the meta line (inside a project view). */
  hideProject?: boolean;
  /** Hide the date in the meta line when the group heading already says it. */
  hideDate?: "today" | "all";
  /** Hide the P1–P3 tag when the group heading already says it. */
  hidePriority?: boolean;
  /** Show a SHALLOW tag on shallow tasks (where they share a list with deep ones). */
  markShallow?: boolean;
  /** Rows can be dragged (needs a surrounding DndContext). */
  draggable?: boolean;
}

export function TaskList({ nodes, ctx, depth = 0 }: { nodes: Node[]; ctx: RowContext; depth?: number }) {
  if (!nodes.length) return null;
  return (
    <ul className={depth ? "tasks sub" : "tasks"}>
      {nodes.map((n) => {
        const kids = <TaskList nodes={n.children} ctx={ctx} depth={depth + 1} />;
        return ctx.draggable ? (
          <DraggableRow key={n.task.id} task={n.task} ctx={ctx}>
            {kids}
          </DraggableRow>
        ) : (
          <TaskRow key={n.task.id} task={n.task} ctx={ctx}>
            {kids}
          </TaskRow>
        );
      })}
    </ul>
  );
}

export function DraggableRow({ task, ctx, children }: { task: Task; ctx: RowContext; children?: ReactNode }) {
  const disabled = task.checked || task.id.startsWith("tmp-") || ctx.editing === task.id;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.id, disabled, data: { task } });
  return (
    <TaskRow
      task={task}
      ctx={ctx}
      dragging={isDragging}
      dragProps={{ ref: setNodeRef, ...listeners, ...attributes, role: undefined, tabIndex: undefined }}
    >
      {children}
    </TaskRow>
  );
}

/** The floating copy of a task that follows the pointer while dragging. */
export function DragGhost({ task }: { task: Task }) {
  return (
    <div className={`drag-ghost p${displayPriority(task.priority)}`}>
      <span className="check" aria-hidden="true" />
      <span>
        <Inline text={task.content} />
      </span>
    </div>
  );
}

interface RowProps {
  task: Task;
  ctx: RowContext;
  children?: ReactNode;
  /** Drag-and-drop wiring (priority view). */
  dragProps?: HTMLAttributes<HTMLDivElement> & { ref?: (el: HTMLElement | null) => void };
  dragging?: boolean;
}

export function TaskRow({ task, ctx, children, dragProps, dragging }: RowProps) {
  const done = task.checked;
  const pending = task.id.startsWith("tmp-");
  const editing = ctx.editing === task.id;
  const p = displayPriority(task.priority);
  const { ref, ...dragRest } = dragProps ?? {};

  return (
    <li
      className={[
        "task",
        `p${p}`,
        done && "done",
        pending && "pending",
        ctx.cursor === task.id && "is-cursor",
        editing && "editing",
        dragging && "dragging",
      ]
        .filter(Boolean)
        .join(" ")}
      data-task-id={task.id}
    >
      <div className="task-line" ref={ref as any} {...(editing ? {} : dragRest)}>
        <button
          type="button"
          className="check"
          aria-label={done ? "Completed" : `Complete “${task.content}”`}
          disabled={done || pending}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            ctx.store.complete(task.id);
          }}
        >
          <svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">
            <path d="M2 5h1v1H2zM3 6h1v1H3zM4 7h1v1H4zM5 6h1v1H5zM6 5h1v1H6zM7 4h1v1H7zM8 3h1v1H8z" />
          </svg>
        </button>
        <div
          className="task-body"
          onClick={() => {
            if (done || pending) return;
            ctx.setCursor(task.id);
            ctx.setEditing(editing ? null : task.id);
          }}
        >
          <span className="task-content">
            <Inline text={task.content} />
          </span>
          {!editing && <Meta task={task} ctx={ctx} />}
        </div>
      </div>
      {editing && (
        <TaskEditor
          task={task}
          store={ctx.store}
          projects={ctx.projects}
          onClose={() => ctx.setEditing(null)}
        />
      )}
      {children}
    </li>
  );
}

function Meta({ task, ctx }: { task: Task; ctx: RowContext }) {
  const parts: ReactNode[] = [];
  const p = displayPriority(task.priority);
  if (task.due) {
    const label = dueLabel(task.due);
    const hide = ctx.hideDate === "all" || (ctx.hideDate === "today" && label === "Today");
    const late = isOverdue(task.due);
    if (!hide || task.due.is_recurring) {
      const text = hide ? "" : label;
      parts.push(
        <span key="due" className={late && !task.checked ? "late" : undefined}>
          {text}
          {task.due.is_recurring && <span className="repeat" title={task.due.string}>{text ? " ↻" : "↻"}</span>}
        </span>,
      );
    }
  }
  if (task.deadline?.date) parts.push(<span key="dl">Deadline {dueLabel({ date: task.deadline.date, string: "", timezone: null, is_recurring: false })}</span>);
  if (!ctx.hideProject) {
    const proj = ctx.projects[task.project_id];
    if (proj && !proj.inbox_project) parts.push(<span key="proj">{proj.name}</span>);
  }
  for (const l of task.labels) if (l.toLowerCase() !== SHALLOW) parts.push(<span key={`l-${l}`}>@{l}</span>);
  if (ctx.markShallow && isShallow(task)) parts.push(<span key="shallow" className="prio">Shallow</span>);
  if (task.description) parts.push(<span key="desc" className="has-notes" title="Has notes">≡</span>);
  if (p < 4 && !ctx.hidePriority) parts.unshift(<span key="p" className="prio">P{p}</span>);
  if (!parts.length) return null;
  return (
    <span className="task-meta">
      {parts.map((x, i) => (
        <span key={i} className="meta-part">
          {x}
        </span>
      ))}
    </span>
  );
}
