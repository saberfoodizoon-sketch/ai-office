import { defineConfig } from "vite";

// Local MCP Apps host for testing the widget without ChatGPT (served at /dev-host/).
export default defineConfig({
  root: "dev",
  base: "/dev-host/",
  build: { outDir: "../dist/dev-host", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 2000 },
});
