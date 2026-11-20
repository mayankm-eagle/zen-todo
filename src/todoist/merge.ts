import type { Label, Project, Section, SyncResponse, Task, User } from "./types";

export interface Data {
  syncToken: string;
  items: Record<string, Task>;
  projects: Record<string, Project>;
  sections: Record<string, Section>;
  labels: Record<string, Label>;
  user?: User;
}

export const emptyData = (): Data => ({
  syncToken: "*",
  items: {},
  projects: {},
  sections: {},
  labels: {},
});

type Gone<T> = (x: T) => boolean;

function mergeMap<T extends { id: string }>(
  base: Record<string, T>,
  incoming: T[] | undefined,
  gone: Gone<T>,
  full: boolean,
  skip?: Set<string>,
): Record<string, T> {
  if (!incoming) return full ? {} : base;
  const out: Record<string, T> = full ? {} : { ...base };
  for (const x of incoming) {
    if (skip?.has(x.id)) {
      if (full && base[x.id]) out[x.id] = base[x.id];
      continue;
    }
    if (gone(x)) delete out[x.id];
    else out[x.id] = x;
  }
  if (full && skip) for (const id of skip) if (base[id] && !out[id]) out[id] = base[id];
  return out;
}

/**
 * Apply a /sync response to local data. Full syncs replace everything;
 * incremental syncs upsert changed objects and drop deleted/completed ones.
 * `skip` holds IDs with local edits still in flight, so a stale read can't
 * clobber an optimistic change.
 */
export function mergeSync(data: Data, res: SyncResponse, skip?: Set<string>): Data {
  const full = res.full_sync;
  return {
    syncToken: res.sync_token,
    items: mergeMap(data.items, res.items, (t) => t.is_deleted || t.checked, full, skip),
    projects: mergeMap(data.projects, res.projects, (p) => !!(p.is_deleted || p.is_archived), full),
    sections: mergeMap(data.sections, res.sections, (s) => !!(s.is_deleted || s.is_archived), full),
    labels: mergeMap(data.labels, res.labels, (l) => !!l.is_deleted, full),
    user: res.user ?? data.user,
  };
}

/** Rewrite temporary IDs to the real ones Todoist assigned. */
export function remapIds(data: Data, mapping: Record<string, string> | undefined): Data {
  if (!mapping || !Object.keys(mapping).length) return data;
  const items: Record<string, Task> = {};
  for (const t of Object.values(data.items)) {
    const id = mapping[t.id] ?? t.id;
    items[id] = {
      ...t,
      id,
      parent_id: t.parent_id ? (mapping[t.parent_id] ?? t.parent_id) : null,
    };
  }
  return { ...data, items };
}
