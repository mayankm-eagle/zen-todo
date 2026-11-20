// Shapes returned by the Todoist API v1 /sync endpoint (only the fields we use).
// https://developer.todoist.com/api/v1/sync/tasks.md

export type Priority = 1 | 2 | 3 | 4; // API value: 4 = "P1" (very urgent), 1 = "P4" (natural)

export interface Due {
  date: string; // "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM:SS" (floating) | "...Z" (fixed timezone)
  timezone: string | null;
  string: string;
  lang?: string;
  is_recurring: boolean;
}

export interface Deadline {
  date: string; // "YYYY-MM-DD"
  lang?: string;
}

export interface Task {
  id: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  content: string;
  description: string;
  priority: Priority;
  due: Due | null;
  deadline?: Deadline | null;
  labels: string[];
  child_order: number;
  order_key?: string | null;
  day_order?: number;
  checked: boolean;
  is_deleted: boolean;
  added_at?: string;
  completed_at?: string | null;
  duration?: { amount: number; unit: "minute" | "day" } | null;
}

export interface Project {
  id: string;
  name: string;
  color?: string;
  parent_id: string | null;
  child_order: number;
  order_key?: string | null;
  inbox_project?: boolean;
  is_archived?: boolean;
  is_deleted?: boolean;
  is_favorite?: boolean;
}

export interface Section {
  id: string;
  name: string;
  project_id: string;
  section_order: number;
  order_key?: string | null;
  is_archived?: boolean;
  is_deleted?: boolean;
}

export interface Label {
  id: string;
  name: string;
  item_order?: number;
  is_deleted?: boolean;
}

export interface User {
  id: string;
  full_name?: string;
}

export interface Command {
  type: string;
  uuid: string;
  temp_id?: string;
  args: Record<string, unknown>;
}

export type CommandStatus =
  | "ok"
  | { error: string; error_code?: number; error_tag?: string; http_code?: number };

export interface SyncRequest {
  sync_token: string;
  resource_types: string[];
  commands?: Command[];
}

export interface SyncResponse {
  sync_token: string;
  full_sync: boolean;
  items?: Task[];
  projects?: Project[];
  sections?: Section[];
  labels?: Label[];
  user?: User;
  sync_status?: Record<string, CommandStatus>;
  temp_id_mapping?: Record<string, string>;
}

export interface Transport {
  sync(req: SyncRequest): Promise<SyncResponse>;
  /** Todoist Quick Add: natural-language parsing of dates, #project, @label, p1..p4. */
  quickAdd(text: string): Promise<Task>;
}

/** Display priority ("P1".."P4") from API priority. */
export const displayPriority = (p: Priority) => 5 - p;
/** API priority from display priority 1..4. */
export const apiPriority = (display: number) => (5 - display) as Priority;
