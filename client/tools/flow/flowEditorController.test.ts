import { describe, expect, it, vi } from "vitest";
import { createFlowEditorController } from "./flowEditorController";
import type { FlowApi } from "../../api/flowApi";
import type { GameFlow, GameFlowSaveResponse } from "../../types/game-data";

function flowFixture(): GameFlow {
  return {
    states: [
      { id: "intro", name: "Intro", actions: [] },
      {
        id: "round-one",
        name: "Round One",
        actions: [{ id: "act-1", name: "Action 1", type: "message" }]
      }
    ],
    routeNodes: []
  };
}

function fakeApi(overrides: Partial<FlowApi> = {}): FlowApi {
  return {
    loadGameFlow: vi.fn(),
    saveGameFlow: vi.fn(
      async (flow: GameFlow) =>
        ({ ok: true, flow, runtimeFlow: flow, storage: {} }) as unknown as GameFlowSaveResponse
    ),
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

  it("edits action timing (merging mode and seconds)", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.setActionTiming("round-one", "act-1", { mode: "S+" });
    controller.setActionTiming("round-one", "act-1", { seconds: 2.5 });

    const timing = controller.getState().snapshot.flow.states[1].actions[0].timing;
    expect(timing).toEqual({ mode: "S+", seconds: 2.5 });
  });

  it("sets an arbitrary action field", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.setActionField("round-one", "act-1", "text", "Hello world");

    expect(controller.getState().snapshot.flow.states[1].actions[0].text).toBe("Hello world");
  });

  it("adds, edits, and removes decision branches", () => {
    const controller = createFlowEditorController({
      initialFlow: flowFixture(),
      api: fakeApi(),
      actionTypes: [{ id: "decision", name: "Decision", category: "logic" }]
    });
    controller.setActionType("round-one", "act-1", "decision");

    const branchesAfterSeed = () =>
      controller.getState().snapshot.flow.states[1].actions[0].branches || [];
    const seeded = branchesAfterSeed().length;
    expect(seeded).toBeGreaterThanOrEqual(2); // at least a hit + noMatch

    controller.addDecisionBranch("round-one", "act-1");
    expect(branchesAfterSeed().length).toBe(seeded + 1);
    // noMatch stays last
    expect(branchesAfterSeed().at(-1)?.type).toBe("noMatch");

    const editable = branchesAfterSeed().find((branch) => branch.type !== "noMatch");
    controller.setDecisionBranchField("round-one", "act-1", String(editable?.id), "value", "7");
    const updated = branchesAfterSeed().find((branch) => branch.id === editable?.id);
    expect(updated?.value).toBe("7");

    controller.removeDecisionBranch("round-one", "act-1", String(editable?.id));
    expect(branchesAfterSeed().some((branch) => branch.id === editable?.id)).toBe(false);

    // noMatch cannot be removed
    const noMatch = branchesAfterSeed().find((branch) => branch.type === "noMatch");
    const before = branchesAfterSeed().length;
    controller.removeDecisionBranch("round-one", "act-1", String(noMatch?.id));
    expect(branchesAfterSeed().length).toBe(before);
  });

  it("edits a multiple-choice options array", () => {
    const controller = createFlowEditorController({
      initialFlow: flowFixture(),
      api: fakeApi(),
      actionTypes: [{ id: "multipleChoiceInput", name: "Multiple Choice", category: "input" }]
    });
    controller.setActionType("round-one", "act-1", "multipleChoiceInput");

    const options = () =>
      (controller.getState().snapshot.flow.states[1].actions[0] as { options?: string[] })
        .options || [];
    const seeded = options().length; // defaults seed ["A","B","C","D"]
    expect(seeded).toBe(4);

    controller.addActionOption("round-one", "act-1");
    expect(options().length).toBe(5);

    controller.setActionOption("round-one", "act-1", 0, "First");
    expect(options()[0]).toBe("First");

    controller.removeActionOption("round-one", "act-1", 0);
    expect(options()[0]).toBe("B");
    expect(options().length).toBe(4);
  });

  it("sets node positions for moments and actions depth", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.setNodePosition("moments", "round-one", "round-one", 12.4, 34.6);
    const state = controller.getState().snapshot.flow.states[1] as {
      nodePosition?: { x: number; y: number };
    };
    expect(state.nodePosition).toEqual({ x: 12, y: 35 });

    controller.setNodePosition("actions", "round-one", "act-1", 100, 200);
    const action = controller.getState().snapshot.flow.states[1].actions[0] as {
      nodePosition?: { x: number; y: number };
    };
    expect(action.nodePosition).toEqual({ x: 100, y: 200 });

    controller.setNodePosition("actions", "round-one", "start", 5, 6);
    const withStart = controller.getState().snapshot.flow.states[1] as {
      startNodePosition?: { x: number; y: number };
    };
    expect(withStart.startNodePosition).toEqual({ x: 5, y: 6 });
  });

  it("sets multiple node positions as one undoable operation", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.setNodePositions("actions", "round-one", [
      { nodeId: "start", x: 10.4, y: 20.8 },
      { nodeId: "act-1", x: 100, y: 220 },
      { nodeId: "return", x: 400, y: 700 }
    ]);

    const state = controller.getState().snapshot.flow.states[1] as {
      startNodePosition?: { x: number; y: number };
      returnNodePosition?: { x: number; y: number };
    };
    const action = controller.getState().snapshot.flow.states[1].actions[0] as {
      nodePosition?: { x: number; y: number };
    };
    expect(state.startNodePosition).toEqual({ x: 10, y: 21 });
    expect(action.nodePosition).toEqual({ x: 100, y: 220 });
    expect(state.returnNodePosition).toEqual({ x: 400, y: 700 });

    controller.undo();
    const revertedState = controller.getState().snapshot.flow.states[1] as {
      startNodePosition?: { x: number; y: number };
      returnNodePosition?: { x: number; y: number };
    };
    const revertedAction = controller.getState().snapshot.flow.states[1].actions[0] as {
      nodePosition?: { x: number; y: number };
    };
    expect(revertedState.startNodePosition).toBeUndefined();
    expect(revertedAction.nodePosition).toBeUndefined();
    expect(revertedState.returnNodePosition).toBeUndefined();
  });

  it("adds and connects a new action from a node exit", () => {
    const controller = createFlowEditorController({ initialFlow: flowFixture(), api: fakeApi() });

    controller.addConnectedAction(
      "round-one",
      {
        id: "act-1:nextTargetActionId",
        nodeId: "act-1",
        label: "Next",
        kind: "field",
        field: "nextTargetActionId",
        currentTarget: ""
      },
      { x: 222.2, y: 333.8 }
    );

    const actions = controller.getState().snapshot.flow.states[1].actions;
    const created = actions[1];
    expect(actions.map((action) => action.id)).toEqual(["act-1", created.id]);
    expect(actions[0].nextTargetActionId).toBe(created.id);
    expect(created.nodePosition).toEqual({ x: 222, y: 334 });

    controller.undo();
    expect(controller.getState().snapshot.flow.states[1].actions).toHaveLength(1);
    expect(
      controller.getState().snapshot.flow.states[1].actions[0].nextTargetActionId
    ).toBeUndefined();
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
