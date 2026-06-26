import { describe, expect, it, vi } from "vitest";
import {
  addDefaultFlowAction,
  addDefaultFlowSubAction,
  addFlowState,
  createDefaultFlowState,
  flattenedFlowActionIds,
  flowStateIdsForDelete,
  moveFlowActionInState,
  moveFlowState,
  moveFlowSubAction,
  removeFlowRouteBranch,
  removeFlowRouteNode,
  removeFlowStates,
  removeLayoutState,
  removeSelectedFlowActionsFromList
} from "./flowMutations";
import { installFlowMutationsAdapter } from "./flowMutationsAdapter";
import type { FlowAction, GameFlow } from "../../types/game-data";

describe("Flow mutations", () => {
  it("creates and appends default flow states with legacy IDs and labels", () => {
    const flow: GameFlow = { states: [] };

    const result = addFlowState(flow);

    expect(result).toEqual({
      state: { id: "state-1", name: "New Game State 1", actions: [] },
      index: 0
    });
    expect(flow.states).toEqual([result.state]);
    expect(createDefaultFlowState(3)).toEqual({ id: "state-3", name: "New Game State 3", actions: [] });
  });

  it("inserts a default action after the selected primary action", () => {
    const state = {
      id: "intro",
      actions: [
        { id: "first", type: "presentText" },
        { id: "second", type: "presentText" }
      ]
    };

    const result = addDefaultFlowAction(state, "first");

    expect(result.index).toBe(1);
    expect(result.action).toMatchObject({
      name: "Game Action 3",
      type: "presentText",
      timing: { mode: "E+", seconds: 0 },
      subActions: []
    });
    expect(state.actions.map((action) => action.id)).toEqual(["first", result.action.id, "second"]);
  });

  it("inserts a default sub-action after the selected sub-action", () => {
    const parentAction: FlowAction = {
      id: "parent",
      type: "presentText",
      subActions: [
        { id: "sub-a", type: "setPlayersShown" },
        { id: "sub-b", type: "setPlayersShown" }
      ]
    };

    const result = addDefaultFlowSubAction(parentAction, "sub-a", "intro");

    expect(result.index).toBe(1);
    expect(result.action).toMatchObject({
      name: "Sub-Action 3",
      type: "setPlayersShown",
      timing: { mode: "S+", seconds: 0 },
      subActions: []
    });
    expect(parentAction.subActions?.map((action) => action.id)).toEqual(["sub-a", result.action.id, "sub-b"]);
  });

  it("installs a legacy compatibility adapter with a DOM-visible marker", () => {
    const setAttribute = vi.fn();
    const target = {
      document: {
        documentElement: { setAttribute }
      }
    } as unknown as Window;

    const adapter = installFlowMutationsAdapter(target);

    expect(target.PartyGameFlowMutations).toBe(adapter);
    expect(adapter.createDefaultFlowState(2).id).toBe("state-2");
    expect(setAttribute).toHaveBeenCalledWith("data-flow-mutations-adapter", "module");
  });

  it("flattens top-level, sub-action, and decision branch IDs", () => {
    const decision: FlowAction = {
      id: "decision",
      type: "decision",
      branches: [{ id: "branch-a", type: "branch" }]
    };
    const actions: FlowAction[] = [
      { id: "present", type: "presentText", subActions: [{ id: "sub-a", type: "setPlayersShown" }] },
      decision
    ];

    expect(flattenedFlowActionIds(actions)).toEqual(["present", "sub-a", "decision", "branch-a"]);
    expect(flattenedFlowActionIds([decision], { ensureDecisionBranches: () => [{ id: "branch-b", type: "branch" }] })).toEqual(["decision", "branch-b"]);
  });

  it("removes selected top-level, sub-action, and branch IDs from action lists", () => {
    const actions: FlowAction[] = [
      { id: "remove-me", type: "presentText" },
      {
        id: "keep-parent",
        type: "presentText",
        subActions: [
          { id: "sub-a", type: "setPlayersShown" },
          { id: "sub-b", type: "setPlayersShown" }
        ]
      },
      {
        id: "decision",
        type: "decision",
        branches: [
          { id: "branch-a", type: "branch" },
          { id: "branch-b", type: "branch" }
        ]
      }
    ];

    const result = removeSelectedFlowActionsFromList(actions, new Set(["remove-me", "sub-a", "branch-b"]));

    expect(result.removedIds).toEqual(["remove-me", "sub-a", "branch-b"]);
    expect(result.actions.map((action) => action.id)).toEqual(["keep-parent", "decision"]);
    expect(result.actions[0]?.subActions?.map((action) => action.id)).toEqual(["sub-b"]);
    expect(result.actions[1]?.branches?.map((action) => action.id)).toEqual(["branch-a"]);
  });

  it("moves flow states before and after target states", () => {
    const flow: GameFlow = {
      states: [
        { id: "lobby", actions: [] },
        { id: "one", actions: [] },
        { id: "two", actions: [] },
        { id: "three", actions: [] }
      ]
    };

    expect(moveFlowState(flow, "three", "one")).toMatchObject({
      moved: true,
      fromIndex: 3,
      toIndex: 1
    });
    expect(flow.states.map((state) => state.id)).toEqual(["lobby", "three", "one", "two"]);

    expect(moveFlowState(flow, "three", "two", true)).toMatchObject({
      moved: true,
      fromIndex: 1,
      toIndex: 3
    });
    expect(flow.states.map((state) => state.id)).toEqual(["lobby", "one", "two", "three"]);
  });

  it("moves top-level actions and leaves invalid moves unchanged", () => {
    const state = {
      id: "intro",
      actions: [
        { id: "a", type: "presentText" },
        { id: "b", type: "presentText" },
        { id: "c", type: "presentText" }
      ]
    };

    expect(moveFlowActionInState(state, "a", "c", true)).toMatchObject({
      moved: true,
      fromIndex: 0,
      toIndex: 2
    });
    expect(state.actions.map((action) => action.id)).toEqual(["b", "c", "a"]);

    expect(moveFlowActionInState(state, "missing", "b")).toEqual({
      moved: false,
      item: null,
      fromIndex: -1,
      toIndex: 0
    });
    expect(state.actions.map((action) => action.id)).toEqual(["b", "c", "a"]);
  });

  it("moves sub-actions within a parent action", () => {
    const parentAction: FlowAction = {
      id: "parent",
      type: "presentText",
      subActions: [
        { id: "sub-a", type: "setPlayersShown" },
        { id: "sub-b", type: "setPlayersShown" },
        { id: "sub-c", type: "setPlayersShown" }
      ]
    };

    expect(moveFlowSubAction(parentAction, "sub-c", "sub-a")).toMatchObject({
      moved: true,
      fromIndex: 2,
      toIndex: 0
    });
    expect(parentAction.subActions?.map((action) => action.id)).toEqual(["sub-c", "sub-a", "sub-b"]);
    expect(moveFlowSubAction(parentAction, "sub-a", "sub-a").moved).toBe(false);
  });

  it("resolves selected flow state ids for delete with legacy protected-state rules", () => {
    const flow: GameFlow = {
      states: [
        { id: "lobby", actions: [] },
        { id: "intro", actions: [] },
        { id: "round-one", actions: [] },
        { id: "round-two", actions: [] }
      ]
    };

    expect(flowStateIdsForDelete(flow, {
      flowNodeDepth: "moments",
      selectedFlowActionIds: ["round-one", "missing"],
      selectedFlowStateId: "intro"
    })).toEqual(["round-one"]);
    expect(flowStateIdsForDelete(flow, {
      flowNodeDepth: "actions",
      selectedFlowActionIds: ["round-one"],
      selectedFlowStateId: "round-two"
    })).toEqual(["round-two"]);
  });

  it("removes flow states and returns the next legacy selection id", () => {
    const flow: GameFlow = {
      states: [
        { id: "lobby", actions: [] },
        { id: "round-one", actions: [] },
        { id: "round-two", actions: [] },
        { id: "round-three", actions: [] }
      ]
    };

    const result = removeFlowStates(flow, ["round-two"]);

    expect(result).toEqual({ removedIds: ["round-two"], firstDeletedIndex: 2, nextStateId: "round-three" });
    expect(flow.states.map((state) => state.id)).toEqual(["lobby", "round-one", "round-three"]);
  });

  it("removes layout states without changing unrelated layout data", () => {
    const layouts = {
      canvas: { width: 1920, height: 1080 },
      global: { id: "global", elements: [] },
      states: [
        { id: "round-one", elements: [] },
        { id: "round-two", elements: [] }
      ]
    };

    expect(removeLayoutState(layouts, "round-one")).toBe(true);
    expect(removeLayoutState(layouts, "missing")).toBe(false);
    expect(layouts.states.map((state) => state.id)).toEqual(["round-two"]);
  });

  it("removes route branches and blocks no-match branches", () => {
    const routeNode = {
      id: "route-a",
      branches: [
        { id: "hit", type: "branch" },
        { id: "no-match", type: "noMatch" }
      ]
    };

    expect(removeFlowRouteBranch(routeNode, "no-match")).toEqual({
      removed: false,
      blocked: true,
      branchMissing: false,
      branchId: "no-match"
    });
    expect(removeFlowRouteBranch(routeNode, "hit")).toEqual({
      removed: true,
      blocked: false,
      branchMissing: false,
      branchId: "hit"
    });
    expect(routeNode.branches.map((branch) => branch.id)).toEqual(["no-match"]);
    expect(removeFlowRouteBranch(routeNode, "missing").branchMissing).toBe(true);
  });

  it("removes route nodes from the provided route graph list", () => {
    const flow: GameFlow = {
      states: [],
      routeNodes: [
        { id: "route-a" },
        { id: "route-b" }
      ]
    };

    expect(removeFlowRouteNode(flow, "route-a")).toEqual({ removed: true, nodeId: "route-a" });
    expect(flow.routeNodes?.map((node) => node.id)).toEqual(["route-b"]);
    expect(removeFlowRouteNode(flow, "missing")).toEqual({ removed: false, nodeId: "missing" });
  });
});
