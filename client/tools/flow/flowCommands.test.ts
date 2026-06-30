import { describe, expect, it } from "vitest";
import {
  addConnectedFlowActionCommand,
  addConnectedRootFlowActionCommand,
  connectRootFlowActionCommand,
  addFlowActionCommand,
  addFlowActionToSubroutineCommand,
  addFlowStateCommand,
  addFlowSubroutineCommand,
  addFlowSubActionCommand,
  createFlowCommandHistory,
  moveFlowActionCommand,
  moveFlowStateCommand,
  moveFlowSubActionCommand,
  removeFlowActionsCommand,
  removeFlowRouteBranchCommand,
  removeFlowRouteNodeCommand,
  removeFlowStatesCommand,
  refreshFlowActionTypeNameCommand,
  refreshFlowRouteActionTypeNameCommand,
  renameFlowActionCommand,
  renameFlowStateCommand,
  setFlowActionTypeCommand,
  setFlowActionTimingCommand,
  setFlowStateEntryTargetCommand,
  setFlowStateNextTargetCommand,
  setFlowSubroutineEntryTargetCommand,
  setFlowStateVotingSourceCommand
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

function actionFlowFixture(): GameFlow {
  return {
    states: [
      {
        id: "round-one",
        name: "Round One",
        actions: [
          {
            id: "act-1",
            name: "Action 1",
            type: "message",
            subActions: [{ id: "sub-1", name: "Sub 1", type: "message" }]
          },
          { id: "act-2", name: "Action 2", type: "message" }
        ]
      }
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

    expect(history.flow().states.map((state) => state.id)).toEqual([
      "intro",
      "round-one",
      "results"
    ]);
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

    expect(
      history
        .execute(moveFlowStateCommand("intro", "round-one", true))
        .states.map((state) => state.id)
    ).toEqual(["round-one", "intro"]);
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

describe("Flow action commands", () => {
  it("adds an action after the selected primary action", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(addFlowActionCommand("round-one", "act-1"));

    expect(next.states[0].actions?.map((action) => action.id)).toEqual([
      "act-1",
      expect.any(String),
      "act-2"
    ]);
    expect(next.states[0].actions).toHaveLength(3);
  });

  it("adds a connected action from a source field as one undoable command", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(
      addConnectedFlowActionCommand(
        "round-one",
        {
          kind: "field",
          nodeId: "act-1",
          field: "nextTargetActionId"
        },
        { x: 123.4, y: 456.6 }
      )
    );

    const actions = next.states[0].actions || [];
    const created = actions[1];
    expect(actions.map((action) => action.id)).toEqual(["act-1", created.id, "act-2"]);
    expect(actions[0].nextTargetActionId).toBe(created.id);
    expect(created.nodePosition).toEqual({ x: 123, y: 457 });
    expect(history.undo()?.states[0].actions?.map((action) => action.id)).toEqual([
      "act-1",
      "act-2"
    ]);
  });

  it("adds a connected action from a decision branch", () => {
    const history = createFlowCommandHistory({
      states: [
        {
          id: "round-one",
          name: "Round One",
          actions: [
            {
              id: "decision-1",
              name: "Decision",
              type: "decision",
              branches: [
                { id: "branch-1", type: "hit", value: "yes", targetActionId: "" },
                { id: "branch-default", type: "noMatch", targetActionId: "" }
              ]
            }
          ]
        }
      ],
      routeNodes: []
    } as GameFlow);

    const next = history.execute(
      addConnectedFlowActionCommand(
        "round-one",
        {
          kind: "branch",
          nodeId: "decision-1",
          branchId: "branch-1"
        },
        { x: 10, y: 20 }
      )
    );

    const actions = next.states[0].actions || [];
    const created = actions[1];
    expect(actions[0].branches?.[0].targetActionId).toBe(created.id);
    expect(created.nodePosition).toEqual({ x: 10, y: 20 });
  });

  it("renames an action (including nested sub-actions)", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(renameFlowActionCommand("round-one", "act-1", "Renamed"));
    expect(next.states[0].actions?.[0].name).toBe("Renamed");

    const sub = history.execute(renameFlowActionCommand("round-one", "sub-1", "Renamed Sub"));
    expect(sub.states[0].actions?.[0].subActions?.[0].name).toBe("Renamed Sub");
  });

  it("renames an action when its type changes", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(
      setFlowActionTypeCommand(
        "round-one",
        "act-1",
        "displayText",
        (action, type) => {
          action.type = type;
        },
        { nameForType: (type) => (type === "displayText" ? "Display Text" : type) }
      )
    );

    expect(next.states[0].actions?.[0]).toMatchObject({
      name: "Display Text",
      type: "displayText"
    });
  });

  it("refreshes an action name from its current action type", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(
      refreshFlowActionTypeNameCommand("round-one", "act-1", {
        nameForType: (type) => (type === "message" ? "Message" : type)
      })
    );

    expect(next.states[0].actions?.[0].name).toBe("Message");
  });

  it("refreshes a root route action name from its current action type", () => {
    const history = createFlowCommandHistory({
      states: [],
      routeNodes: [
        { id: "route-1", routeNodeType: "action", name: "Old Route Name", type: "presentText" }
      ]
    });

    const next = history.execute(
      refreshFlowRouteActionTypeNameCommand("route-1", {
        nameForType: (type) => (type === "presentText" ? "Present Text" : type)
      })
    );

    expect(next.routeNodes?.[0].name).toBe("Present Text");
  });

  it("adds a sub-action under a parent action", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(addFlowSubActionCommand("round-one", "act-1"));

    expect(next.states[0].actions?.[0].subActions).toHaveLength(2);
    expect(next.states[0].actions?.[0].subActions?.[1]).toMatchObject({
      name: "Set Players Shown",
      type: "setPlayersShown"
    });
  });

  it("moves an action within a state", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(moveFlowActionCommand("round-one", "act-2", "act-1", false));

    expect(next.states[0].actions?.map((action) => action.id)).toEqual(["act-2", "act-1"]);
  });

  it("moves a sub-action within its parent", () => {
    const flow = actionFlowFixture();
    flow.states[0].actions![0].subActions!.push({ id: "sub-2", name: "Sub 2", type: "message" });
    const history = createFlowCommandHistory(flow);

    const next = history.execute(
      moveFlowSubActionCommand("round-one", "act-1", "sub-2", "sub-1", false)
    );

    expect(next.states[0].actions?.[0].subActions?.map((sub) => sub.id)).toEqual([
      "sub-2",
      "sub-1"
    ]);
  });

  it("keeps sub-action timing locked to S+ when editing timing", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(
      setFlowActionTimingCommand("round-one", "sub-1", { mode: "E+", seconds: 1.25 })
    );

    expect(next.states[0].actions?.[0].subActions?.[0].timing).toEqual({
      mode: "S+",
      seconds: 1.25
    });
  });

  it("removes selected actions and their sub-actions", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const next = history.execute(removeFlowActionsCommand("round-one", ["act-1"]));

    expect(next.states[0].actions?.map((action) => action.id)).toEqual(["act-2"]);
    expect(history.undo()?.states[0].actions).toHaveLength(2);
  });

  it("adds, configures, and edits nested subroutine actions through the same command history", () => {
    const history = createFlowCommandHistory(actionFlowFixture());

    const withSubroutine = history.execute(addFlowSubroutineCommand("round-one", [], "act-1"));
    const subroutine = withSubroutine.states[0].actions?.[1];
    expect(subroutine).toMatchObject({ type: "subroutine", actions: [] });

    const withNestedAction = history.execute(
      addFlowActionToSubroutineCommand("round-one", [String(subroutine?.id)])
    );
    const nested = withNestedAction.states[0].actions?.[1].actions?.[0];
    expect(nested).toMatchObject({ type: "presentText", timing: { mode: "E+", seconds: 0 } });

    const withEntry = history.execute(
      setFlowSubroutineEntryTargetCommand("round-one", [String(subroutine?.id)], String(nested?.id))
    );
    expect(withEntry.states[0].actions?.[1].entryTargetActionId).toBe(nested?.id);

    const moved = history.execute(
      moveFlowActionCommand("round-one", String(nested?.id), String(nested?.id), false, [
        String(subroutine?.id)
      ])
    );
    expect(moved.states[0].actions?.[1].actions?.[0].id).toBe(nested?.id);
  });
});

describe("Flow state target and delete commands", () => {
  it("deletes flow states (honouring protected ids)", () => {
    const history = createFlowCommandHistory(flowFixture());

    const next = history.execute(removeFlowStatesCommand(["round-one"]));

    expect(next.states.map((state) => state.id)).toEqual(["intro"]);
  });

  it("sets next, entry, and voting targets", () => {
    const history = createFlowCommandHistory(flowFixture());

    history.execute(setFlowStateNextTargetCommand("intro", "round-one"));
    history.execute(setFlowStateEntryTargetCommand("intro", "act-1"));
    const next = history.execute(setFlowStateVotingSourceCommand("intro", "round-one"));

    expect(next.states[0].nextStateTargetId).toBe("round-one");
    expect(next.states[0].entryTargetActionId).toBe("act-1");
    expect(next.states[0].votingSourceStateId).toBe("round-one");
  });
});

describe("Flow route commands", () => {
  function routeFlowFixture(): GameFlow {
    return {
      states: [{ id: "round-one", name: "Round One", actions: [] }],
      routeNodes: [
        {
          id: "node-1",
          branches: [
            { id: "branch-1", name: "Branch 1", type: "match" },
            { id: "branch-default", name: "Default", type: "noMatch" }
          ]
        }
      ]
    } as GameFlow;
  }

  function branchIds(flow: GameFlow): string[] {
    const node = flow.routeNodes?.[0] as { branches?: { id: string }[] } | undefined;
    return (node?.branches || []).map((branch) => branch.id);
  }

  it("removes a match branch but blocks the noMatch branch", () => {
    const history = createFlowCommandHistory(routeFlowFixture());

    const removed = history.execute(removeFlowRouteBranchCommand("node-1", "branch-1"));
    expect(branchIds(removed)).toEqual(["branch-default"]);

    const blocked = history.execute(removeFlowRouteBranchCommand("node-1", "branch-default"));
    expect(branchIds(blocked)).toEqual(["branch-default"]);
  });

  it("removes a route node", () => {
    const history = createFlowCommandHistory(routeFlowFixture());

    const next = history.execute(removeFlowRouteNodeCommand("node-1"));

    expect(next.routeNodes).toEqual([]);
  });

  it("creates and connects root actions through route-node storage", () => {
    const history = createFlowCommandHistory(flowFixture());

    const withRootAction = history.execute(
      addConnectedRootFlowActionCommand(
        { kind: "field", nodeId: "intro", field: "nextTargetActionId" },
        { x: 20, y: 40 },
        "route-action-test"
      )
    );

    expect(withRootAction.states[0].nextStateTargetId).toBe("route-action-test");
    expect(withRootAction.routeNodes?.[0]).toMatchObject({
      id: "route-action-test",
      routeNodeType: "action",
      nextTargetNodeId: "",
      nodePosition: { x: 20, y: 40 }
    });

    const connected = history.execute(
      connectRootFlowActionCommand(
        { kind: "field", nodeId: "route-action-test", field: "nextTargetActionId" },
        "round-one"
      )
    );

    expect(connected.routeNodes?.[0]?.nextTargetNodeId).toBe("round-one");
  });
});
