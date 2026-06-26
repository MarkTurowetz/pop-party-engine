import { describe, expect, it, vi } from "vitest";
import {
  actionTypeName,
  findFlowActionRef,
  findFlowState,
  makeFlowId,
  stateActionNameSet,
  uniqueActionNameForType
} from "./flowSelectors";
import { installFlowSelectorsAdapter } from "./flowSelectorsAdapter";
import type { FlowAction, GameFlow } from "../../types/game-data";

const flow: GameFlow = {
  states: [
    {
      id: "intro",
      name: "Intro",
      actions: [
        {
          id: "intro-present",
          name: "Present Text",
          type: "presentText",
          subActions: [{ id: "intro-show-players", name: "Show Players", type: "setPlayersShown" }]
        },
        {
          id: "intro-branch",
          name: "Branch",
          type: "decision",
          branches: [{ id: "branch-yes", type: "branch", name: "Yes" }]
        } as FlowAction
      ]
    }
  ]
};

describe("Flow selectors", () => {
  it("finds states and nested action refs", () => {
    expect(findFlowState(flow, "intro")?.name).toBe("Intro");
    expect(findFlowActionRef(flow, "intro", "intro-present")).toMatchObject({
      action: { id: "intro-present" },
      parentAction: null,
      isSubAction: false,
      isBranch: false
    });
    expect(findFlowActionRef(flow, "intro", "intro-show-players")).toMatchObject({
      action: { id: "intro-show-players" },
      parentAction: { id: "intro-present" },
      isSubAction: true,
      isBranch: false
    });
  });

  it("uses the legacy decision branch normalizer when looking up branch refs", () => {
    const ensureDecisionBranches = vi.fn((action: FlowAction) => action.branches as FlowAction[]);

    expect(findFlowActionRef(flow, "intro", "branch-yes", { ensureDecisionBranches })).toMatchObject({
      action: { id: "branch-yes" },
      parentAction: { id: "intro-branch" },
      isSubAction: false,
      isBranch: true
    });
    expect(ensureDecisionBranches).toHaveBeenCalledWith(expect.objectContaining({ id: "intro-branch" }));
  });

  it("keeps legacy ID and action-name behavior", () => {
    const actionTypes = [{ id: "presentText", name: "Present Text" }];
    const state = flow.states[0];

    expect(makeFlowId("  Hello, Flow!!!  ", "fallback")).toBe("hello-flow");
    expect(makeFlowId("", "fallback")).toBe("fallback");
    expect(actionTypeName(actionTypes, "presentText")).toBe("Present Text");
    expect([...stateActionNameSet(state)]).toContain("present text");
    expect(uniqueActionNameForType(actionTypes, state, { id: "new-action", type: "presentText" })).toBe("Present Text 1");
  });

  it("installs a legacy compatibility adapter with a DOM-visible marker", () => {
    const setAttribute = vi.fn();
    const target = {
      document: {
        documentElement: { setAttribute }
      }
    } as unknown as Window;

    const adapter = installFlowSelectorsAdapter(target);

    expect(target.PartyGameFlowSelectors).toBe(adapter);
    expect(adapter.makeFlowId("Flow ID", "fallback")).toBe("flow-id");
    expect(setAttribute).toHaveBeenCalledWith("data-flow-selectors-adapter", "module");
  });
});
