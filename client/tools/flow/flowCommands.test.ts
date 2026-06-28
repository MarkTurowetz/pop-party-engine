import { describe, expect, it } from "vitest";
import {
  addFlowStateCommand,
  createFlowCommandHistory,
  moveFlowStateCommand,
  renameFlowStateCommand
} from "./flowCommands";
import type { GameFlow } from "../../types/game-data";

function flowFixture(): GameFlow {
  return {
    states: [
      { id: "intro", name: "Intro", actions: [] },
      { id: "round-one", name: "Round One", actions: [] }
    ],
    routeNodes: []
  };
}

describe("Flow command history", () => {
  it("executes commands against cloned flow state", () => {
    const original = flowFixture();
    const history = createFlowCommandHistory(original);

    const next = history.execute(renameFlowStateCommand("intro", "Cold Open"));

    expect(next.states[0].name).toBe("Cold Open");
    expect(original.states[0].name).toBe("Intro");
    expect(history.undoLabels()).toEqual(["Rename flow state"]);
  });

  it("supports undo and redo snapshots", () => {
    const history = createFlowCommandHistory(flowFixture());

    history.execute(renameFlowStateCommand("intro", "Cold Open"));
    history.execute(addFlowStateCommand({ id: "results", name: "Results", actions: [] }));

    expect(history.flow().states.map((state) => state.id)).toEqual(["intro", "round-one", "results"]);
    expect(history.undo()?.states.map((state) => state.id)).toEqual(["intro", "round-one"]);
    expect(history.undo()?.states[0].name).toBe("Intro");
    expect(history.redo()?.states[0].name).toBe("Cold Open");
  });

  it("clears redo when a new command executes", () => {
    const history = createFlowCommandHistory(flowFixture());

    history.execute(renameFlowStateCommand("intro", "Cold Open"));
    history.undo();
    history.execute(renameFlowStateCommand("round-one", "Round 1"));

    expect(history.canRedo()).toBe(false);
    expect(history.flow().states[1].name).toBe("Round 1");
  });

  it("can move states with command history", () => {
    const history = createFlowCommandHistory(flowFixture());

    expect(history.execute(moveFlowStateCommand("intro", "round-one", true)).states.map((state) => state.id)).toEqual([
      "round-one",
      "intro"
    ]);
  });

  it("respects the configured undo limit", () => {
    const history = createFlowCommandHistory(flowFixture(), { limit: 1 });

    history.execute(renameFlowStateCommand("intro", "First"));
    history.execute(renameFlowStateCommand("intro", "Second"));

    expect(history.undoLabels()).toEqual(["Rename flow state"]);
    expect(history.undo()?.states[0].name).toBe("First");
    expect(history.undo()).toBeNull();
  });
});
