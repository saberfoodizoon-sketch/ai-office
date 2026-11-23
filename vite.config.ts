import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone web app.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { proxy: { "/api": "http://localhost:8787", "/mcp": "http://localhost:8787" } },
});
