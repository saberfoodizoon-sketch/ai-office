// A tiny MCP Apps host for local testing. It does what ChatGPT does:
// connect to the MCP server, call the render tool, load its UI resource
// into a sandboxed iframe, and bridge tool calls from the widget.
// ext-apps 2.x is built on the v2 MCP client packages, so the host uses them too.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

const logEl = document.getElementById("log")!;
const log = (m: string) => (logEl.textContent += m + "\n");

const client = new Client({ name: "local-host", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", location.origin)));
const { tools } = await client.listTools();
log(`tools: ${tools.map((t) => t.name).join(", ")}`);

// The render tool: has a UI resource and is visible to the model.
const render = tools.find((t) => (t._meta as any)?.ui?.resourceUri && !(t._meta as any)?.ui?.visibility?.includes("app"))!;
const uri = (render._meta as any).ui.resourceUri as string;
const result = await client.callTool({ name: render.name, arguments: {} });
log(`called ${render.name}; reading ${uri}`);
const res = await client.readResource({ uri });
const html = (res.contents[0] as { text: string }).text;
log(`widget html: ${(html.length / 1024).toFixed(0)} KB`);

const iframe = document.getElementById("app") as HTMLIFrameElement;
const wrap = document.getElementById("frame-wrap")!;
let mode: "inline" | "fullscreen" = "inline";

const bridge = new AppBridge(client, { name: "local-host", version: "0.1.0" }, { serverTools: {}, openLinks: {} }, {
  hostContext: { theme: "light", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"], locale: "ar" },
});
bridge.onrequestdisplaymode = async ({ mode: m }) => {
  mode = m === "fullscreen" ? "fullscreen" : "inline";
  wrap.classList.toggle("fs", mode === "fullscreen");
  bridge.setHostContext({ displayMode: mode });
  log(`display mode → ${mode}`);
  return { mode };
};
bridge.oninitialized = () => {
  log("widget initialized");
  bridge.sendToolResult(result as any);
};

// Listen before the widget boots so its ui/initialize request isn't missed.
await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
iframe.srcdoc = html;
