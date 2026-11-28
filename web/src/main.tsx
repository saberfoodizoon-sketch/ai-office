import { createRoot } from "react-dom/client";
import { App } from "./App";
import { restClient } from "./client";
import "./styles.css";
import { ErrorBoundary } from "./ui/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary fallback={<p style={{ padding: 24 }}>حصلت مشكلة في عرض المكتب. حدّث الصفحة.</p>}>
    <App client={restClient} />
  </ErrorBoundary>,
);
