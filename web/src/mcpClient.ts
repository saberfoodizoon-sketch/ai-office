import { App } from "@modelcontextprotocol/ext-apps";
import type { OfficeClient } from "./client";
import type { HireResult, OfficeSnapshot, TaskView } from "../../shared/types";

export async function createMcpClient(): Promise<OfficeClient> {
  const app = new App({ name: "AI Office", version: "0.1.0" });
  await app.connect();

  async function tool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const r = await app.callServerTool({ name, arguments: args });
    if (r.isError) {
      const text = r.content?.find((c) => c.type === "text");
      throw new Error(text && "text" in text ? text.text : "حصلت مشكلة");
    }
    return r.structuredContent as T;
  }

  let mode = app.getHostContext()?.displayMode ?? "inline";
  const listeners = new Set<(m: string) => void>();
  // Match the host's light/dark theme (CSS reads data-theme).
  const applyTheme = (theme?: string) => {
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  };
  applyTheme(app.getHostContext()?.theme);
  app.onhostcontextchanged = (ctx) => {
    applyTheme(ctx.theme);
    if (ctx.displayMode && ctx.displayMode !== mode) {
      mode = ctx.displayMode;
      listeners.forEach((cb) => cb(mode));
    }
  };
  const canFullscreen = app.getHostContext()?.availableDisplayModes?.includes("fullscreen");

  return {
    getOffice: () => tool<OfficeSnapshot>("office_live_state"),
    hire: (input) => tool<HireResult>("hire_employee", { ...input, name: input.name || undefined }),
    assign: async (request) => (await tool<{ task: TaskView }>("assign_task", { request })).task,
    finishWithTemplates: async (taskId) => (await tool<{ task: TaskView }>("finish_with_templates", { taskId })).task,
    fire: async (employeeId) => (await tool<{ message: string }>("fire_employee", { employeeId })).message,
    ...(canFullscreen
      ? {
          toggleFullscreen: async () => {
            const r = await app.requestDisplayMode({ mode: mode === "fullscreen" ? "inline" : "fullscreen" });
            mode = r.mode;
          },
          isFullscreen: () => mode === "fullscreen",
          onDisplayModeChange: (cb: (m: string) => void) => {
            listeners.add(cb);
            return () => void listeners.delete(cb);
          },
        }
      : {}),
  };
}
