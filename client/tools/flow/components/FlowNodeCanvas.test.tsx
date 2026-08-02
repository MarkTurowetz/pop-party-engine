import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildConnectionRoute,
  buildFlowGraphGeometry,
  FlowNodeCanvas,
  newConnectedActionPosition
} from "./FlowNodeCanvas";
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

function flipSevenShapedNodes(): FlowGraphNode[] {
  return [
    {
      id: "overlap-at-zero",
      kind: "action",
      title: "Overlapping action",
      subtitle: "message",
      timing: "",
      x: 0,
      y: 2400,
      width: 260,
      height: 1000,
      className: "is-standard",
      selected: false
    },
    {
      id: "opening-deal-complete",
      kind: "action",
      title: "Branch on Opening Deal Complete",
      subtitle: "decision",
      timing: "",
      x: 302,
      y: 5428,
      width: 260,
      height: 134,
      className: "is-decision",
      selected: false
    },
    {
      id: "draw-opening-card",
      kind: "action",
      title: "Draw Opening Card",
      subtitle: "drawCard",
      timing: "",
      x: 542,
      y: 1858,
      width: 260,
      height: 134,
      className: "is-standard",
      selected: false
    }
  ];
}

const flipSevenBackEdge: FlowGraphConnection = {
  id: "opening-deal-complete->draw-opening-card:no-match",
  from: "opening-deal-complete",
  to: "draw-opening-card",
  label: "No Match",
  labelKind: "branch-no-match"
};

function overlappingBackEdges(): {
  nodes: FlowGraphNode[];
  connections: FlowGraphConnection[];
} {
  const target = { ...nodes()[1], id: "earlier-target", x: 500, y: 100 };
  const sources = [700, 900, 1100].map((y, index) => ({
    ...nodes()[0],
    id: `later-source-${index + 1}`,
    x: 300,
    y,
    selected: false
  }));
  return {
    nodes: [
      { ...nodes()[0], id: "left-edge-overlap", x: 0, y: 200, height: 1000, selected: false },
      target,
      ...sources
    ],
    connections: sources.map((source, index) => ({
      id: `${source.id}->${target.id}`,
      from: source.id,
      to: target.id,
      label: `Back ${index + 1}`,
      labelKind: "branch-no-match" as const
    }))
  };
}

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

  it("renders a destination arrow on main-canvas and minimap connections", () => {
    const markup = renderToStaticMarkup(
      <FlowNodeCanvas depth="subroutine" nodes={nodes(true)} connections={[jumpConnection]} />
    );

    expect(markup).toContain('marker-end="url(#flow-wire-highlight-destination-arrow)"');
    expect(markup).toContain('marker-end="url(#flow-minimap-wire-highlight-destination-arrow)"');
    expect(markup.match(/data-wire-destination-arrow="true"/g)).toHaveLength(2);
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

  it("routes the Flip 7-shaped upward edge away from an inaccessible negative left corridor", () => {
    const graphNodes = flipSevenShapedNodes();
    const route = buildConnectionRoute(flipSevenBackEdge, graphNodes[1], graphNodes[2], graphNodes);

    expect(route.kind).toBe("orthogonal");
    expect(route.points[2].x).toBeGreaterThan(802);
    expect(route.points.at(-1)?.x).toBe(802);
    expect(route.bounds.minX).toBeGreaterThanOrEqual(302);
  });

  it("moves subsequent overlapping backward routes into distinct outward corridors", () => {
    const fixture = overlappingBackEdges();
    const geometry = buildFlowGraphGeometry(fixture.nodes, fixture.connections);
    const corridorXs = fixture.connections.map(
      (connection) => geometry.routes.get(connection.id)?.corridor?.x
    );

    expect(corridorXs.every((value) => typeof value === "number")).toBe(true);
    expect(corridorXs[1]! - corridorXs[0]!).toBeGreaterThanOrEqual(48);
    expect(corridorXs[2]! - corridorXs[1]!).toBeGreaterThanOrEqual(48);
    expect(new Set(corridorXs).size).toBe(corridorXs.length);
  });

  it("keeps complete routes, labels, and stroke clearance inside normalized world bounds", () => {
    const graphNodes = flipSevenShapedNodes();
    const geometry = buildFlowGraphGeometry(graphNodes, [flipSevenBackEdge]);

    expect(geometry.contentBounds.minX - geometry.originX).toBeGreaterThanOrEqual(0);
    expect(geometry.contentBounds.minY - geometry.originY).toBeGreaterThanOrEqual(0);
    expect(geometry.contentBounds.maxX - geometry.originX).toBeLessThanOrEqual(geometry.width);
    expect(geometry.contentBounds.maxY - geometry.originY).toBeLessThanOrEqual(geometry.height);
    expect(geometry.width).toBeGreaterThan(geometry.contentBounds.maxX - geometry.originX);
    expect(geometry.height).toBeGreaterThan(geometry.contentBounds.maxY - geometry.originY);
  });

  it("normalizes explicit negative connection geometry without changing authored node positions", () => {
    const graphNodes = flipSevenShapedNodes();
    const connection: FlowGraphConnection = {
      ...flipSevenBackEdge,
      id: "negative-explicit-source",
      fromPoint: { x: -80, y: 5500 }
    };
    const geometry = buildFlowGraphGeometry(graphNodes, [connection]);
    const markup = renderToStaticMarkup(
      <FlowNodeCanvas depth="subroutine" nodes={graphNodes} connections={[connection]} />
    );

    expect(geometry.originX).toBeLessThan(-80);
    expect(geometry.contentBounds.minX - geometry.originX).toBeGreaterThan(0);
    expect(markup).toContain(`data-world-origin-x="${geometry.originX}"`);
    expect(graphNodes[1].x).toBe(302);
  });

  it("preserves right-side backward routing and ordinary forward curves", () => {
    const backwardNodes = [
      { ...nodes()[0], id: "lower-right", x: 800, y: 800 },
      { ...nodes()[1], id: "upper-left", x: 200, y: 100 }
    ];
    const backward = buildConnectionRoute(
      { id: "right-back", from: "lower-right", to: "upper-left", label: "Back" },
      backwardNodes[0],
      backwardNodes[1],
      backwardNodes
    );
    const forward = buildConnectionRoute(
      { id: "forward", from: "upper-left", to: "lower-right", label: "Next" },
      backwardNodes[1],
      backwardNodes[0],
      backwardNodes
    );

    expect(backward.kind).toBe("orthogonal");
    expect(backward.points[2].x).toBeGreaterThan(1060);
    expect(backward.points.at(-1)?.x).toBe(460);
    expect(forward.kind).toBe("curve");
    expect(forward.d).toContain(" C ");
  });
});
