// Types shared by the engine, the server, the web app and the ChatGPT widget.

export type RoleId =
  | "general_manager"
  | "hr_manager"
  | "product_manager"
  | "copywriter"
  | "designer"
  | "marketer"
  | "developer"
  | "data_analyst"
  | "researcher"
  | "sales"
  | "support"
  | "specialist";

export interface Employee {
  id: string;
  name: string;
  roleId: RoleId;
  /** Job title as the user wrote it (e.g. "Senior Copywriter"). */
  title: string;
  jobDescription: string;
  /** Index into the desk layout. GM and HR have fixed desks (-1 / -2). */
  desk: number;
  hiredAt: number;
  /** Small appearance seed so every character looks a bit different. */
  look: number;
}

export interface Subtask {
  id: string;
  assigneeId: string;
  title: string;
  startAt: number;
  durationMs: number;
  /** Generated up front, only exposed once the subtask is done. */
  deliverable: string;
}

export interface Task {
  id: string;
  request: string;
  createdAt: number;
  planningMs: number;
  subtasks: Subtask[];
  summary: string;
}

export interface OfficeData {
  employees: Employee[];
  tasks: Task[];
  lastHire?: { employeeId: string; at: number; note: string };
}

// ---- Derived view sent to clients -------------------------------------------

export type Activity = "working" | "meeting" | "idle" | "break";
export type SubtaskStatus = "queued" | "working" | "done";
export type TaskStatus = "planning" | "in_progress" | "reviewing" | "done";

export interface EmployeeView {
  id: string;
  name: string;
  roleId: RoleId;
  roleTitle: string;
  color: string;
  title: string;
  jobDescription: string;
  desk: number;
  look: number;
  hiredAt: number;
  activity: Activity;
  /** Title of the subtask in progress, if any. */
  doing?: string;
  doingProgress?: number;
  completed: number;
}

export interface SubtaskView {
  id: string;
  assigneeId: string;
  assigneeName: string;
  title: string;
  status: SubtaskStatus;
  progress: number;
  deliverable?: string;
}

export interface TaskView {
  id: string;
  request: string;
  createdAt: number;
  status: TaskStatus;
  progress: number;
  subtasks: SubtaskView[];
  summary?: string;
}

export interface OfficeSnapshot {
  now: number;
  employees: EmployeeView[];
  tasks: TaskView[];
  lastHire?: { employeeId: string; at: number; note: string };
}

export interface HireInput {
  name?: string;
  jobTitle: string;
  jobDescription: string;
}

export interface HireResult {
  employee: EmployeeView;
  note: string;
}
