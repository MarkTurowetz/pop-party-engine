import { describe, expect, it, vi } from "vitest";
import {
  appendFlowRouteTargets,
  clearFlowRouteTargetReferences,
  createMomentEntryNode,
  createRouteActionNode,
  flowRouteNodeTypeName,
  flowRouteTargetName,
  isFlowRouteDecisionNode,
  momentEntryTargetOptions,
  routeGraphTargetOptions
} from "./flowRouteGraph";
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

  it("builds route target names and options with legacy fallbacks", () => {
    const flow: GameFlow = {
      states: [
        { id: "intro", name: "Intro", actions: [] },
        { id: "round-one", name: "Round One", actions: [] }
      ],
      routeNodes: [
        { id: "entry", routeNodeType: "momentEntry", name: "Entry" },
        { id: "action", routeNodeType: "action", name: "Route Action" },
        { id: "decision", routeNodeType: "action", type: "decision", name: "Route Decision" }
      ]
    };

    expect(isFlowRouteDecisionNode(flow.routeNodes?.[2])).toBe(true);
    expect(flowRouteNodeTypeName(flow.routeNodes?.[0])).toBe("Moment Entry");
    expect(flowRouteNodeTypeName(flow.routeNodes?.[1])).toBe("Action");
    expect(flowRouteNodeTypeName(flow.routeNodes?.[2])).toBe("Decision");
    expect(flowRouteTargetName(flow, "")).toBe("No Target");
    expect(flowRouteTargetName(flow, "none")).toBe("None");
    expect(flowRouteTargetName(flow, "round-one")).toBe("Round One");
    expect(flowRouteTargetName(flow, "action")).toBe("Route Action");
    expect(flowRouteTargetName(flow, "missing")).toBe("missing");

    expect(momentEntryTargetOptions(flow, "legacy")).toEqual([
      { id: "", name: "No Target" },
      { id: "intro", name: "Intro" },
      { id: "round-one", name: "Round One" },
      { id: "legacy", name: "legacy" }
    ]);
    expect(routeGraphTargetOptions(flow, "legacy", "action")).toEqual([
      { id: "", name: "No Target" },
      { id: "none", name: "None / Halt" },
      { id: "intro", name: "Moment: Intro" },
      { id: "round-one", name: "Moment: Round One" },
      { id: "entry", name: "Moment Entry: Entry" },
      { id: "decision", name: "Decision: Route Decision" },
      { id: "legacy", name: "legacy" }
    ]);
    expect(appendFlowRouteTargets(flow, [{ id: "", name: "No Next Moment" }], "legacy")).toEqual([
      { id: "", name: "No Next Moment" },
      { id: "entry", name: "Moment Entry: Entry" },
      { id: "action", name: "Action: Route Action" },
      { id: "decision", name: "Decision: Route Decision" },
      { id: "legacy", name: "legacy" }
    ]);
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
    expect(adapter.flowRouteTargetName({ states: [] }, "")).toBe("No Target");
    expect(setAttribute).toHaveBeenCalledWith("data-flow-route-graph-adapter", "module");
  });
});
