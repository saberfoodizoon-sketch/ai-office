// MCP server for the ChatGPT App. Data tools work without UI; `show_office`
// is the only render tool and carries the widget template.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { Office } from "../engine/office";
import { WIDGET_CSS, WIDGET_JS } from "./generated/widget";
import type { OfficeSnapshot, TaskView } from "../shared/types";

export const WIDGET_URI = "ui://ai-office/office-v1.html";

function widgetHtml(): string {
  const script = WIDGET_JS.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>${WIDGET_CSS}</style></head>
<body><div id="root"></div><script type="module">${script}</script></body>
</html>`;
}

function teamText(s: OfficeSnapshot): string {
  return s.employees.map((e) => `- ${e.name} — ${e.title} (${e.roleTitle}), id=${e.id}, ${e.activity}`).join("\n");
}

function taskText(t: TaskView): string {
  const lines = t.subtasks.map((s) => `- ${s.assigneeName}: ${s.title} [${s.status} ${Math.round(s.progress * 100)}%]`);
  return `Task ${t.id} — ${t.status} (${Math.round(t.progress * 100)}%)\nRequest: ${t.request}\n${lines.join("\n")}`;
}

const employeeShape = z.object({
  id: z.string(),
  name: z.string(),
  roleId: z.string(),
  roleTitle: z.string(),
  title: z.string(),
  activity: z.string(),
  doing: z.string().optional(),
  completed: z.number(),
});
const taskShape = z.object({
  id: z.string(),
  request: z.string(),
  status: z.string(),
  progress: z.number(),
  subtasks: z.array(
    z.object({
      id: z.string(),
      assigneeId: z.string(),
      assigneeName: z.string(),
      title: z.string(),
      status: z.string(),
      progress: z.number(),
      deliverable: z.string().optional(),
    }),
  ),
  summary: z.string().optional(),
});

/** Strip fields the model doesn't need, keeping structuredContent compact. */
function slimSnapshot(s: OfficeSnapshot) {
  return {
    employees: s.employees.map(({ id, name, roleId, roleTitle, title, activity, doing, completed }) => ({
      id, name, roleId, roleTitle, title, activity, doing, completed,
    })),
    tasks: s.tasks.slice(0, 8).map(({ id, request, status, progress, subtasks, summary }) => ({
      id, request, status, progress, summary,
      subtasks: subtasks.map(({ deliverable: _d, ...rest }) => rest),
    })),
  };
}

export function createMcpServer(office: Office, publicOrigin?: string): McpServer {
  const server = new McpServer(
    { name: "ai-office", version: "0.1.0" },
    {
      instructions:
        "AI Office: a virtual office of AI employees led by a General Manager (Omar) and an HR Manager (Layla). " +
        "Use hire_employee to add someone from a job title + description, assign_task to give the GM a request " +
        "(he splits it across the team), and get_task to read progress and deliverables. Work takes ~20–40 s; " +
        "poll get_task until status is done. Call show_office to display the live 3D office.",
    },
  );

  // ---- widget resource ------------------------------------------------------
  registerAppResource(server, "AI Office", WIDGET_URI, {}, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml(),
        _meta: {
          ui: {
            prefersBorder: true,
            ...(publicOrigin ? { domain: publicOrigin } : {}),
            csp: {
              connectDomains: [],
              resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
            },
          },
        },
      },
    ],
  }));

  // ---- render tool ----------------------------------------------------------
  registerAppTool(
    server,
    "show_office",
    {
      title: "Show the office",
      description:
        "Display the live 3D office with the whole team, what each person is doing, and the task board. " +
        "Use when the user wants to see the office, the team, or watch work happen.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/toolInvocation/invoking": "Opening the office…",
        "openai/toolInvocation/invoked": "Office is open.",
      },
    },
    async () => {
      const s = await office.snapshot();
      return {
        structuredContent: slimSnapshot(s),
        content: [{ type: "text", text: `Showing the office with ${s.employees.length} employees.\n${teamText(s)}` }],
      };
    },
  );

  // Full live snapshot for the widget's polling loop (hidden from the model).
  registerAppTool(
    server,
    "office_live_state",
    {
      title: "Office live state",
      description: "Full office snapshot for the office widget. Not for the model.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } },
    },
    async () => {
      const s = await office.snapshot();
      return { structuredContent: s as unknown as Record<string, unknown>, content: [{ type: "text", text: "ok" }] };
    },
  );

  // ---- data tools -----------------------------------------------------------
  server.registerTool(
    "get_office",
    {
      title: "Get office status",
      description: "Use this to list the team (names, roles, ids, current activity) and recent tasks with progress.",
      inputSchema: {},
      outputSchema: { employees: z.array(employeeShape), tasks: z.array(taskShape) },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    async () => {
      const s = await office.snapshot();
      return {
        structuredContent: slimSnapshot(s),
        content: [{ type: "text", text: `Team:\n${teamText(s)}\n\nTasks:\n${s.tasks.slice(0, 5).map(taskText).join("\n\n") || "none"}` }],
      };
    },
  );

  server.registerTool(
    "hire_employee",
    {
      title: "Hire an employee",
      description:
        "Use this when the user wants to hire a new AI employee. The HR Manager reads the job title and description, " +
        "picks the matching role and gives them a desk. Name is optional (a name is generated if omitted).",
      inputSchema: {
        jobTitle: z.string().min(1).max(80).describe("Job title, e.g. 'Graphic Designer' or 'مصمم جرافيك'"),
        jobDescription: z.string().max(2000).describe("Responsibilities and skills, in any language"),
        name: z.string().max(30).optional().describe("Employee name, optional"),
      },
      outputSchema: { employee: employeeShape, note: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      _meta: { "openai/toolInvocation/invoking": "Layla is hiring…", "openai/toolInvocation/invoked": "Hired." },
    },
    async (args) => {
      const r = await office.hire(args);
      const { id, name, roleId, roleTitle, title, activity, doing, completed } = r.employee;
      return {
        structuredContent: { employee: { id, name, roleId, roleTitle, title, activity, doing, completed }, note: r.note },
        content: [{ type: "text", text: r.note }],
      };
    },
  );

  server.registerTool(
    "assign_task",
    {
      title: "Give the GM a task",
      description:
        "Use this when the user asks the team to do work (write content, plan a launch, design, research…). " +
        "The General Manager splits the request into subtasks for the right employees. Returns a task id; " +
        "deliverables appear in get_task once each subtask is done.",
      inputSchema: { request: z.string().min(1).max(1000).describe("The work request, in the user's words") },
      outputSchema: { task: taskShape },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      _meta: { "openai/toolInvocation/invoking": "Omar is planning…", "openai/toolInvocation/invoked": "Task assigned." },
    },
    async ({ request }) => {
      const t = await office.assign(request);
      return { structuredContent: { task: t }, content: [{ type: "text", text: taskText(t) }] };
    },
  );

  server.registerTool(
    "get_task",
    {
      title: "Get task progress",
      description: "Use this to check a task's progress and read each employee's deliverable and the GM's final report.",
      inputSchema: { taskId: z.string().describe("Task id from assign_task or get_office") },
      outputSchema: { task: taskShape },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    async ({ taskId }) => {
      const t = await office.getTask(taskId);
      if (!t) return { isError: true, content: [{ type: "text", text: `No task with id ${taskId}.` }] };
      const delivered = t.subtasks
        .filter((s) => s.deliverable)
        .map((s) => `### ${s.assigneeName}\n${s.deliverable}`)
        .join("\n\n");
      return {
        structuredContent: { task: t },
        content: [{ type: "text", text: [taskText(t), t.summary ?? "", delivered].filter(Boolean).join("\n\n") }],
      };
    },
  );

  server.registerTool(
    "fire_employee",
    {
      title: "Remove an employee",
      description: "Use this only when the user explicitly asks to remove (fire) an employee. Cannot remove the GM or HR, or someone mid-task.",
      inputSchema: { employeeId: z.string().describe("Employee id from get_office") },
      outputSchema: { message: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
    },
    async ({ employeeId }) => {
      const message = await office.fire(employeeId);
      return { structuredContent: { message }, content: [{ type: "text", text: message }] };
    },
  );

  return server;
}
