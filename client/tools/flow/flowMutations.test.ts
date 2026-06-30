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
  refreshFlowActionName,
  renameFlowState,
  removeFlowRouteBranch,
  removeFlowRouteNode,
  removeFlowStates,
  removeLayoutState,
  removeSelectedFlowActionsFromList,
  setFlowStateEntryTarget,
  setFlowStateNextTarget,
  setFlowStateVotingSource
} from "./flowMutations";
import type { FlowAction, FlowState, GameFlow } from "../../types/game-data";

describe("Flow mutations", () => {
  it("creates and appends default flow states with legacy IDs and labels", () => {
    const flow: GameFlow = { states: [] };

    const result = addFlowState(flow);

    expect(result).toEqual({
      state: { id: "state-1", name: "New Game State 1", actions: [] },
      index: 0
    });
    expect(flow.states).toEqual([result.state]);
    expect(createDefaultFlowState(3)).toEqual({
      id: "state-3",
      name: "New Game State 3",
      actions: []
    });
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
      name: "Set Players Shown",
      type: "setPlayersShown",
      timing: { mode: "S+", seconds: 0 },
      subActions: []
    });
    expect(parentAction.subActions?.map((action) => action.id)).toEqual([
      "sub-a",
      result.action.id,
      "sub-b"
    ]);
  });

  it("uses the action-type label when inserting a default sub-action", () => {
    const parentAction: FlowAction = { id: "parent", type: "presentText", subActions: [] };

    const result = addDefaultFlowSubAction(parentAction, "", "intro", {
      nameForType: (type) => (type === "setPlayersShown" ? "Show Players" : type)
    });

    expect(result.action.name).toBe("Show Players");
  });

  it("flattens top-level, sub-action, and decision branch IDs", () => {
    const decision: FlowAction = {
      id: "decision",
      type: "decision",
      branches: [{ id: "branch-a", type: "branch" }]
    };
    const actions: FlowAction[] = [
      {
        id: "present",
        type: "presentText",
        subActions: [{ id: "sub-a", type: "setPlayersShown" }]
      },
      {
        id: "routine",
        type: "subroutine",
        actions: [{ id: "inside-routine", type: "presentText" }]
      },
      decision
    ];

    expect(flattenedFlowActionIds(actions)).toEqual([
      "present",
      "sub-a",
      "routine",
      "inside-routine",
      "decision",
      "branch-a"
    ]);
    expect(
      flattenedFlowActionIds([decision], {
        ensureDecisionBranches: () => [{ id: "branch-b", type: "branch" }]
      })
    ).toEqual(["decision", "branch-b"]);
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
        id: "routine",
        type: "subroutine",
        actions: [
          { id: "nested-a", type: "setPlayersShown" },
          { id: "nested-b", type: "setPlayersShown" }
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

    const result = removeSelectedFlowActionsFromList(
      actions,
      new Set(["remove-me", "sub-a", "nested-a", "branch-b"])
    );

    expect(result.removedIds).toEqual(["remove-me", "sub-a", "nested-a", "branch-b"]);
    expect(result.actions.map((action) => action.id)).toEqual([
      "keep-parent",
      "routine",
      "decision"
    ]);
    expect(result.actions[0]?.subActions?.map((action) => action.id)).toEqual(["sub-b"]);
    expect(result.actions[1]?.actions?.map((action) => action.id)).toEqual(["nested-b"]);
    expect(result.actions[2]?.branches?.map((action) => action.id)).toEqual(["branch-a"]);
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
    expect(parentAction.subActions?.map((action) => action.id)).toEqual([
      "sub-c",
      "sub-a",
      "sub-b"
    ]);
    expect(moveFlowSubAction(parentAction, "sub-a", "sub-a").moved).toBe(false);
  });

  it("renames states while preserving protected legacy ids", () => {
    const makeFlowId = vi.fn((label: unknown, fallback: string) =>
      String(label || fallback)
        .toLowerCase()
        .replace(/\s+/g, "-")
    );
    const state = { id: "round-one", name: "Round One", actions: [] };

    expect(renameFlowState(state, "Bonus Round", { makeFlowId })).toEqual({
      oldId: "round-one",
      newId: "bonus-round",
      name: "Bonus Round"
    });
    expect(state).toMatchObject({ id: "bonus-round", name: "Bonus Round" });

    const intro = { id: "intro", name: "Intro", actions: [] };
    expect(renameFlowState(intro, "Opening", { makeFlowId })).toEqual({
      oldId: "intro",
      newId: "intro",
      name: "Opening"
    });
  });

  it("updates state editor targets with legacy empty-value behavior", () => {
    const state: Partial<FlowState> = { id: "round-one", actions: [] };

    setFlowStateNextTarget(state, "round-two");
    setFlowStateEntryTarget(state, "start-action");
    setFlowStateVotingSource(state, "lobby");
    expect(state).toMatchObject({
      nextStateTargetId: "round-two",
      entryTargetActionId: "start-action",
      votingSourceStateId: "lobby"
    });

    setFlowStateVotingSource(state, "");
    expect(state.votingSourceStateId).toBeUndefined();
  });

  it("refreshes action names through a supplied type-name resolver", () => {
    const state = { id: "intro", actions: [] };
    const action = { id: "a", type: "presentText", name: "Old Name" };

    expect(refreshFlowActionName(state, action, { nameForAction: () => "Present Text" })).toBe(
      "Present Text"
    );
    expect(action.name).toBe("Present Text");
  });

  it("resolves selected root subroutine ids for delete with protected-state rules", () => {
    const flow: GameFlow = {
      states: [
        { id: "lobby", actions: [] },
        { id: "intro", actions: [] },
        { id: "round-one", actions: [] },
        { id: "round-two", actions: [] }
      ]
    };

    expect(
      flowStateIdsForDelete(flow, {
        flowNodeDepth: "subroutines",
        selectedFlowActionIds: ["round-one", "missing"],
        selectedFlowStateId: "intro"
      })
    ).toEqual(["round-one"]);
    expect(
      flowStateIdsForDelete(flow, {
        flowNodeDepth: "subroutine",
        selectedFlowActionIds: ["round-one"],
        selectedFlowStateId: "round-two"
      })
    ).toEqual(["round-two"]);
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

    expect(result).toEqual({
      removedIds: ["round-two"],
      firstDeletedIndex: 2,
      nextStateId: "round-three"
    });
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
      routeNodes: [{ id: "route-a" }, { id: "route-b" }]
    };

    expect(removeFlowRouteNode(flow, "route-a")).toEqual({ removed: true, nodeId: "route-a" });
    expect(flow.routeNodes?.map((node) => node.id)).toEqual(["route-b"]);
    expect(removeFlowRouteNode(flow, "missing")).toEqual({ removed: false, nodeId: "missing" });
  });
});
