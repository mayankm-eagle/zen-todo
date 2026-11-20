import { useEffect, useRef, useState } from "react";
import type { Store } from "../todoist/store";
import { apiPriority, displayPriority, type Project, type Task } from "../todoist/types";

interface Props {
  task: Task;
  store: Store;
  projects: Record<string, Project>;
  onClose: () => void;
}

export function TaskEditor({ task, store, projects, onClose }: Props) {
  const [content, setContent] = useState(task.content);
  const [description, setDescription] = useState(task.description);
  const [due, setDue] = useState(task.due?.string ?? "");
  const [labels, setLabels] = useState(task.labels.join(", "));
  const [priority, setPriority] = useState(displayPriority(task.priority));
  const [projectId, setProjectId] = useState(task.project_id);
  const first = useRef<HTMLInputElement>(null);
  const notes = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);

  useEffect(() => {
    const el = notes.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  const save = () => {
    if (!content.trim()) return;
    store.update(task.id, {
      content: content.trim(),
      description,
      priority: apiPriority(priority),
      dueString: due.trim() === "" ? null : due.trim(),
      labels: labels
        .split(",")
        .map((l) => l.trim().replace(/^@/, ""))
        .filter(Boolean),
    });
    if (projectId !== task.project_id) store.move(task.id, { projectId });
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !(e.target instanceof HTMLTextAreaElement))) {
      e.preventDefault();
      save();
    }
  };

  const projectList = Object.values(projects).sort(
    (a, b) => Number(!!b.inbox_project) - Number(!!a.inbox_project) || a.child_order - b.child_order,
  );

  return (
    <div className="editor" onKeyDown={onKey}>
      <input
        ref={first}
        className="editor-title"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        aria-label="Task"
      />
      <textarea
        ref={notes}
        className="editor-notes"
        rows={1}
        placeholder="Notes"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Notes"
      />
      <div className="editor-grid">
        <label className="field">
          <span className="field-label">Due</span>
          <input value={due} placeholder="tomorrow 3pm, every mon…" onChange={(e) => setDue(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">Priority</span>
          <div className="segmented" role="radiogroup" aria-label="Priority">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={priority === n}
                className={priority === n ? "on" : undefined}
                onClick={() => setPriority(n)}
              >
                P{n}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Labels</span>
          <input value={labels} placeholder="errand, deep" onChange={(e) => setLabels(e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="chrome-button" onClick={save}>
          Save
        </button>
        <button type="button" className="chrome-button quiet" onClick={onClose}>
          Cancel
        </button>
        <span className="spacer" />
        <a className="chrome-link" href={`https://app.todoist.com/app/task/${task.id}`} target="_blank" rel="noopener noreferrer">
          Todoist
        </a>
        <button
          type="button"
          className="chrome-button quiet danger"
          onClick={() => {
            if (confirm(`Delete “${task.content}”?`)) {
              store.remove(task.id);
              onClose();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
