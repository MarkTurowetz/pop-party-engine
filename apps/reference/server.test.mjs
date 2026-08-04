import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("reference application composition", () => {
  it("exports an explicit async startup boundary without binding on import", () => {
    const application = require("./server");
    expect(application.startReferenceApplication).toBeTypeOf("function");
  });

  it("projects public players into the reference game's local avatar presentation", () => {
    const game = require("./game.config");
    const { createGameRendererRuntime } = require("@pop-party/engine/server");
    const runtime = createGameRendererRuntime({
      stageRenderers: game.registrations.stageRenderers
    });
    const room = {
      phase: "lobby",
      flowStateId: "lobby",
      vipPlayerId: "player-a",
      gamePluginState: { reference: {} },
      flowVariables: {},
      localVariables: {},
      players: new Map([
        ["player-a", { id: "player-a", name: "AVA", active: true }],
        ["player-b", { id: "player-b", name: "BEN", active: true }]
      ])
    };

    const model = runtime.viewModels(room)["reference.players"];
    expect(model.players).toHaveLength(2);
    expect(model.players.map((player) => player.id)).toEqual(["player-a", "player-b"]);
    expect(model.players.map((player) => player.name)).toEqual(["AVA", "BEN"]);
    expect(model.players[0]).toMatchObject({
      avatarLifecycleState: "On",
      inputState: "ChoosingEnd",
      nameLifecycleState: "On",
      widgetLifecycleState: "On",
      vipLifecycleState: "On"
    });
    expect(model.players[1].vipLifecycleState).toBe("Off");
    for (const player of model.players) {
      expect(["Rex", "Stego", "Trike", "Raptor", "Bronto", "Cleo"]).toContain(player.avatarState);
    }

    const reversedRoom = { ...room, players: new Map([...room.players].reverse()) };
    const reversedModel = runtime.viewModels(reversedRoom)["reference.players"];
    expect(Object.fromEntries(reversedModel.players.map((player) => [player.id, player.avatarState])))
      .toEqual(Object.fromEntries(model.players.map((player) => [player.id, player.avatarState])));

    const collection = game.registrations.stageRenderers[0].value.bindings[0];
    expect(collection.item.artCompositionId).toBe("prefab-player-widget-mc");
    expect(collection.item.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "avatar", kind: "state", playback: "stop" }),
      expect.objectContaining({ id: "inputStatus", kind: "state" }),
      expect.objectContaining({ id: "name", kind: "text", targetComponentId: "nameText" })
    ]));
  });
});
