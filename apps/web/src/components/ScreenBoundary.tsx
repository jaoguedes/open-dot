// SPDX-License-Identifier: AGPL-3.0-only
import { DotTrouble } from "./DotTrouble.tsx";
import { Component, type ReactNode } from "react";
interface State {
  code: string | null;
}

export class ScreenBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { code: null };
  static getDerivedStateFromError(): State {
    return { code: "render_error" };
  }
  override render() {
    if (this.state.code) {
      const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      return <DotTrouble info={{ code: this.state.code, route: location.pathname }} reducedMotion={reducedMotion} onRetry={() => this.setState({ code: null })} />;
    }
    return this.props.children;
  }
}
