import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MockBrain } from "../engine/brain";
import { Office } from "../engine/office";
import { createMcpServer } from "./mcp";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const SPEED = Number(process.env.WORK_SPEED ?? 1);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN; // e.g. https://office.example.com (for ChatGPT submission)

const office = new Office(new MockBrain(), process.env.DATA_FILE ?? `${root}data/office.json`, SPEED);
const app = express();
app.use(express.json({ limit: "64kb" }));

// Errors thrown by the engine carry user-facing (Arabic) messages.
const handle =
  (fn: (req: express.Request) => unknown) =>
  (req: express.Request, res: express.Response) => {
    try {
      res.json(fn(req));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  };

// ---- REST API for the standalone web app --------------------------------------
app.get("/api/office", handle(() => office.snapshot()));
app.post("/api/hire", handle((req) => office.hire(req.body ?? {})));
app.post("/api/tasks", handle((req) => office.assign(String(req.body?.request ?? ""))));
app.delete("/api/employees/:id", handle((req) => ({ message: office.fire(String(req.params.id)) })));
app.post("/api/reset", handle(() => (office.reset(), { ok: true })));

// ---- MCP endpoint for ChatGPT (stateless streamable HTTP) ---------------------
app.post("/mcp", async (req, res) => {
  const server = createMcpServer(office, `${root}dist/widget`, PUBLIC_ORIGIN);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP error", e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});
app.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").json({ error: "Use POST for MCP." }));

// ---- local MCP Apps host for testing the widget (dev only) -------------------
const hostDir = `${root}dist/dev-host`;
if (existsSync(hostDir) && process.env.NODE_ENV !== "production") app.use("/dev-host", express.static(hostDir));

// ---- static web app -----------------------------------------------------------
const webDir = `${root}dist/web`;
if (existsSync(webDir)) {
  app.use(express.static(webDir));
  app.get(/^(?!\/(api|mcp|dev-host)).*/, (_req, res) => res.sendFile(`${webDir}/index.html`));
}

app.listen(PORT, () => {
  console.log(`AI Office running:  http://localhost:${PORT}`);
  console.log(`MCP endpoint:       http://localhost:${PORT}/mcp`);
});
