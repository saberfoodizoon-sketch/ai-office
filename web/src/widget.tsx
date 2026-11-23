import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createMcpClient } from "./mcpClient";
import "./styles.css";

// ChatGPT widget entry: same UI, data through MCP tool calls.
const root = createRoot(document.getElementById("root")!);
createMcpClient()
  .then((client) => root.render(<App client={client} embedded />))
  .catch((e) => root.render(<p style={{ padding: 16, fontFamily: "sans-serif" }}>تعذّر الاتصال: {String(e)}</p>));
