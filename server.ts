// The HTTP app: REST API for the web UI and the MCP endpoint for ChatGPT/Codex.
// Vercel detects this file (it must import express) and runs it on Fluid compute;
// server/index.ts runs the same app locally.
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MockBrain } from "./engine/brain.js";
import { Office } from "./engine/office.js";
import { defaultStore } from "./engine/store.js";
import { createMcpServer } from "./server/mcp.js";

const SPEED = Number(process.env.WORK_SPEED ?? 1);
// Origin the widget is served under (used in its MCP Apps metadata).
const PUBLIC_ORIGIN =
  process.env.PUBLIC_ORIGIN ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

export const office = new Office(new MockBrain(), defaultStore(process.env.DATA_FILE ?? "data/office.json"), SPEED);

const app = express();
app.use(express.json({ limit: "64kb" }));

// Engine errors carry user-facing (Arabic) messages.
const handle =
  (fn: (req: express.Request) => unknown) =>
  async (req: express.Request, res: express.Response) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  };

// ---- REST API for the web app ----------------------------------------------
app.get("/api/office", handle(() => office.snapshot()));
app.post("/api/hire", handle((req) => office.hire(req.body ?? {})));
app.post("/api/tasks", handle((req) => office.assign(String(req.body?.request ?? ""))));
app.delete("/api/employees/:id", handle(async (req) => ({ message: await office.fire(String(req.params.id)) })));
app.post("/api/reset", handle(async () => (await office.reset(), { ok: true })));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- MCP endpoint (stateless streamable HTTP) --------------------------------
app.post("/mcp", async (req, res) => {
  const server = createMcpServer(office, PUBLIC_ORIGIN);
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

// ---- web app (public/) --------------------------------------------------------
// Served by Express in every environment; on Vercel the folder is bundled with the
// function (vercel.json includeFiles) and hashed assets are cached by the CDN.
const PUBLIC_DIR = [fileURLToPath(new URL("./public", import.meta.url)), `${process.cwd()}/public`].find((d) =>
  existsSync(d),
);
if (PUBLIC_DIR) {
  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders: (res, path) => {
        if (path.includes("/assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
        else res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      },
    }),
  );
  app.get(/^(?!\/(api|mcp|dev-host)(\/|$)).*/, (_req, res) => res.sendFile("index.html", { root: PUBLIC_DIR }));
}

export default app;
