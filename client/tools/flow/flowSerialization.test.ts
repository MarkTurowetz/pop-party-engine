import { describe, expect, it } from "vitest";
import { flowHistorySnapshot, parseFlowHistorySnapshot, serializeFlowActionForSave, serializeGameFlowForSave } from "./flowSerialization";
import type { FlowRouteNode, GameFlow } from "../../types/game-data";

describe("Flow serialization", () => {
  it("serializes nested actions without mutating the source action", () => {
    const action = {
      id: "intro-action",
      type: "presentText",
      name: "Intro Action",
      subActions: [
        {
          id: "intro-sub-action",
          type: "setPlayersShown",
          isShown: true,
          subActions: [
            {
              id: "nested-sub-action",
              type: "playHostAudio"
            }
          ]
        }
      ]
    };

    const serialized = serializeFlowActionForSave(action);

    expect(serialized).toEqual({
      id: "intro-action",
      type: "presentText",
      name: "Intro Action",
      subActions: [
        {
          id: "intro-sub-action",
          type: "setPlayersShown",
          isShown: true,
          subActions: [
            {
              id: "nested-sub-action",
              type: "playHostAudio",
              subActions: []
            }
          ]
        }
      ]
    });
    expect(serialized).not.toBe(action);
    expect(serialized.subActions?.[0]).not.toBe(action.subActions[0]);
    expect(serialized.subActions?.[0]?.subActions?.[0]).not.toBe(action.subActions[0]?.subActions?.[0]);
  });

  it("serializes states and delegates route-node normalization to the caller", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "lobby",
          name: "Lobby",
          actions: [
            {
              id: "lobby-action",
              type: "presentText",
              subActions: [{ id: "lobby-sub-action", type: "setPlayersShown" }]
            }
          ]
        }
      ],
      routeNodes: [
        {
          id: "route-a",
          draftOnly: true,
          branches: [{ id: "branch-a", targetNodeId: "route-b" }]
        }
      ]
    };
    const serializeRouteNode = (node: FlowRouteNode) => ({
      ...node,
      normalizedByGraph: true
    });

    expect(serializeGameFlowForSave(flow, { serializeRouteNode })).toEqual({
      states: [
        {
          id: "lobby",
          name: "Lobby",
          actions: [
            {
              id: "lobby-action",
              type: "presentText",
              subActions: [{ id: "lobby-sub-action", type: "setPlayersShown", subActions: [] }]
            }
          ]
        }
      ],
      routeNodes: [
        {
          id: "route-a",
          draftOnly: true,
          branches: [{ id: "branch-a", targetNodeId: "route-b" }],
          normalizedByGraph: true
        }
      ]
    });
  });

  it("serializes subroutine child actions without adding child actions to every action", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "intro",
          actions: [
            {
              id: "nested",
              type: "subroutine",
              inputs: [{ name: "playerId", valueType: "string", source: "g.currentPlayerId" }],
              outputs: [{
                name: "choice",
                valueType: "string",
                value: "l.selectedChoice",
                target: "g.legacyChoice"
              }],
              actions: [{ id: "inside", type: "presentText" }]
            },
            { id: "plain", type: "presentText" }
          ]
        }
      ],
      routeNodes: []
    };

    expect(serializeGameFlowForSave(flow)).toEqual({
      states: [
        {
          id: "intro",
          actions: [
            {
              id: "nested",
              type: "subroutine",
              inputs: [{ name: "playerId", valueType: "string", source: "g.currentPlayerId" }],
              outputs: [{
                name: "choice",
                valueType: "string",
                value: "l.selectedChoice"
              }],
              actions: [{ id: "inside", type: "presentText", subActions: [] }],
              subActions: []
            },
            { id: "plain", type: "presentText", subActions: [] }
          ]
        }
      ],
      routeNodes: []
    });
  });

  it("returns an empty compatible flow when given missing data", () => {
    expect(serializeGameFlowForSave(null)).toEqual({
      states: [],
      routeNodes: []
    });
  });

  it("creates and parses history snapshots through the compatible save shape", () => {
    const flow: GameFlow = {
      states: [
        {
          id: "lobby",
          actions: [{ id: "a", type: "presentText" }]
        }
      ]
    };
    const snapshot = flowHistorySnapshot(flow);

    expect(snapshot).toBe(JSON.stringify({ states: [{ id: "lobby", actions: [{ id: "a", type: "presentText", subActions: [] }] }], routeNodes: [] }));
    expect(parseFlowHistorySnapshot(snapshot)).toEqual({
      states: [{ id: "lobby", actions: [{ id: "a", type: "presentText", subActions: [] }] }],
      routeNodes: []
    });
  });
});
