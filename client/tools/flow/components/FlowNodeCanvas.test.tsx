import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowNodeCanvas, newConnectedActionPosition } from "./FlowNodeCanvas";
import type { FlowGraphConnection, FlowGraphNode } from "../flowNodeGraph";

function nodes(selectedSource = true): FlowGraphNode[] {
  return [
    {
      id: "jump",
      kind: "action",
      title: "Jump",
      subtitle: "jumpNode",
      timing: "",
      x: 20,
      y: 20,
      width: 260,
      height: 134,
      className: "is-jump",
      selected: selectedSource
    },
    {
      id: "target",
      kind: "action",
      title: "Target",
      subtitle: "message",
      timing: "",
      x: 420,
      y: 260,
      width: 260,
      height: 134,
      className: "is-standard",
      selected: false
    }
  ];
}

const jumpConnection: FlowGraphConnection = {
  id: "jump->target:Jump",
  from: "jump",
  to: "target",
  label: "Jump",
  labelKind: "jump-preview",
  visibleWhenSelected: true
};

describe("FlowNodeCanvas", () => {
  it("places a command-dragged action beside its drop target", () => {
    const [source, target] = nodes();

    expect(newConnectedActionPosition({ x: 500, y: 300 }, source, target)).toEqual({
      x: 90,
      y: 260
    });
  });

  it("renders selected-only jump preview wires only when the jump node is selected", () => {
    const selectedMarkup = renderToStaticMarkup(
      <FlowNodeCanvas depth="subroutine" nodes={nodes(true)} connections={[jumpConnection]} />
    );
    const unselectedMarkup = renderToStaticMarkup(
      <FlowNodeCanvas depth="subroutine" nodes={nodes(false)} connections={[jumpConnection]} />
    );

    expect(selectedMarkup).toContain('data-wire-id="jump-&gt;target:Jump"');
    expect(selectedMarkup).toContain('data-wire-label-kind="jump-preview"');
    expect(unselectedMarkup).not.toContain('data-wire-id="jump-&gt;target:Jump"');
  });

  it("renders decision branch wire labels as typed capsules", () => {
    const markup = renderToStaticMarkup(
      <FlowNodeCanvas
        depth="subroutine"
        nodes={nodes(true)}
        connections={[
          {
            id: "branch->target",
            from: "jump",
            to: "target",
            label: "x > 3",
            labelKind: "branch-code"
          }
        ]}
      />
    );

    expect(markup).toContain('data-wire-label-kind="branch-code"');
    expect(markup).toContain("x &gt; 3");
    expect(markup).toContain(">C</text>");
  });

  it("renders node timing and value badges together", () => {
    const markup = renderToStaticMarkup(
      <FlowNodeCanvas
        depth="subroutine"
        nodes={[
          {
            ...nodes(true)[0],
            id: "wipe",
            title: "Set Wipe Shown",
            subtitle: "setWipeShown",
            timing: "E+ 0.00s",
            valueBadge: { text: "Hide", className: "is-hide" }
          }
        ]}
      />
    );

    expect(markup).toContain("flow-node-meta-row");
    expect(markup).toContain("E+ 0.00s");
    expect(markup).toContain("flow-node-value-badge is-hide");
    expect(markup).toContain("Hide");
  });

  it("uses game-state navigation language at the root state boundary", () => {
    const markup = renderToStaticMarkup(
      <FlowNodeCanvas
        backLabel="Game States"
        depth="subroutine"
        nodes={nodes()}
        stateTitle="Intro"
      />
    );

    expect(markup).toContain("← Game States");
    expect(markup).toContain("Inside Intro");
  });
});
