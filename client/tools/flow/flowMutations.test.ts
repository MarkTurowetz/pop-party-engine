import { describe, expect, it, vi } from "vitest";
import { addDefaultFlowAction, addDefaultFlowSubAction, addFlowState, createDefaultFlowState } from "./flowMutations";
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
});
