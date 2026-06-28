import { describe, expect, it } from "vitest";
import type { GameFlow } from "../../types/game-data";
import { createFlowPreviewModel } from "./flowPreviewModel";

function flowFixture(): GameFlow {
  return {
    states: [
      { id: "intro", name: "Intro", actions: [] },
      {
        id: "round-one",
        name: "Round One",
        actions: [
          { id: "show", name: "Show", type: "presentText" },
          { id: "parent", type: "decision", branches: [{ id: "branch-a", type: "hit", value: "A" }] }
        ]
      }
    ],
    routeNodes: [{ id: "entry" }]
  };
}

describe("Flow preview model", () => {
  it("derives selected state and counts from live flow data", () => {
    const model = createFlowPreviewModel(flowFixture(), { selectedStateId: "round-one" });

    expect(model.selectedState?.name).toBe("Round One");
    expect(model.selectedStateId).toBe("round-one");
    expect(model.stateCount).toBe(2);
    expect(model.routeNodeCount).toBe(1);
  });

  it("finds selected action refs for React preview inspector state", () => {
    const model = createFlowPreviewModel(flowFixture(), {
      selectedActionId: "branch-a",
      selectedStateId: "round-one"
    });

    expect(model.actionRef?.action.id).toBe("branch-a");
    expect(model.actionRef?.parentAction?.id).toBe("parent");
    expect(model.actionRef?.isBranch).toBe(true);
  });

  it("finds selected route node and branch refs", () => {
    const model = createFlowPreviewModel({
      ...flowFixture(),
      routeNodes: [{ id: "route", branches: [{ id: "branch-a", type: "hit", value: "A" }] }]
    }, {
      selectedRouteBranchId: "branch-a",
      selectedRouteNodeId: "route"
    });

    expect(model.selectedRouteNode?.id).toBe("route");
    expect(model.selectedRouteBranch?.id).toBe("branch-a");
  });
});
