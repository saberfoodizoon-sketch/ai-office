// Local server: the same app plus static files (on Vercel, public/ is served by the CDN).
import express from "express";
import { existsSync } from "node:fs";
import app from "./app";

const PORT = Number(process.env.PORT ?? 8787);

if (existsSync("dist/dev-host")) app.use("/dev-host", express.static("dist/dev-host"));
if (existsSync("public")) {
  app.use(express.static("public"));
  app.get(/^(?!\/(api|mcp|dev-host)).*/, (_req, res) => res.sendFile("index.html", { root: "public" }));
}

app.listen(PORT, () => {
  console.log(`AI Office running:  http://localhost:${PORT}`);
  console.log(`MCP endpoint:       http://localhost:${PORT}/mcp`);
  console.log(`Widget test host:   http://localhost:${PORT}/dev-host/`);
});
