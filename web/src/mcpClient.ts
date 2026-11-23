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
  app.onhostcontextchanged = (ctx) => {
    if (ctx.displayMode) mode = ctx.displayMode;
  };
  const canFullscreen = app.getHostContext()?.availableDisplayModes?.includes("fullscreen");

  return {
    getOffice: () => tool<OfficeSnapshot>("office_live_state"),
    hire: (input) => tool<HireResult>("hire_employee", { ...input, name: input.name || undefined }),
    assign: async (request) => (await tool<{ task: TaskView }>("assign_task", { request })).task,
    fire: async (employeeId) => (await tool<{ message: string }>("fire_employee", { employeeId })).message,
    ...(canFullscreen
      ? {
          toggleFullscreen: async () => {
            const r = await app.requestDisplayMode({ mode: mode === "fullscreen" ? "inline" : "fullscreen" });
            mode = r.mode;
          },
          isFullscreen: () => mode === "fullscreen",
        }
      : {}),
  };
}
