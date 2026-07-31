import { describe, expect, it } from "vitest";
import {
  rootSubroutineGraphConnections,
  rootSubroutineGraphNodes,
  rootSubroutineNodeExits,
  subroutineGraphConnections,
  subroutineGraphNodes,
  subroutineNodeExits,
  optimizedVerticalNodePositions,
  translatedSelectedNodePositions,
  decisionBranchGraphNodeId
} from "./flowNodeGraph";
import {
  rootFlowGraphConnections,
  rootFlowGraphNodes,
  rootFlowNodeExits,
  rootFlowTargetOptions
} from "./flowRootGraph";
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
  it("builds one root game-state node per state with positions and subtitles", () => {
    const nodes = rootSubroutineGraphNodes(flowFixture(), { selectedStateId: "intro" });

    expect(nodes.map((node) => node.id)).toEqual(["intro", "round"]);
    expect(nodes[0].selected).toBe(true);
    expect(nodes[0].kind).toBe("gameState");
    expect(nodes[0].subtitle).toBe("1 actions / Next: Round");
    // saved nodePosition is honoured
    expect({ x: nodes[1].x, y: nodes[1].y }).toEqual({ x: 500, y: 300 });
  });

  it("identifies root flow states as game-state invocations", () => {
    const nodes = rootFlowGraphNodes(flowFixture());

    expect(nodes.find((node) => node.id === "intro")).toMatchObject({
      kind: "gameState",
      valueBadge: { text: "Game State" }
    });
    expect(rootFlowTargetOptions(flowFixture(), "intro")).toContainEqual({
      id: "round",
      label: "Game State: Round"
    });
  });

  it("translates every selected draggable root node as one group", () => {
    const nodes = rootSubroutineGraphNodes(flowFixture(), {
      selectedActionIds: ["intro", "round"]
    });

    expect(translatedSelectedNodePositions(nodes, "intro", 180, 140)).toEqual([
      { nodeId: "intro", x: 180, y: 140 },
      { nodeId: "round", x: 600, y: 360 }
    ]);
  });

  it("builds Start + action + End nodes inside a game state", () => {
    const flow = flowFixture();
    const nodes = subroutineGraphNodes(flow.states[0], { selectedActionId: "a1" });

    expect(nodes.map((node) => node.id)).toEqual(["start", "a1", "return"]);
    expect(nodes[0].kind).toBe("system");
    expect(nodes[1].kind).toBe("action");
    expect(nodes[1].selected).toBe(true);
    expect(nodes[0].subtitle).toBe("Game state entry");
    expect(nodes[2]).toMatchObject({
      title: "End",
      subtitle: "Advance to next game state"
    });
  });

  it("keeps Start + Return lifecycle for a callable subroutine", () => {
    const nodes = subroutineGraphNodes({
      id: "collect-bid",
      name: "Collect Bid",
      type: "subroutine",
      actions: []
    });

    expect(nodes[0].subtitle).toBe("Subroutine entry");
    expect(nodes[1]).toMatchObject({
      title: "Return",
      subtitle: "Back to parent subroutine"
    });
  });

  it("attaches boolean value badges to action graph nodes", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          actions: [
            {
              id: "wipe",
              name: "Set Wipe Shown",
              type: "setWipeShown",
              isShown: false,
              timing: { mode: "E+", seconds: 0 }
            }
          ]
        } as never
      ],
      routeNodes: []
    };

    expect(subroutineGraphNodes(flow.states[0]).find((node) => node.id === "wipe")).toMatchObject({
      timing: "E+ 0.00s",
      valueBadge: { text: "Hide", className: "is-hide" }
    });
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
      {
        id: "decision->decision:branch:hit",
        from: "decision",
        to: "decision:branch:hit",
        label: "Hit 3"
      },
      {
        id: "decision:branch:hit->a1",
        from: "decision:branch:hit",
        to: "a1",
        label: "3",
        labelKind: "branch-hit",
        fromAnchorNodeId: "decision:branch:no-match"
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
        label: "No Match",
        labelKind: "branch-no-match",
        fromAnchorNodeId: "decision:branch:no-match"
      }
    ]);
  });

  it("renders sub-actions as sorted child nodes and anchors parent exits to the last sub-action", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          actions: [
            {
              id: "parent",
              name: "Parent",
              type: "message",
              nextTargetActionId: "target",
              subActions: [
                {
                  id: "sub-late",
                  name: "Late",
                  type: "setPlayersShown",
                  timing: { mode: "S+", seconds: 2 }
                },
                {
                  id: "sub-early",
                  name: "Early",
                  type: "setPlayersShown",
                  timing: { mode: "S+", seconds: 0.5 }
                },
                {
                  id: "sub-same",
                  name: "Same",
                  type: "setPlayersShown",
                  timing: { mode: "S+", seconds: 0.5 }
                }
              ]
            },
            { id: "target", name: "Target", type: "message" }
          ]
        } as never
      ],
      routeNodes: []
    };
    const nodes = subroutineGraphNodes(flow.states[0], { selectedActionId: "sub-early" });
    const subActionNodes = nodes.filter((node) => node.kind === "subAction");

    expect(subActionNodes.map((node) => node.id)).toEqual(["sub-early", "sub-same", "sub-late"]);
    expect(subActionNodes[0]).toMatchObject({
      parentNodeId: "parent",
      selected: true,
      title: "Early",
      timing: "S+ 0.50s",
      draggable: false,
      x: 340,
      width: 260,
      height: 34
    });

    expect(
      subroutineNodeExits(flow.states[0], () => false).find((exit) => exit.nodeId === "parent")
    ).toMatchObject({
      nodeId: "parent",
      viewNodeId: "sub-late",
      portSide: "right",
      label: "Next",
      currentTarget: "target"
    });

    expect(subroutineGraphConnections(flow.states[0])).toContainEqual({
      id: "parent->target:Next",
      from: "parent",
      to: "target",
      label: "Next",
      labelKind: undefined,
      visibleWhenSelected: undefined,
      fromAnchorNodeId: "sub-late"
    });
  });

  it("marks jump-node wires as selected-only previews", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          actions: [
            { id: "jump", name: "Jump", type: "jumpNode", jumpTargetActionId: "target" },
            { id: "target", name: "Target", type: "message" }
          ]
        } as never
      ],
      routeNodes: []
    };

    expect(subroutineGraphConnections(flow.states[0])).toContainEqual({
      id: "jump->target:Jump",
      from: "jump",
      to: "target",
      label: "Jump",
      labelKind: "jump-preview",
      visibleWhenSelected: true
    });
  });

  it("uses jump targets and branch labels in the root flow graph", () => {
    const flow: GameFlow = {
      states: [],
      routeNodes: [
        {
          id: "jump-root",
          routeNodeType: "action",
          type: "jumpNode",
          jumpTargetActionId: "target-root"
        },
        {
          id: "decision-root",
          routeNodeType: "action",
          type: "decision",
          branches: [{ id: "code", type: "code", code: "x > 3", targetNodeId: "target-root" }]
        },
        { id: "target-root", routeNodeType: "action", type: "presentText" }
      ]
    };

    expect(rootFlowNodeExits(flow).find((exit) => exit.nodeId === "jump-root")).toMatchObject({
      label: "Jump",
      field: "jumpTargetActionId",
      currentTarget: "target-root"
    });
    expect(rootFlowGraphConnections(flow)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "jump-root",
          to: "target-root",
          label: "Jump",
          labelKind: "jump-preview",
          visibleWhenSelected: true
        }),
        expect.objectContaining({
          from: "decision-root:branch:code",
          to: "target-root",
          label: "x > 3",
          labelKind: "branch-code"
        })
      ])
    );
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
      nodes.filter((node) => node.kind === "branch").map((node) => [node.id, node.selected])
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

  it("optimizes branch paths horizontally and rejoins shared targets near center", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "presentation",
          name: "Presentation",
          entryTargetActionId: "present",
          actions: [
            {
              id: "present",
              name: "Present Text",
              type: "presentText",
              stageClickTargetActionId: "decision"
            },
            {
              id: "decision",
              name: "Decision",
              type: "decision",
              branches: [
                { id: "hit", type: "hit", value: "3", targetActionId: "present-1" },
                { id: "code", type: "code", code: "x > 3", targetActionId: "present-2" },
                { id: "no-match", type: "noMatch", targetActionId: "wipe" }
              ]
            },
            {
              id: "present-1",
              name: "Present Text 1",
              type: "presentText",
              stageClickTargetActionId: "wipe"
            },
            {
              id: "present-2",
              name: "Present Text 2",
              type: "presentText",
              stageClickTargetActionId: "wipe"
            },
            {
              id: "wipe",
              name: "Set Wipe Shown",
              type: "setWipeShown",
              nextTargetActionId: "return"
            }
          ]
        } as never
      ],
      routeNodes: []
    };
    const nodes = subroutineGraphNodes(flow.states[0]);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const connections = subroutineGraphConnections(flow.states[0]);
    const updates = optimizedVerticalNodePositions(nodes, connections, "subroutine");
    const positionById = new Map(updates.map((position) => [position.nodeId, position]));
    const center = (nodeId: string) => {
      const node = nodeById.get(nodeId);
      const position = positionById.get(nodeId);
      return Number(position?.x || 0) + Number(node?.width || 0) / 2;
    };

    expect(updates.some((position) => position.nodeId.includes(":branch:"))).toBe(false);
    expect(positionById.get("present-1")?.y).toBe(positionById.get("present-2")?.y);
    expect(center("present-1")).toBeLessThan(center("decision") - 100);
    expect(center("present-2")).toBeGreaterThan(center("decision") + 100);
    expect(Math.abs(center("wipe") - center("decision"))).toBeLessThan(40);
    expect(Number(positionById.get("wipe")?.y)).toBeGreaterThan(
      Number(positionById.get("present-1")?.y)
    );
  });

  it("keeps a detour branch separated when another branch jumps directly to its later join", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "crafting",
          name: "Crafting",
          entryTargetActionId: "decision",
          actions: [
            {
              id: "decision",
              name: "Decision",
              type: "decision",
              branches: [
                { id: "code", type: "code", code: "x == 0", targetActionId: "join" },
                { id: "no-match", type: "noMatch", targetActionId: "reveal" }
              ]
            },
            {
              id: "reveal",
              name: "Set Player Answers Shown",
              type: "setPlayerAnswersShown",
              nextTargetActionId: "correctness"
            },
            {
              id: "correctness",
              name: "Reveal Player Answer Correctness",
              type: "revealPlayerAnswerCorrectness",
              nextTargetActionId: "points"
            },
            {
              id: "points",
              name: "Show Points",
              type: "showPoints",
              nextTargetActionId: "join"
            },
            {
              id: "join",
              name: "Set Wipe Shown",
              type: "setWipeShown",
              nextTargetActionId: "return"
            }
          ]
        } as never
      ],
      routeNodes: []
    };
    const nodes = subroutineGraphNodes(flow.states[0]);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const positions = new Map(
      optimizedVerticalNodePositions(
        nodes,
        subroutineGraphConnections(flow.states[0]),
        "subroutine"
      ).map((position) => [position.nodeId, position])
    );
    const center = (nodeId: string) => {
      const node = nodeById.get(nodeId);
      const position = positions.get(nodeId);
      return Number(position?.x || 0) + Number(node?.width || 0) / 2;
    };

    expect(center("reveal")).toBeLessThan(center("decision") - 100);
    expect(center("correctness")).toBe(center("reveal"));
    expect(center("points")).toBe(center("reveal"));
    expect(Math.abs(center("join") - center("decision"))).toBeLessThan(40);
    expect(Number(positions.get("join")?.y)).toBeGreaterThan(Number(positions.get("points")?.y));
  });

  it("optimizes vertical spacing around the full parent and child-row block", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "s",
          name: "S",
          entryTargetActionId: "parent",
          actions: [
            {
              id: "parent",
              name: "Parent",
              type: "message",
              nextTargetActionId: "after",
              subActions: [
                {
                  id: "sub-a",
                  name: "Sub A",
                  type: "setPlayersShown",
                  timing: { mode: "S+", seconds: 0 }
                },
                {
                  id: "sub-b",
                  name: "Sub B",
                  type: "setPlayersShown",
                  timing: { mode: "S+", seconds: 1 }
                }
              ]
            },
            { id: "after", name: "After", type: "message", nextTargetActionId: "return" }
          ]
        } as never
      ],
      routeNodes: []
    };
    const nodes = subroutineGraphNodes(flow.states[0]);
    const parent = nodes.find((node) => node.id === "parent");
    const children = nodes.filter((node) => node.parentNodeId === "parent");
    const parentBlockHeight =
      Math.max(
        ...children.map((node) => node.y + node.height),
        (parent?.y || 0) + (parent?.height || 0)
      ) - (parent?.y || 0);
    const positions = new Map(
      optimizedVerticalNodePositions(
        nodes,
        subroutineGraphConnections(flow.states[0]),
        "subroutine"
      ).map((position) => [position.nodeId, position])
    );

    expect(positions.has("sub-a")).toBe(false);
    expect(positions.has("sub-b")).toBe(false);
    expect(Number(positions.get("after")?.y) - Number(positions.get("parent")?.y)).toBe(
      parentBlockHeight + 70
    );
  });
});
