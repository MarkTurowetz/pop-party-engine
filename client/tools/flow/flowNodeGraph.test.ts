import { describe, expect, it } from "vitest";
import {
  rootSubroutineGraphConnections,
  rootSubroutineGraphNodes,
  rootSubroutineNodeExits,
  subroutineGraphConnections,
  subroutineGraphNodes,
  subroutineNodeExits,
  optimizedVerticalNodePositions,
  decisionBranchGraphNodeId
} from "./flowNodeGraph";
import type { GameFlow } from "../../types/game-data";

function flowFixture(): GameFlow {
  return {
    states: [
      {
        id: "intro",
        name: "Intro",
        nextStateTargetId: "round",
        actions: [{ id: "a1", name: "Act 1", type: "message" }]
      },
      { id: "round", name: "Round", actions: [], nodePosition: { x: 500, y: 300 } } as never
    ],
    routeNodes: []
  };
}

describe("flowNodeGraph", () => {
  it("builds one root subroutine node per state with positions and subtitles", () => {
    const nodes = rootSubroutineGraphNodes(flowFixture(), { selectedStateId: "intro" });

    expect(nodes.map((node) => node.id)).toEqual(["intro", "round"]);
    expect(nodes[0].selected).toBe(true);
    expect(nodes[0].subtitle).toBe("1 actions / Next: Round");
    // saved nodePosition is honoured
    expect({ x: nodes[1].x, y: nodes[1].y }).toEqual({ x: 500, y: 300 });
  });

  it("builds Start + action + Return nodes inside a subroutine", () => {
    const flow = flowFixture();
    const nodes = subroutineGraphNodes(flow.states[0], { selectedActionId: "a1" });

    expect(nodes.map((node) => node.id)).toEqual(["start", "a1", "return"]);
    expect(nodes[0].kind).toBe("system");
    expect(nodes[1].kind).toBe("action");
    expect(nodes[1].selected).toBe(true);
  });

  it("returns no action nodes for a null state", () => {
    expect(subroutineGraphNodes(null)).toEqual([]);
  });

  it("connects root subroutines by nextStateTargetId", () => {
    const connections = rootSubroutineGraphConnections(flowFixture());
    expect(connections).toEqual([
      { id: "intro->round", from: "intro", to: "round", label: "Next" }
    ]);
  });

  it("connects start->entry and action exits inside a subroutine", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          entryTargetActionId: "a1",
          actions: [
            { id: "a1", name: "A1", type: "message", nextTargetActionId: "a2" },
            { id: "a2", name: "A2", type: "message", nextTargetActionId: "return" }
          ]
        } as never
      ],
      routeNodes: []
    };
    const connections = subroutineGraphConnections(flow.states[0]);
    expect(connections).toEqual([
      { id: "start->a1", from: "start", to: "a1", label: "Entry" },
      { id: "a1->a2:Next", from: "a1", to: "a2", label: "Next" },
      { id: "a2->return:Next", from: "a2", to: "return", label: "Next" }
    ]);
  });

  it("exposes a Next exit per root subroutine", () => {
    const exits = rootSubroutineNodeExits(flowFixture());
    expect(
      exits.map((exit) => ({ node: exit.nodeId, kind: exit.kind, target: exit.currentTarget }))
    ).toEqual([
      { node: "intro", kind: "nextSubroutine", target: "round" },
      { node: "round", kind: "nextSubroutine", target: "" }
    ]);
  });

  it("exposes Start entry + per-type action exits inside a subroutine", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          entryTargetActionId: "a1",
          actions: [
            { id: "a1", name: "A1", type: "presentText", stageClickTargetActionId: "a2" },
            { id: "a2", name: "A2", type: "textSubmissionInput", timerEndTargetActionId: "return" }
          ]
        } as never
      ],
      routeNodes: []
    };
    const exits = subroutineNodeExits(flow.states[0], (type) => type === "textSubmissionInput");
    expect(exits.map((exit) => `${exit.nodeId}:${exit.label}=${exit.currentTarget}`)).toEqual([
      "start:Entry=a1",
      "a1:Screen Click=a2",
      "a2:Timer Ends=return",
      "a2:Answers="
    ]);
  });

  it("renders decision branches as selectable stacked nodes with their own target exits", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          actions: [
            {
              id: "decision",
              name: "Decision",
              type: "decision",
              branches: [
                { id: "hit", type: "hit", value: "3", targetActionId: "a1" },
                { id: "no-match", type: "noMatch", targetActionId: "return" }
              ]
            },
            { id: "a1", name: "A1", type: "message" }
          ]
        } as never
      ],
      routeNodes: []
    };
    const nodes = subroutineGraphNodes(flow.states[0], {
      selectedActionId: decisionBranchGraphNodeId("decision", "hit")
    });
    const branchNode = nodes.find((node) => node.id === "decision:branch:hit");

    expect(branchNode).toMatchObject({
      kind: "branch",
      parentNodeId: "decision",
      branchId: "hit",
      draggable: false,
      selected: true,
      height: 34
    });
    expect(branchNode?.y).toBeGreaterThan(nodes.find((node) => node.id === "decision")?.y || 0);

    const exits = subroutineNodeExits(flow.states[0], () => false);
    expect(exits.find((exit) => exit.branchId === "hit")).toMatchObject({
      nodeId: "decision",
      viewNodeId: "decision:branch:hit",
      label: "Target",
      currentTarget: "a1",
      portSide: "right"
    });

    expect(subroutineGraphConnections(flow.states[0])).toEqual([
      { id: "decision->decision:branch:hit", from: "decision", to: "decision:branch:hit", label: "Hit 3" },
      {
        id: "decision:branch:hit->a1",
        from: "decision:branch:hit",
        to: "a1",
        label: "Target",
        fromPoint: { x: 500, y: 306 }
      },
      {
        id: "decision->decision:branch:no-match",
        from: "decision",
        to: "decision:branch:no-match",
        label: "No Match"
      },
      {
        id: "decision:branch:no-match->return",
        from: "decision:branch:no-match",
        to: "return",
        label: "Target",
        fromPoint: { x: 500, y: 306 }
      }
    ]);
  });

  it("selects branch nodes by parent-qualified graph id", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          actions: [
            {
              id: "decision-a",
              name: "Decision A",
              type: "decision",
              branches: [{ id: "no-match", type: "noMatch", targetActionId: "" }]
            },
            {
              id: "decision-b",
              name: "Decision B",
              type: "decision",
              branches: [{ id: "no-match", type: "noMatch", targetActionId: "" }]
            }
          ]
        } as never
      ],
      routeNodes: []
    };

    const nodes = subroutineGraphNodes(flow.states[0], {
      selectedActionId: decisionBranchGraphNodeId("decision-b", "no-match")
    });
    expect(
      nodes
        .filter((node) => node.kind === "branch")
        .map((node) => [node.id, node.selected])
    ).toEqual([
      ["decision-a:branch:no-match", false],
      ["decision-b:branch:no-match", true]
    ]);
  });

  it("does not draw stale generic next wires for event-driven actions", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          actions: [
            {
              id: "present",
              name: "Present",
              type: "presentText",
              stageClickTargetActionId: "clicked",
              nextTargetActionId: "return"
            },
            { id: "clicked", name: "Clicked", type: "message" }
          ]
        } as never
      ],
      routeNodes: []
    };

    expect(subroutineGraphConnections(flow.states[0])).toEqual([
      { id: "present->clicked:Screen Click", from: "present", to: "clicked", label: "Screen Click" }
    ]);
  });

  it("optimizes action nodes by reachable flow order, not action array order", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "lobby",
          name: "Lobby",
          entryTargetActionId: "setup",
          actions: [
            {
              id: "countdown",
              name: "On Countdown Complete",
              type: "transitionState",
              nextTargetActionId: "wipe-on"
            },
            { id: "setup", name: "Setup Game", type: "setupGame", nextTargetActionId: "wipe-off" },
            {
              id: "wipe-on",
              name: "Set Wipe Shown",
              type: "setWipeShown",
              nextTargetActionId: "return"
            },
            {
              id: "wipe-off",
              name: "Set Wipe Shown 1",
              type: "setWipeShown",
              nextTargetActionId: "countdown"
            }
          ]
        } as never
      ],
      routeNodes: []
    };
    const nodes = subroutineGraphNodes(flow.states[0]);
    const connections = subroutineGraphConnections(flow.states[0]);

    expect(
      optimizedVerticalNodePositions(nodes, connections, "subroutine").map(
        (position) => position.nodeId
      )
    ).toEqual(["start", "setup", "wipe-off", "countdown", "wipe-on", "return"]);
  });
});
