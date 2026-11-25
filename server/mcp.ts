// MCP server for the ChatGPT App. Data tools work without UI; `show_office`
// is the only render tool and carries the widget template.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { Office } from "../engine/office.js";
import { WIDGET_CSS, WIDGET_JS } from "./generated/widget.js";
import type { OfficeSnapshot, TaskView } from "../shared/types.js";

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

type TeamMember = { id: string; name: string; title: string; role: string; jobDescription: string };

function teamSheet(team: TeamMember[]): string {
  return (
    "Team (assign by id):\n" +
    team.map((e) => `- id=${e.id} | ${e.name} | ${e.title} (${e.role}) | JD: ${e.jobDescription || "—"}`).join("\n")
  );
}

const PLAN_GUIDE =
  "How to plan as the GM: (1) restate the real goal, audience and constraints in 2–4 sentences (understanding); " +
  "(2) split into the fewest subtasks that cover it (1–5; one person for a small request); (3) give each subtask to " +
  "the employee whose title and job description fit best — HR only for hiring/team topics; (4) write a concrete brief " +
  "saying exactly what to deliver. Write titles, briefs and understanding in the user's language.";

const DELIVERABLE_GUIDE =
  "Write each deliverable as that employee: real, ready-to-use work (not a plan about the work), 250–600 words, " +
  "Markdown with ## / ### headings, - lists, simple tables and **bold**. No greetings. Then call submit_deliverable.";

function teamText(s: OfficeSnapshot): string {
  return s.employees.map((e) => `- ${e.name} — ${e.title} (${e.roleTitle}), id=${e.id}, ${e.activity}`).join("\n");
}

function taskText(t: TaskView): string {
  const head = `Task ${t.id} — ${t.status} (${Math.round(t.progress * 100)}%)\nRequest: ${t.request}`;
  if (!t.subtasks.length) return `${head}\nThe GM is still reading the request and splitting it; check again with get_task in ~15 s.`;
  const lines = t.subtasks.map(
    (s) => `- ${s.assigneeName}: ${s.title} [${s.status} ${Math.round(s.progress * 100)}%]\n  Brief: ${s.brief}`,
  );
  return [head, t.understanding && `GM's understanding: ${t.understanding}`, lines.join("\n")].filter(Boolean).join("\n");
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
      brief: z.string(),
      status: z.string(),
      progress: z.number(),
      deliverable: z.string().optional(),
    }),
  ),
  understanding: z.string().optional(),
  summary: z.string().optional(),
  ai: z.boolean(),
  error: z.string().optional(),
  mode: z.string(),
  agent: z.string().optional(),
});

/** Strip fields the model doesn't need, keeping structuredContent compact. */
function slimSnapshot(s: OfficeSnapshot) {
  return {
    employees: s.employees.map(({ id, name, roleId, roleTitle, title, activity, doing, completed }) => ({
      id, name, roleId, roleTitle, title, activity, doing, completed,
    })),
    tasks: s.tasks.slice(0, 8).map(({ id, request, status, progress, subtasks, summary, understanding, ai, error, mode, agent }) => ({
      id, request, status, progress, summary, understanding, ai, error, mode, agent,
      subtasks: subtasks.map(({ deliverable: _d, ...rest }) => rest),
    })),
  };
}

export function createMcpServer(office: Office, publicOrigin?: string): McpServer {
  const server = new McpServer(
    { name: "ai-office", version: "0.1.0" },
    {
      instructions:
        office.agentMode
          ? "AI Office: a 3D virtual office. YOU are the brain: you act as the General Manager and as each employee. " +
            "Workflow: assign_task (or get_pending_work for tasks the user added on the website) → plan_task (restate the " +
            "request, split it into 1–5 subtasks, give each to the employee whose title/job description fits best, with a " +
            "concrete brief) → for each subtask, write the real deliverable in that employee's voice and call " +
            "submit_deliverable → submit_report with the GM's review. Write in the user's language (Egyptian Arabic by " +
            "default). The office animates each step live; call show_office to let the user watch."
          : "AI Office: a virtual office of AI employees led by a General Manager and an HR Manager. Use hire_employee, " +
            "assign_task (the GM splits it across the team) and get_task to read progress and deliverables; poll get_task " +
            "until status is done. Call show_office to display the live 3D office.",
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
      description: office.agentMode
        ? "Use this when the user asks the team to do work (write content, plan a launch, design, research…). Creates " +
          "the task in the office and returns the team. Then YOU act as the GM: call plan_task, then submit_deliverable " +
          "for each subtask, then submit_report. Pass the user's request with all the details they gave."
        : "Use this when the user asks the team to do work. The GM restates the request, splits it into subtasks and " +
          "briefs the best-fitting employees. Returns a task id at once; poll get_task for the plan, deliverables and report.",
      inputSchema: { request: z.string().min(1).max(1000).describe("The work request, in the user's words") },
      outputSchema: { task: taskShape },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      _meta: { "openai/toolInvocation/invoking": "Omar is planning…", "openai/toolInvocation/invoked": "Task assigned." },
    },
    async ({ request }) => {
      const t = await office.assign(request);
      if (!office.agentMode) return { structuredContent: { task: t }, content: [{ type: "text", text: taskText(t) }] };
      const work = await office.agentWork();
      return {
        structuredContent: { task: t },
        content: [
          {
            type: "text",
            text:
              `Task ${t.id} created and waiting for the GM (${work.gm}) — that's you.\n` +
              `Next: call plan_task with taskId "${t.id}".\n\n${teamSheet(work.team)}\n\n${PLAN_GUIDE}`,
          },
        ],
      };
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

  // ---- agent mode: the connected AI does the GM's and the team's thinking ------
  if (office.agentMode) {
    server.registerTool(
      "get_pending_work",
      {
        title: "Get pending office work",
        description:
          "Use this when the user says to check the office / new tasks, or to continue work. Lists open tasks and what " +
          "each needs next (plan, deliverables or report), with the team. Then do that step as the GM or the employee.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      },
      async () => {
        const w = await office.agentWork();
        if (!w.tasks.length)
          return { structuredContent: w, content: [{ type: "text", text: "No open tasks. Ask the user what the team should work on, then call assign_task." }] };
        const blocks = w.tasks.map((t) => {
          const head = `Task ${t.taskId} — next: ${t.next}\nRequest: ${t.request}`;
          if (t.next === "plan") return `${head}\n→ call plan_task.`;
          const subs = t.subtasks
            .map(
              (s) =>
                `- subtaskId=${s.subtaskId} ${s.delivered ? "[delivered]" : "[TODO]"} ${s.assignee?.name} — ${s.assignee?.title} (${s.assignee?.role})\n` +
                `  JD: ${s.assignee?.jobDescription || "—"}\n  Title: ${s.title}\n  Brief: ${s.brief}`,
            )
            .join("\n");
          return `${head}\nGM's understanding: ${t.understanding}\n${subs}\n→ ${t.next === "deliverables" ? "write each TODO deliverable, submit_deliverable" : "all delivered: write the GM's review, submit_report"}.`;
        });
        return {
          structuredContent: w,
          content: [{ type: "text", text: `${blocks.join("\n\n")}\n\n${teamSheet(w.team)}\n\n${PLAN_GUIDE}\n${DELIVERABLE_GUIDE}` }],
        };
      },
    );

    server.registerTool(
      "plan_task",
      {
        title: "Submit the GM's plan",
        description:
          "Act as the General Manager: submit your understanding of the request and its split into subtasks, each " +
          "assigned (by employee id) to the best-fitting person with a concrete brief. The team gathers in the meeting " +
          "room, then starts. Next: write each deliverable and call submit_deliverable.",
        inputSchema: {
          taskId: z.string(),
          understanding: z.string().min(10).max(1500).describe("The real goal, audience and constraints, 2–4 sentences"),
          subtasks: z
            .array(
              z.object({
                assigneeId: z.string().describe("Employee id from the team list (not the GM)"),
                title: z.string().min(2).max(120),
                brief: z.string().min(10).max(1500).describe("Exactly what this person must deliver"),
              }),
            )
            .min(1)
            .max(6),
          agent: z.string().max(40).optional().describe("Your name, e.g. Claude, ChatGPT or Codex (shown in the office)"),
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
        _meta: { "openai/toolInvocation/invoking": "Planning…", "openai/toolInvocation/invoked": "Plan shared with the team." },
      },
      async ({ taskId, understanding, subtasks, agent }) => {
        const t = await office.submitPlan(taskId, { understanding, subtasks }, agent);
        const w = await office.agentWork();
        const task = w.tasks.find((x) => x.taskId === taskId);
        const todo = (task?.subtasks ?? [])
          .map(
            (s) =>
              `- subtaskId=${s.subtaskId}: ${s.assignee?.name} — ${s.assignee?.title} (${s.assignee?.role})\n` +
              `  JD: ${s.assignee?.jobDescription || "—"}\n  Title: ${s.title}\n  Brief: ${s.brief}`,
          )
          .join("\n");
        return {
          structuredContent: { task: t },
          content: [{ type: "text", text: `Plan saved; the team is in the meeting room.\nNow write each deliverable:\n${todo}\n\n${DELIVERABLE_GUIDE}` }],
        };
      },
    );

    server.registerTool(
      "submit_deliverable",
      {
        title: "Submit an employee's work",
        description:
          "Act as the assigned employee: submit the finished work for one subtask (real content in Markdown, in their " +
          "voice and following the GM's brief). After all subtasks are in, call submit_report.",
        inputSchema: {
          taskId: z.string(),
          subtaskId: z.string(),
          content: z.string().min(20).max(20_000).describe("The deliverable itself, Markdown"),
        },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
        _meta: { "openai/toolInvocation/invoking": "Delivering…", "openai/toolInvocation/invoked": "Delivered." },
      },
      async ({ taskId, subtaskId, content }) => {
        const t = await office.submitDeliverable(taskId, subtaskId, content);
        const left = t.subtasks.filter((s) => !s.deliverable && s.status !== "done").length;
        const pending = (await office.agentWork()).tasks.find((x) => x.taskId === taskId);
        const remaining = pending?.subtasks.filter((s) => !s.delivered).length ?? left;
        return {
          structuredContent: { task: t },
          content: [
            {
              type: "text",
              text: remaining
                ? `Saved. ${remaining} deliverable(s) left for this task.`
                : "All deliverables are in. As the GM, review them and call submit_report: start with «## تقرير المدير: <topic>», a 2-sentence summary, «### اللي اتعمل» (one bullet per employee) and «### توصياتي» (2–3 next steps).",
            },
          ],
        };
      },
    );

    server.registerTool(
      "submit_report",
      {
        title: "Submit the GM's final report",
        description: "Act as the GM: after all deliverables are in, submit your review and recommendations. This completes the task.",
        inputSchema: { taskId: z.string(), summary: z.string().min(20).max(8_000).describe("The GM's report, Markdown") },
        annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      },
      async ({ taskId, summary }) => {
        const t = await office.submitReport(taskId, summary);
        return {
          structuredContent: { task: t },
          content: [{ type: "text", text: "Task complete. Tell the user it's done; they can read every deliverable in the office." }],
        };
      },
    );
  }

  // Widget-only: finish a waiting task with templates.
  registerAppTool(
    server,
    "finish_with_templates",
    {
      title: "Finish with templates",
      description: "Finish a task with built-in templates instead of waiting for an AI. Widget only.",
      inputSchema: { taskId: z.string() },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } },
    },
    async ({ taskId }: { taskId: string }) => {
      const t = await office.finishWithTemplates(taskId);
      return { structuredContent: { task: t } as Record<string, unknown>, content: [{ type: "text", text: "ok" }] };
    },
  );

  return server;
}
