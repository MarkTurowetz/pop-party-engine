import { describe, expect, it } from "vitest";
import { actionGraphNodes, momentGraphNodes } from "./flowNodeGraph";
import type { GameFlow } from "../../types/game-data";

function flowFixture(): GameFlow {
  return {
    states: [
      { id: "intro", name: "Intro", nextStateTargetId: "round", actions: [{ id: "a1", name: "Act 1", type: "message" }] },
      { id: "round", name: "Round", actions: [], nodePosition: { x: 500, y: 300 } } as never
    ],
    routeNodes: []
  };
}

describe("flowNodeGraph", () => {
  it("builds one moment node per state with positions and subtitles", () => {
    const nodes = momentGraphNodes(flowFixture(), { selectedStateId: "intro" });

    expect(nodes.map((node) => node.id)).toEqual(["intro", "round"]);
    expect(nodes[0].selected).toBe(true);
    expect(nodes[0].subtitle).toBe("1 actions / Next: Round");
    // saved nodePosition is honoured
    expect({ x: nodes[1].x, y: nodes[1].y }).toEqual({ x: 500, y: 300 });
  });

  it("builds Start + action + Return nodes for the actions depth", () => {
    const flow = flowFixture();
    const nodes = actionGraphNodes(flow.states[0], { selectedActionId: "a1" });

    expect(nodes.map((node) => node.id)).toEqual(["start", "a1", "return"]);
    expect(nodes[0].kind).toBe("system");
    expect(nodes[1].kind).toBe("action");
    expect(nodes[1].selected).toBe(true);
  });

  it("returns no action nodes for a null state", () => {
    expect(actionGraphNodes(null)).toEqual([]);
  });
});
