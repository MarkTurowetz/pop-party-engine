import { describe, expect, it } from "vitest";
import {
  clearFlowActionSelectionState,
  flowActionIsSelected,
  selectFlowActionState,
  selectFlowMomentState,
  setFlowActionSelectionState,
  setFlowMomentSelectionState,
  setFlowRootNodeSelectionState,
  setFlowRouteBranchSelectionState,
  setFlowRouteNodeSelectionState
} from "./flowSelection";

describe("Flow selection helpers", () => {
  it("normalizes action selection against valid ids and clears route selection", () => {
    const result = setFlowActionSelectionState(["missing", "start", "action-1"], ["start", "action-1"]);

    expect([...result.selectedFlowActionIds]).toEqual(["start", "action-1"]);
    expect(result.selectedFlowActionId).toBe("action-1");
    expect(result.selectedFlowRouteNodeId).toBe("");
    expect(result.selectedFlowRouteBranchId).toBe("");
  });

  it("toggles additive action selections", () => {
    const result = selectFlowActionState(
      { selectedFlowActionIds: new Set(["action-1"]), selectedFlowActionId: "action-1" },
      "action-2",
      { additive: true },
      ["action-1", "action-2"]
    );

    expect([...result.selectedFlowActionIds]).toEqual(["action-1", "action-2"]);
    expect(result.selectedFlowActionId).toBe("action-2");

    const toggled = selectFlowActionState(result, "action-1", { additive: true }, ["action-1", "action-2"]);
    expect([...toggled.selectedFlowActionIds]).toEqual(["action-2"]);
    expect(toggled.selectedFlowActionId).toBe("action-2");
  });

  it("tracks selected actions from set or primary id", () => {
    expect(flowActionIsSelected({ selectedFlowActionIds: new Set(["branch-1"]) }, "branch-1")).toBe(true);
    expect(flowActionIsSelected({ selectedFlowActionId: "action-1" }, "action-1")).toBe(true);
    expect(flowActionIsSelected(clearFlowActionSelectionState(), "action-1")).toBe(false);
  });

  it("normalizes moment selections against existing state ids", () => {
    const result = setFlowMomentSelectionState(["round-one", "missing", "round-two"], ["round-one", "round-two"]);

    expect([...result.selectedFlowActionIds]).toEqual(["round-one", "round-two"]);
    expect(result.selectedFlowStateId).toBe("round-two");
    expect(result.selectedFlowActionId).toBe("");
    expect(result.selectedFlowRouteNodeId).toBe("");
  });

  it("toggles additive moment selections", () => {
    const result = selectFlowMomentState(
      { selectedFlowActionIds: new Set(["intro"]), selectedFlowStateId: "intro" },
      "round-one",
      { additive: true },
      ["intro", "round-one"]
    );

    expect([...result.selectedFlowActionIds]).toEqual(["intro", "round-one"]);
    expect(result.selectedFlowStateId).toBe("round-one");

    const toggled = selectFlowMomentState(result, "intro", { additive: true }, ["intro", "round-one"]);
    expect([...toggled.selectedFlowActionIds]).toEqual(["round-one"]);
    expect(toggled.selectedFlowStateId).toBe("round-one");
  });

  it("clears action selection when selecting route nodes and branches", () => {
    const nodeSelection = setFlowRouteNodeSelectionState("node-1");
    expect(nodeSelection).toMatchObject({
      selectedFlowRouteNodeId: "node-1",
      selectedFlowRouteBranchId: "",
      selectedFlowActionId: ""
    });
    expect([...nodeSelection.selectedFlowActionIds]).toEqual([]);

    expect(setFlowRouteBranchSelectionState("node-1", "branch-1")).toMatchObject({
      selectedFlowRouteNodeId: "node-1",
      selectedFlowRouteBranchId: "branch-1",
      selectedFlowActionId: ""
    });
  });

  it("selects mixed moment and route nodes at the root flow depth", () => {
    const result = setFlowRootNodeSelectionState(
      ["intro", "code-1", "missing", "round-one"],
      ["intro", "round-one"],
      ["code-1"]
    );

    expect([...result.selectedFlowActionIds]).toEqual(["intro", "code-1", "round-one"]);
    expect(result.selectedFlowStateId).toBe("round-one");
    expect(result.selectedFlowRouteNodeId).toBe("");

    const routePrimary = setFlowRootNodeSelectionState(
      ["intro", "code-1"],
      ["intro"],
      ["code-1"]
    );
    expect(routePrimary.selectedFlowStateId).toBe("");
    expect(routePrimary.selectedFlowRouteNodeId).toBe("code-1");
  });
});
