import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ChatGPT widget: one self-contained, minified ES module + one CSS file,
// both inlined into the MCP resource by server/mcp.ts.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/widget",
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: {
      input: "web/src/widget.tsx",
      output: { entryFileNames: "widget.js", assetFileNames: "widget[extname]", codeSplitting: false },
    },
  },
});
