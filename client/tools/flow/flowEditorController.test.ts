import { describe, expect, it, vi } from "vitest";
import { createFlowEditorController } from "./flowEditorController";
import type { FlowApi } from "../../api/flowApi";
import type { GameFlow, GameFlowSaveResponse } from "../../types/game-data";

function flowFixture(): GameFlow {
  return {
    states: [
      { id: "intro", name: "Intro", actions: [] },
      { id: "round-one", name: "Round One", actions: [{ id: "act-1", name: "Action 1", type: "message" }] }
    ],
    routeNodes: []
  };
}

function fakeApi(overrides: Partial<FlowApi> = {}): FlowApi {
  return {
    loadGameFlow: vi.fn(),
    saveGameFlow: vi.fn(async (flow: GameFlow) => ({ ok: true, flow, runtimeFlow: flow, storage: {} }) as unknown as GameFlowSaveResponse),
    saveToolDraft: vi.fn(async (message) => message),
    ...overrides
  } as FlowApi;
}

describe("createFlowEditorController", () => {
  it("starts clean and selects the first state", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });
    const state = controller.getState();

    expect(state.dirty).toBe(false);
    expect(state.snapshot.selection.selectedFlowStateId).toBe("intro");
  });

  it("marks dirty after an edit and notifies subscribers", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.addState();

    expect(listener).toHaveBeenCalled();
    expect(controller.getState().dirty).toBe(true);
    expect(controller.getState().snapshot.flow.states).toHaveLength(3);
  });

  it("selects a valid action (validating against flow action ids)", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.selectActions("act-1");

    expect(controller.getState().snapshot.selection.selectedFlowActionId).toBe("act-1");
  });

  it("renames the selected action through the controller", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.renameAction("round-one", "act-1", "Edited");

    const action = controller.getState().snapshot.flow.states[1].actions[0];
    expect(action.name).toBe("Edited");
    expect(controller.getState().dirty).toBe(true);
  });

  it("changes an action type and applies type defaults", () => {
    const controller = createFlowEditorController({
      initialFlow: flowFixture(),
      api: fakeApi(),
      actionTypes: [{ id: "decision", name: "Decision", category: "logic" }]
    });

    controller.setActionType("round-one", "act-1", "decision");

    const action = controller.getState().snapshot.flow.states[1].actions[0];
    expect(action.type).toBe("decision");
    // decision defaults seed a variable + branches
    expect(action.variable).toBe("activePlayerCount");
    expect(Array.isArray(action.branches)).toBe(true);
    expect(controller.getState().dirty).toBe(true);
  });

  it("sets an arbitrary action field", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.setActionField("round-one", "act-1", "text", "Hello world");

    expect(controller.getState().snapshot.flow.states[1].actions[0].text).toBe("Hello world");
  });

  it("undo returns to a clean snapshot", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.renameState("round-one", "Round 1");
    expect(controller.getState().dirty).toBe(true);

    controller.undo();
    expect(controller.getState().dirty).toBe(false);
    expect(controller.getState().snapshot.flow.states[1].name).toBe("Round One");
  });

  it("saves the serialized flow and clears dirty", async () => {
    const api = fakeApi();
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api });

    controller.addAction("intro");
    expect(controller.getState().dirty).toBe(true);

    const saved = await controller.save();

    expect(api.saveGameFlow).toHaveBeenCalledTimes(1);
    expect(saved?.states[0].actions).toHaveLength(1);
    expect(controller.getState().dirty).toBe(false);
    expect(controller.getState().saving).toBe(false);
  });

  it("surfaces a save error without clearing dirty", async () => {
    const api = fakeApi({
      saveGameFlow: vi.fn(async () => {
        throw new Error("network down");
      })
    });
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api });
    controller.addState();

    const result = await controller.save();

    expect(result).toBeNull();
    expect(controller.getState().error).toBe("network down");
    expect(controller.getState().dirty).toBe(true);
  });

  it("reverts to the last saved snapshot", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.addState();
    controller.addState();
    expect(controller.getState().snapshot.flow.states).toHaveLength(4);
    expect(controller.getState().dirty).toBe(true);

    controller.revert();

    expect(controller.getState().snapshot.flow.states).toHaveLength(2);
    expect(controller.getState().dirty).toBe(false);
  });

  it("publishes a best-effort local draft", async () => {
    const api = fakeApi();
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api });

    await controller.publishDraft();

    expect(api.saveToolDraft).toHaveBeenCalledTimes(1);
    expect(controller.getState().hasLocalDraft).toBe(true);
  });
});
