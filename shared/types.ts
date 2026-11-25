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
  /** The GM's instructions to this employee: what exactly to deliver. */
  brief: string;
  startAt: number;
  /** Expected duration, drives the progress bar until the work arrives. */
  durationMs: number;
  /** Set when the employee finishes; only exposed once now >= doneAt. */
  deliverable?: string;
  doneAt?: number;
}

export interface Task {
  id: string;
  request: string;
  createdAt: number;
  /** Meeting length; extended once the plan is known so the team can gather. */
  planningMs: number;
  /** False while the GM is still reading and splitting the request. */
  planned: boolean;
  /** The GM's understanding of the request, in his words. */
  understanding?: string;
  subtasks: Subtask[];
  summary?: string;
  /** When the GM finished his final review. */
  summaryAt?: number;
  /** True when a real model did the work (false = template fallback). */
  ai?: boolean;
  error?: string;
  /**
   * "agent": an AI assistant connected over MCP (Claude, ChatGPT, Codex) acts as
   * the GM and the team. "auto": the server's own brain (templates) does it.
   */
  mode?: "agent" | "auto";
  /** Who did the thinking, e.g. "Claude" — shown in the UI. */
  agent?: string;
}

export interface OfficeData {
  employees: Employee[];
  tasks: Task[];
  lastHire?: { employeeId: string; at: number; note: string };
}

// ---- Derived view sent to clients -------------------------------------------

export type Activity = "working" | "meeting" | "idle" | "break";
export type SubtaskStatus = "queued" | "working" | "done";
export type TaskStatus = "waiting" | "planning" | "in_progress" | "reviewing" | "done";

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
  brief: string;
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
  understanding?: string;
  subtasks: SubtaskView[];
  summary?: string;
  ai: boolean;
  error?: string;
  mode: "agent" | "auto";
  agent?: string;
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
