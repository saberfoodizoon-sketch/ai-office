import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createMcpClient } from "./mcpClient";
import "./styles.css";
import { ErrorBoundary } from "./ui/ErrorBoundary";

// ChatGPT widget entry: same UI, data through MCP tool calls.
const root = createRoot(document.getElementById("root")!);
createMcpClient()
  .then((client) =>
    root.render(
      <ErrorBoundary fallback={<p style={{ padding: 16 }}>حصلت مشكلة في عرض المكتب.</p>}>
        <App client={client} embedded />
      </ErrorBoundary>,
    ),
  )
  .catch((e) => root.render(<p style={{ padding: 16, fontFamily: "sans-serif" }}>تعذّر الاتصال: {String(e)}</p>));
