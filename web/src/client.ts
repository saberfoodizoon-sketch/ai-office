import type { HireInput, HireResult, OfficeSnapshot, TaskView } from "../../shared/types";

/** The UI talks to the office through this interface: REST on the web, MCP inside ChatGPT. */
export interface OfficeClient {
  getOffice(): Promise<OfficeSnapshot>;
  hire(input: HireInput): Promise<HireResult>;
  assign(request: string): Promise<TaskView>;
  fire(employeeId: string): Promise<string>;
  /** Finish a task that's waiting for an AI agent with built-in templates. */
  finishWithTemplates(taskId: string): Promise<TaskView>;
  reset?(): Promise<void>;
  /** Present only where the host supports it (ChatGPT fullscreen). */
  toggleFullscreen?(): Promise<void>;
  isFullscreen?: () => boolean;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const restClient: OfficeClient = {
  getOffice: () => call("/api/office"),
  hire: (input) => call("/api/hire", { method: "POST", body: JSON.stringify(input) }),
  assign: (request) => call("/api/tasks", { method: "POST", body: JSON.stringify({ request }) }),
  finishWithTemplates: (id) => call(`/api/tasks/${id}/templates`, { method: "POST" }),
  fire: async (id) => (await call<{ message: string }>(`/api/employees/${id}`, { method: "DELETE" })).message,
  reset: async () => void (await call("/api/reset", { method: "POST" })),
};
