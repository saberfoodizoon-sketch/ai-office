// Local server: the same app, plus the widget test host at /dev-host/.
import express from "express";
import { existsSync } from "node:fs";
import app from "../server.js";

const PORT = Number(process.env.PORT ?? 8787);

if (existsSync("dist/dev-host")) app.use("/dev-host", express.static("dist/dev-host"));

app.listen(PORT, () => {
  console.log(`AI Office running:  http://localhost:${PORT}`);
  console.log(`MCP endpoint:       http://localhost:${PORT}/mcp`);
  console.log(`Widget test host:   http://localhost:${PORT}/dev-host/`);
});
