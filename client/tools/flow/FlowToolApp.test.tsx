import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowToolApp } from "./FlowToolApp";

describe("FlowToolApp shell", () => {
  it("renders the flow shell with metadata and all panels", () => {
    const markup = renderToStaticMarkup(
      <FlowToolApp
        surface="tools"
        previewMode="replace"
        flow={{
          states: [{ id: "intro", name: "Intro", actions: [] }],
          routeNodes: [{ id: "entry" }]
        }}
        selectedStateId="intro"
        nodeCanvas={<section data-flow-react-component="node-canvas">Node canvas</section>}
        visible={true}
      />
    );

    expect(markup).toContain('data-preview-mode="replace"');
    expect(markup).toContain('data-state-count="1"');
    expect(markup).toContain('data-route-node-count="1"');
    expect(markup).toContain('data-surface="tools"');
    expect(markup).toContain('data-flow-react-component="state-list"');
    expect(markup).toContain('data-flow-react-component="node-canvas"');
    expect(markup).toContain('data-flow-react-component="action-inspector"');
    expect(markup).toContain('data-flow-react-component="toolbar"');
    expect(markup).toContain('data-flow-react-component="inspector-resizer"');
    expect(markup).toContain('aria-label="Resize action inspector"');
    expect(markup).toContain('--flow-inspector-width:420px');
    expect(markup).toContain('class="flow-node-workspace-content"');
    expect(markup).not.toContain('data-flow-react-component="action-list"');
    expect(markup).not.toContain('data-flow-react-component="route-node-list"');
    expect(markup).not.toContain('data-flow-react-component="route-inspector"');
    expect(markup).not.toContain(" hidden");
  });

  it("renders the actual save error as an accessible alert", () => {
    const markup = renderToStaticMarkup(
      <FlowToolApp error="Draft revision conflict" flow={{ states: [] }} visible />
    );

    expect(markup).toContain('data-tool-save-error="flow"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Draft revision conflict");
  });
});
