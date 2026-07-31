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
    expect(markup).toContain("Game States");
    expect(markup).not.toContain("<h3>Subroutines</h3>");
  });

  it("renders the actual save error as an accessible alert", () => {
    const markup = renderToStaticMarkup(
      <FlowToolApp error="Draft revision conflict" flow={{ states: [] }} visible />
    );

    expect(markup).toContain('data-tool-save-error="flow"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Draft revision conflict");
  });

  it("renders read-only Start inputs and editable End output values", () => {
    const subroutine = {
      id: "collect-bid",
      name: "Collect Bid",
      type: "subroutine",
      inputs: [{
        name: "playerBidAmount",
        valueType: "integer" as const,
        source: "l.playerBidAmount"
      }],
      outputs: [{
        name: "parentBidResponse",
        valueType: "string" as const,
        value: "l.bidResponse"
      }],
      actions: []
    };
    const startMarkup = renderToStaticMarkup(
      <FlowToolApp
        flow={{ states: [{ id: "play", actions: [subroutine] }] }}
        inspectorBoundaryOverride={{ boundary: "start", subroutine }}
        inspectorSubroutine={subroutine}
        selectedStateId="play"
        visible
      />
    );
    expect(startMarkup).toContain('data-subroutine-boundary="start"');
    expect(startMarkup).toContain('value="l.playerBidAmount"');
    expect(startMarkup).toContain('value="Integer"');
    expect(startMarkup).toContain("readOnly");

    const endMarkup = renderToStaticMarkup(
      <FlowToolApp
        flow={{ states: [{ id: "play", actions: [subroutine] }] }}
        inspectorBoundaryOverride={{
          boundary: "return",
          subroutine,
          onSetOutputs: () => undefined
        }}
        inspectorSubroutine={subroutine}
        selectedStateId="play"
        visible
      />
    );
    expect(endMarkup).toContain('data-subroutine-boundary="return"');
    expect(endMarkup).toContain('value="l.parentBidResponse"');
    expect(endMarkup).toContain('value="l.bidResponse"');
    expect(endMarkup).not.toContain('aria-label="Output 1 child value" readOnly');
  });

  it("describes game-state Start and End as lifecycle boundaries", () => {
    const gameState = {
      id: "play",
      name: "Play",
      actions: []
    };
    const startMarkup = renderToStaticMarkup(
      <FlowToolApp
        flow={{ states: [gameState] }}
        inspectorBoundaryOverride={{ boundary: "start", subroutine: gameState }}
        inspectorSubroutine={gameState}
        selectedStateId="play"
        visible
      />
    );
    const endMarkup = renderToStaticMarkup(
      <FlowToolApp
        flow={{ states: [gameState] }}
        inspectorBoundaryOverride={{ boundary: "return", subroutine: gameState }}
        inspectorSubroutine={gameState}
        selectedStateId="play"
        visible
      />
    );

    expect(startMarkup).toContain("Game State");
    expect(startMarkup).toContain("fresh local");
    expect(startMarkup).not.toContain("No inputs enter this subroutine");
    expect(endMarkup).toContain(">End<");
    expect(endMarkup).toContain("advances through its authored Next connection");
    expect(endMarkup).not.toContain("No outputs leave this subroutine");
  });
});
