// The HTTP app: REST API for the web UI and the MCP endpoint for ChatGPT/Codex.
// Vercel detects this file (it must import express) and runs it on Fluid compute;
// server/index.ts runs the same app locally.
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z, ZodError } from "zod";
import { waitUntil } from "@vercel/functions";
import { AiBrain } from "./engine/ai-brain.js";
import { MockBrain } from "./engine/brain.js";
import { Office } from "./engine/office.js";
import { defaultStore, storeName } from "./engine/store.js";
import { createMcpServer } from "./server/mcp.js";
import { rateLimit } from "./server/limits.js";
import { UserError } from "./engine/errors.js";

const SPEED = Number(process.env.WORK_SPEED ?? 1);
// Origin the widget is served under (used in its MCP Apps metadata).
const PUBLIC_ORIGIN =
  process.env.PUBLIC_ORIGIN ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

// Who does the thinking (BRAIN env):
//   "agent"   (default) — the AI assistant connected over MCP (Claude, ChatGPT, Codex)
//             acts as the GM and the team; tasks wait for it. No API key, no cost here.
//   "gateway" — the server calls a model through Vercel AI Gateway itself.
//   "mock"    — built-in templates only.
const BRAIN = (process.env.BRAIN ?? "agent").toLowerCase();
const brain = BRAIN === "gateway" && AiBrain.available() ? new AiBrain() : new MockBrain();
console.log(`brain: ${BRAIN === "agent" ? "connected AI agent (MCP)" : brain.ai ? "AI Gateway" : "templates"}`);

const store = defaultStore(process.env.DATA_FILE ?? "data/office.json");
console.log(`store: ${storeName(store)}`);

export const office = new Office(
  brain,
  store,
  SPEED,
  (p) => waitUntil(p),
  BRAIN === "agent",
);

const app = express();
app.set("trust proxy", true);

// Only engine UserErrors carry messages meant for users; anything else is logged
// and answered with a generic error so internals don't leak.
const handle =
  (fn: (req: express.Request) => unknown) =>
  async (req: express.Request, res: express.Response) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      if (e instanceof UserError) return void res.status(400).json({ error: e.message });
      if (e instanceof ZodError) return void res.status(400).json({ error: "البيانات اللي اتبعتت مش صحيحة." });
      console.error(`${req.method} ${req.path} failed`, e);
      res.status(500).json({ error: "حصلت مشكلة. جرّب تاني." });
    }
  };

const HireBody = z.object({
  jobTitle: z.string().min(1).max(80),
  jobDescription: z.string().max(2000).default(""),
  name: z.string().max(30).optional(),
});
const TaskBody = z.object({ request: z.string().min(1).max(1000) });
const Id = z.string().min(1).max(80);

// Reset wipes the shared office: allowed locally, and in production only with ADMIN_TOKEN.
const canReset = (req: express.Request) =>
  process.env.ADMIN_TOKEN ? req.get("x-admin-token") === process.env.ADMIN_TOKEN : !process.env.VERCEL;

// ---- REST API for the web app ----------------------------------------------
const api = express.Router();
api.use(express.json({ limit: "64kb" }));
const writeLimit = rateLimit("writes", 20);
api.use((req, res, next) => (req.method === "GET" ? next() : writeLimit(req, res, next)));
api.get("/office", rateLimit("reads", 240), handle(() => office.snapshot()));
api.post("/hire", handle((req) => office.hire(HireBody.parse(req.body ?? {}))));
api.post("/tasks", handle((req) => office.assign(TaskBody.parse(req.body ?? {}).request)));
api.post("/tasks/:id/templates", handle((req) => office.finishWithTemplates(Id.parse(req.params.id))));
api.delete("/employees/:id", handle(async (req) => ({ message: await office.fire(Id.parse(req.params.id)) })));
api.post(
  "/reset",
  handle(async (req) => {
    if (!canReset(req)) throw new UserError("إعادة الضبط مقفولة على النسخة الأونلاين.");
    await office.reset();
    return { ok: true };
  }),
);
api.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", api);

// ---- MCP endpoint (stateless streamable HTTP) --------------------------------
// Locally, reject other Host headers (DNS rebinding from a malicious page).
const LOCAL_PORT = Number(process.env.PORT ?? 8787);
const dnsProtection = process.env.VERCEL
  ? {}
  : { enableDnsRebindingProtection: true, allowedHosts: [`localhost:${LOCAL_PORT}`, `127.0.0.1:${LOCAL_PORT}`] };

app.use("/mcp", rateLimit("mcp", 120), express.json({ limit: "512kb" }));
app.use("/mcp", ((err, _req, res, next) => {
  // Malformed JSON → a JSON-RPC parse error instead of Express's HTML page.
  if (err) return res.status(400).json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
  next();
}) as express.ErrorRequestHandler);
app.post("/mcp", async (req, res) => {
  const server = createMcpServer(office, PUBLIC_ORIGIN);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, ...dnsProtection });
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

// Bad JSON bodies on the REST API get a JSON error, not Express's HTML page.
app.use("/api", ((err, _req, res, _next) => {
  res.status(err?.status ?? 400).json({ error: "البيانات اللي اتبعتت مش صحيحة." });
}) as express.ErrorRequestHandler);

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
