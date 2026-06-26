import { describe, expect, it, vi } from "vitest";
import { flowHistorySnapshot, parseFlowHistorySnapshot, serializeFlowActionForSave, serializeGameFlowForSave } from "./flowSerialization";
import { installFlowSerializationAdapter } from "./flowSerializationAdapter";
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

  it("installs a legacy compatibility adapter with a DOM-visible marker", () => {
    const setAttribute = vi.fn();
    const target = {
      document: {
        documentElement: { setAttribute }
      }
    } as unknown as Window;

    const adapter = installFlowSerializationAdapter(target);

    expect(target.PartyGameFlowSerialization).toBe(adapter);
    expect(adapter.parseFlowHistorySnapshot(adapter.flowHistorySnapshot({ states: [] }))).toEqual({ states: [], routeNodes: [] });
    expect(typeof adapter.serializeGameFlowForSave).toBe("function");
    expect(setAttribute).toHaveBeenCalledWith("data-flow-serialization-adapter", "module");
  });
});
