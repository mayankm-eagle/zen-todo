import { useEffect } from "react";
import { dayHeading, dayKey, dueDay, formatTime } from "../lib/dates";
import { Inline } from "../lib/inline";
import { capitalize, count } from "../lib/words";
import { HISTORY_DAYS, type State, type Store } from "../todoist/store";
import { isShallow, estimate } from "../todoist/select";
import { displayPriority, type Task } from "../todoist/types";
import { formatMinutes } from "./Board";

/**
 * When you checked off what. Grouped by day with a deep/shallow split, so you
 * can look back at where the time went.
 */
export function History({ state, store }: { state: State; store: Store }) {
  useEffect(() => {
    void store.loadHistory();
  }, [store]);

  if (state.historyError && !state.history) return <p className="rail-note error">{state.historyError}</p>;
  if (!state.history) return <p className="rail-note">Loading…</p>;
  if (!state.history.length) return <p className="rail-note">Nothing checked off in the last two weeks.</p>;

  const byDay = new Map<string, Task[]>();
  for (const t of state.history) {
    if (!t.completed_at) continue;
    const key = dayKey(new Date(t.completed_at));
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  const week = dayKey(new Date(Date.now() - 6 * 86_400_000));
  const thisWeek = state.history.filter((t) => t.completed_at && dayKey(new Date(t.completed_at)) >= week);

  return (
    <div className="history">
      <p className="rail-note">
        <Split tasks={thisWeek} prefix="Last 7 days:" />
      </p>
      {[...byDay.entries()].map(([key, tasks]) => (
        <section key={key} className="history-day">
          <h3>
            {dayHeading(key)}
            <span className="h2-count">{tasks.length}</span>
          </h3>
          <p className="history-split">
            <Split tasks={tasks} />
          </p>
          <ul className="history-list">
            {tasks.map((t, i) => (
              <li key={`${t.id}-${t.completed_at}-${i}`}>
                <span className="history-time">{formatTime(minutesOf(t.completed_at!))}</span>
                <span className="history-body">
                  <span className="history-content">
                    <Inline text={t.content} />
                  </span>
                  <span className="history-tags">
                    {isShallow(t) ? "Shallow" : "Deep"}
                    {t.priority > 1 && ` · P${displayPriority(t.priority)}`}
                    {late(t) && " · late"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="rail-note">Showing the last {HISTORY_DAYS} days.</p>
    </div>
  );
}

function Split({ tasks, prefix }: { tasks: Task[]; prefix?: string }) {
  const deep = tasks.filter((t) => !isShallow(t));
  const shallow = tasks.filter(isShallow);
  const important = deep.filter((t) => t.priority >= 3).length;
  const minutes = shallow.reduce((n, t) => n + estimate(t), 0);
  return (
    <>
      {prefix && `${prefix} `}
      {prefix ? count(deep.length, "deep task") : capitalize(count(deep.length, "deep task"))}
      {important > 0 && ` (${important} P1–P2)`}, {count(shallow.length, "shallow one")}
      {shallow.length > 0 && ` (~${formatMinutes(minutes)})`}.
    </>
  );
}

const minutesOf = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** Completed after the day it was due. */
const late = (t: Task) => !!t.due && !!t.completed_at && dueDay(t.due) < dayKey(new Date(t.completed_at));
