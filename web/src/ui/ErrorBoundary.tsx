import { Component, type ReactNode } from "react";

/** Contains a render error to one part of the UI instead of blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("UI error", error);
  }
  render() {
    if (this.state.failed)
      return this.props.fallback ?? <p className="muted small">الجزء ده مقدرش يتعرض.</p>;
    return this.props.children;
  }
}
