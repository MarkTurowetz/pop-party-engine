import { describe, expect, it, vi } from "vitest";
import { addFlowStateCommand, renameFlowStateCommand } from "./flowCommands";
import { createFlowStore } from "./flowStore";
import type { GameFlow } from "../../types/game-data";

function flowFixture(): GameFlow {
  return {
    states: [
      { id: "intro", name: "Intro", actions: [{ id: "show-title", type: "presentText" }] },
      { id: "round-one", name: "Round One", actions: [] }
    ],
    routeNodes: [{ id: "entry", routeNodeType: "momentEntry" }]
  };
}

describe("Flow store", () => {
  it("exposes immutable snapshots", () => {
    const store = createFlowStore(flowFixture(), { selection: { selectedFlowStateId: "intro" } });
    const snapshot = store.snapshot();

    snapshot.flow.states[0].name = "Changed outside";
    snapshot.selection.selectedFlowActionIds.add("show-title");

    expect(store.snapshot().flow.states[0].name).toBe("Intro");
    expect([...store.snapshot().selection.selectedFlowActionIds]).toEqual([]);
  });

  it("executes commands and supports undo", () => {
    const store = createFlowStore(flowFixture());

    expect(store.execute(renameFlowStateCommand("intro", "Cold Open")).flow.states[0].name).toBe("Cold Open");
    expect(store.snapshot().canUndo).toBe(true);
    expect(store.undo()?.flow.states[0].name).toBe("Intro");
  });

  it("tracks action, moment, and route selections", () => {
    const store = createFlowStore(flowFixture());

    expect(store.selectActions(["missing", "show-title"], ["show-title"]).selection.selectedFlowActionId).toBe("show-title");
    expect(store.selectMoments(["intro", "round-one"]).selection.selectedFlowStateId).toBe("round-one");
    expect(store.selectRouteNode("entry").selection.selectedFlowRouteNodeId).toBe("entry");
    expect(store.selectRouteBranch("entry", "branch-a").selection.selectedFlowRouteBranchId).toBe("branch-a");
  });

  it("repairs missing state selection after replacing flow", () => {
    const store = createFlowStore(flowFixture(), { selection: { selectedFlowStateId: "round-one" } });

    const snapshot = store.replaceFlow({ states: [{ id: "intro", name: "Intro", actions: [] }], routeNodes: [] });

    expect(snapshot.selection.selectedFlowStateId).toBe("intro");
    expect(snapshot.canUndo).toBe(false);
  });

  it("notifies subscribers and supports unsubscribe", () => {
    const store = createFlowStore(flowFixture());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.execute(addFlowStateCommand({ id: "results", name: "Results", actions: [] }));
    unsubscribe();
    store.execute(renameFlowStateCommand("intro", "Cold Open"));

    expect(listener).toHaveBeenCalledTimes(1);
    const notifiedSnapshot = listener.mock.calls[0][0] as ReturnType<typeof store.snapshot>;
    expect(notifiedSnapshot.flow.states.map((state) => state.id)).toEqual(["intro", "round-one", "results"]);
  });
});
