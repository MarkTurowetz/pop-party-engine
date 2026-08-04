import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("reference application composition", () => {
  it("exports an explicit async startup boundary without binding on import", () => {
    const application = require("./server");
    expect(application.startReferenceApplication).toBeTypeOf("function");
  });

  it("isolates Preview release coordinates while preserving Production authority", () => {
    const { referenceContentStoreEnvironment } = require("./server");
    const production = {
      PARTY_GAME_DEPLOYMENT_CHANNEL: "production",
      PARTY_GAME_RELEASE_REF: "heads/game-releases"
    };
    expect(referenceContentStoreEnvironment(production)).toBe(production);
    expect(referenceContentStoreEnvironment({
      PARTY_GAME_DEPLOYMENT_CHANNEL: "preview",
      PARTY_GAME_RELEASE_REF: "heads/game-releases"
    })).toMatchObject({ PARTY_GAME_RELEASE_REF: "heads/game-releases-preview" });
    expect(referenceContentStoreEnvironment({
      PARTY_GAME_DEPLOYMENT_CHANNEL: "preview",
      PARTY_GAME_PREVIEW_RELEASE_REF: "heads/custom-preview-releases"
    })).toMatchObject({ PARTY_GAME_RELEASE_REF: "heads/custom-preview-releases" });
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

  it("retains correctness semantics through Disappear and resets only while Off", () => {
    const game = require("./game.config");
    const { createGameRendererRuntime } = require("@pop-party/engine/server");
    const runtime = createGameRendererRuntime({ stageRenderers: game.registrations.stageRenderers });
    const player = { id: "player-a", name: "AVA", active: true };
    const room = {
      phase: "round",
      flowStateId: "round",
      vipPlayerId: "player-a",
      gamePluginState: { reference: {} },
      flowVariables: {},
      localVariables: {},
      players: new Map([[player.id, player]]),
      displayedPlayerAnswers: new Map([[player.id, { text: "Wrong", correct: false, done: true }]]),
      hiddenPlayerAnswerIds: new Set([player.id])
    };

    expect(runtime.viewModels(room)["reference.players"].players[0]).toMatchObject({
      answerSemanticState: "Incorrect",
      answerLifecycleState: "Disappear"
    });
    room.displayedPlayerAnswers.set(player.id, { text: "Right", correct: true, done: true });
    expect(runtime.viewModels(room)["reference.players"].players[0]).toMatchObject({
      answerSemanticState: "Correct",
      answerLifecycleState: "Disappear"
    });
    room.displayedPlayerAnswers.clear();
    room.hiddenPlayerAnswerIds.clear();
    expect(runtime.viewModels(room)["reference.players"].players[0]).toMatchObject({
      answerSemanticState: "Default",
      answerLifecycleState: "Off"
    });
    room.displayedPlayerAnswers.set(player.id, { text: "Next", correct: null, done: true });
    expect(runtime.viewModels(room)["reference.players"].players[0]).toMatchObject({
      answerText: "Next",
      answerSemanticState: "Default",
      answerLifecycleState: "Appear"
    });
  });
});
