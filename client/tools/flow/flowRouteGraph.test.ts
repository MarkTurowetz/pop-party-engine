import { describe, expect, it, vi } from "vitest";
import { clearFlowRouteTargetReferences, createMomentEntryNode, createRouteActionNode } from "./flowRouteGraph";
import { installFlowRouteGraphAdapter } from "./flowRouteGraphAdapter";
import type { FlowAction, GameFlow } from "../../types/game-data";

describe("Flow route graph model helpers", () => {
  it("creates moment entry nodes with legacy defaults and target fallback", () => {
    const flow: GameFlow = {
      states: [
        { id: "intro", name: "Intro", actions: [] }
      ],
      routeNodes: [{ id: "existing" }]
    };
    const defaultNodePosition = vi.fn(() => ({ x: 860, y: 80 }));

    const node = createMomentEntryNode(flow, "missing", {
      defaultNodePosition,
      idFactory: () => "moment-entry-test"
    });

    expect(node).toEqual({
      id: "moment-entry-test",
      routeNodeType: "momentEntry",
      name: "Moment Entry 2",
      targetStateId: "intro",
      nodePosition: { x: 860, y: 80 }
    });
    expect(defaultNodePosition).toHaveBeenCalledWith(1, 2, 860, 80, 320, 190);
  });

  it("creates route action nodes with legacy action defaults", () => {
    const flow: GameFlow = {
      states: [],
      routeNodes: [
        { id: "entry", routeNodeType: "momentEntry" },
        { id: "action-one", routeNodeType: "action" }
      ]
    };

    const node = createRouteActionNode(flow, null, {
      defaultNodePosition: () => ({ x: 860, y: 600 }),
      idFactory: () => "route-action-test"
    });

    expect(node).toMatchObject({
      id: "route-action-test",
      routeNodeType: "action",
      name: "Action 2",
      type: "presentText",
      timing: { mode: "E+", seconds: 0 },
      text: "Presented text",
      textTarget: "",
      instant: false,
      isShown: true,
      subActions: [],
      nextTargetNodeId: "",
      nodePosition: { x: 860, y: 600 }
    });
  });

  it("clears state, route node, branch, and action targets", () => {
    const decisionBranches: FlowAction[] = [
      { id: "hit", type: "branch", targetNodeId: "route-a" },
      { id: "miss", type: "noMatch", targetNodeId: "keep-me" }
    ];
    const flow: GameFlow = {
      states: [
        { id: "intro", actions: [], nextStateTargetId: "route-a" },
        { id: "keep", actions: [], nextStateTargetId: "keep-me" }
      ],
      routeNodes: [
        { id: "entry", routeNodeType: "momentEntry", targetStateId: "route-a" },
        { id: "decision", routeNodeType: "decision", branches: decisionBranches },
        { id: "action", routeNodeType: "action", type: "presentText", nextTargetNodeId: "route-a" }
      ]
    };

    clearFlowRouteTargetReferences(flow, "route-a", {
      ensureDecisionBranches: (node) => (node.branches as FlowAction[]) || [],
      routeBranchTargetField: "targetNodeId"
    });

    expect(flow.states[0]?.nextStateTargetId).toBe("");
    expect(flow.states[1]?.nextStateTargetId).toBe("keep-me");
    expect(flow.routeNodes?.[0]?.targetStateId).toBe("");
    expect(decisionBranches[0]?.targetNodeId).toBe("");
    expect(decisionBranches[1]?.targetNodeId).toBe("keep-me");
    expect(flow.routeNodes?.[2]?.nextTargetNodeId).toBe("");
  });

  it("installs a legacy compatibility adapter with a DOM-visible marker", () => {
    const setAttribute = vi.fn();
    const target = {
      document: {
        documentElement: { setAttribute }
      }
    } as unknown as Window;

    const adapter = installFlowRouteGraphAdapter(target);

    expect(target.PartyGameFlowRouteGraph).toBe(adapter);
    expect(adapter.createRouteActionNode({ states: [] }, null, { idFactory: () => "route-action" }).id).toBe("route-action");
    expect(setAttribute).toHaveBeenCalledWith("data-flow-route-graph-adapter", "module");
  });
});
