import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode
} from "react";

interface LayoutElementPreviewErrorBoundaryProps {
  children: ReactNode;
  elementId: string;
  elementName?: string;
  fallbackStyle: CSSProperties;
  resetKey: string;
}

interface LayoutElementPreviewErrorBoundaryState {
  error: Error | null;
  resetKey: string;
}

export class LayoutElementPreviewErrorBoundary extends Component<
  LayoutElementPreviewErrorBoundaryProps,
  LayoutElementPreviewErrorBoundaryState
> {
  state: LayoutElementPreviewErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey
  };

  static getDerivedStateFromError(error: Error): Partial<LayoutElementPreviewErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: LayoutElementPreviewErrorBoundaryProps,
    state: LayoutElementPreviewErrorBoundaryState
  ): Partial<LayoutElementPreviewErrorBoundaryState> | null {
    return props.resetKey === state.resetKey
      ? null
      : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Layout preview failed for ${this.props.elementId}`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className="layout-element-preview-error"
        data-layout-element-preview-error={this.props.elementId}
        role="alert"
        style={this.props.fallbackStyle}
      >
        <strong>{this.props.elementName || this.props.elementId} preview failed</strong>
        <small>{this.state.error.message || "Unknown preview error"}</small>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Retry preview
        </button>
      </div>
    );
  }
}

export function LayoutElementPreviewRender({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

