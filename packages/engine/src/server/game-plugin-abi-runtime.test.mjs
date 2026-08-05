import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGamePluginRegistry, defineGamePlugin } = require("./game-plugin-runtime");
const {
  createGameActionExecutor,
  createGameControllerInteractionRuntime,
  createGameInputRuntime,
  createGameRendererRuntime,
  createPluginInputActionDefinitions,
  createPluginFlowActionDefinitions,
  pluginFlowActionTypes
} = require("./game-plugin-abi-runtime");
const { createFlowActionRegistry } = require("../shared/flow-action-registry");

function fixturePlugin() {
  return defineGamePlugin({
    namespace: "fixture",
    register(registry) {
      registry.actions("fixture.drawCard", {
        name: "Draw Card",
        fields: [
          { key: "amount", label: "Amount", control: "integer", min: 1, max: 5, default: 1 },
          { key: "resultVariable", label: "Result Variable", control: "text", default: "drawCount" },
          { key: "actorId", label: "Actor", control: "text" }
        ],
        outputs: [
          { id: "drawCount", name: "Draw Count", variableField: "resultVariable", defaultVariable: "drawCount" }
        ],
        actorPlayerIdField: "actorId",
        execute(context, action) {
          context.state.draws = Number(context.state.draws || 0) + Number(action.amount || 0);
          context.state.randomSample = context.random.integer(1, 100);
          context.state.actorWasVip = context.capability.isVip;
          context.outputs.set("drawCount", context.state.draws);
          context.broadcast.request();
        }
      });
      registry.inputs("fixture.turnChoice", {
        name: "Turn Choice",
        fields: [
          { key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" },
          { key: "resultVariable", label: "Result Variable", control: "text", default: "turnChoice" }
        ],
        outputs: [{ id: "choice", name: "Choice", variableField: "resultVariable" }],
        submission: [{ id: "choice", type: "choice", optionsSource: "options" }],
        controller: {
          layoutStateId: "fixture-turn-choice",
          bindings: [
            { id: "hit", kind: "choice", layoutElementId: "hit-button", field: "choice", optionIndex: 0, autoSubmit: true },
            { id: "stay", kind: "choice", layoutElementId: "stay-button", field: "choice", optionIndex: 1, autoSubmit: true }
          ]
        },
        recipients(context) {
          return [context.local.currentPlayerId || context.state.currentPlayerId];
        },
        view(context) {
          return { prompt: `Turn for ${context.viewer.name}`, options: [{ id: "hit", label: "Hit" }, { id: "stay", label: "Stay" }] };
        },
        submit(context, payload) {
          context.state.lastChoice = { playerId: context.actor.id, choice: payload.choice };
          context.outputs.set("choice", payload.choice);
          context.broadcast.request();
        }
      });
      registry.inputs("fixture.privateWager", {
        name: "Private Wager",
        fields: [
          { key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" },
          { key: "timeoutSeconds", label: "Timeout", control: "number", min: 0, default: 0 }
        ],
        submission: [
          { id: "side", type: "choice", optionsSource: "options" },
          { id: "amount", type: "integer", min: 1, max: 50 }
        ],
        controller: {
          layoutStateId: "fixture-private-wager",
          bindings: [
            { id: "left", kind: "choice", layoutElementId: "left", field: "side", optionIndex: 0 },
            { id: "right", kind: "choice", layoutElementId: "right", field: "side", optionIndex: 1 },
            { id: "amount", kind: "integer", layoutElementId: "amount", field: "amount" },
            { id: "submit", kind: "submit", layoutElementId: "submit" }
          ],
          submitted: {
            layoutStateId: "fixture-wager-confirmed",
            bindings: [
              { id: "confirmedTarget", kind: "text", layoutElementId: "confirmation", source: "target", targetComponentId: "target-text" }
            ]
          }
        },
        completion: "allRecipients",
        disconnect: "completeRemaining",
        timeout: { secondsField: "timeoutSeconds", policy: "complete" },
        recipients(context) {
          return context.players.map((player) => player.id);
        },
        view(context) {
          const target = context.state.offers[context.viewer.id];
          return { target, options: [{ id: "over", label: `Over ${target}` }, { id: "under", label: `Under ${target}` }] };
        },
        submit(context, payload) {
          context.state.wagers ||= {};
          context.state.wagers[context.actor.id] = payload;
        }
      });
      registry.controllerInteractions("fixture.avatarProfile", {
        name: "Avatar profile",
        profileField: "avatarId",
        visibility: "public",
        submission: [{
          id: "avatarId",
          type: "choice",
          optionsSource: "options",
          options: [{ id: "trike" }, { id: "bronto" }, { id: "stego" }]
        }],
        controller: {
          layoutScope: "layer",
          layoutLayerId: "profile-picker",
          disclosure: {
            triggerLayoutElementId: "player-banner",
            triggerLayoutScope: "global",
            ariaLabel: "Choose avatar"
          },
          bindings: [{
            id: "avatars",
            kind: "choiceCollection",
            layoutElementId: "avatar-options",
            field: "avatarId",
            item: { artCompositionId: "fixture-avatar-option", targetComponentId: "label" },
            autoSubmit: true
          }]
        },
        available(context) {
          return context.viewer.active && context.phase !== "post-game";
        },
        view(context) {
          return {
            selectedAvatarId: context.profile.avatarId || "trike",
            options: [
              { id: "trike", label: "Trike" },
              { id: "bronto", label: "Bronto" },
              { id: "stego", label: "Stego" }
            ]
          };
        },
        submit(context, payload) {
          context.profile.set(payload.avatarId);
          context.broadcast.request();
        }
      });
      const renderer = {
        name: "Draw Counter",
        target: { layoutElementId: "draw-counter", layoutScope: "moment" },
        bindings: [
          { id: "label", kind: "text", source: "label", targetComponentId: "counter-text", fallback: "0" }
        ],
        select(context) {
          return { label: String(context.state.draws || 0) };
        }
      };
      registry.stageRenderers("fixture.stageCounter", renderer);
      registry.controllerRenderers("fixture.controllerCounter", renderer);
      registry.controllerRenderers("fixture.layerCounter", {
        ...renderer,
        target: { layoutElementId: "draw-counter", layoutScope: "layer", layoutLayerId: "game-context" }
      });
    }
  });
}

describe("game plugin ABI", () => {
  it("fails closed on malformed actions and renderers at plugin install", () => {
    expect(() => createGamePluginRegistry().install(defineGamePlugin({
      namespace: "broken",
      register(registry) {
        registry.actions("broken.action", { name: "Broken", fields: [] });
      }
    }))).toThrow(/execute function/);

    expect(() => createGamePluginRegistry().install(defineGamePlugin({
      namespace: "broken",
      register(registry) {
        registry.stageRenderers("broken.renderer", {
          name: "Broken",
          target: { layoutElementId: "widget" },
          bindings: [{ id: "bad", kind: "component", source: "value", targetComponentId: "shape", property: "x" }],
          select: () => ({ value: 1 })
        });
      }
    }))).toThrow(/unsupported component property/);

    expect(() => createGamePluginRegistry().install(defineGamePlugin({
      namespace: "broken",
      register(registry) {
        registry.inputs("broken.input", {
          name: "Broken Input",
          fields: [],
          submission: [{ id: "choice", type: "choice", optionsSource: "options" }],
          controller: { layoutStateId: "broken", bindings: [] },
          recipients: () => [],
          view: () => ({}),
          submit() {}
        });
      }
    }))).toThrow(/completion target/);

    expect(() => createGamePluginRegistry().install(defineGamePlugin({
      namespace: "broken",
      register(registry) {
        registry.inputs("broken.input", {
          name: "Broken Input",
          fields: [{ key: "answersSubmittedTargetActionId", label: "After", control: "actionTarget" }],
          submission: [{ id: "choice", type: "choice", optionsSource: "options" }],
          controller: {
            layoutStateId: "broken",
            bindings: [{ id: "amount", kind: "integer", layoutElementId: "amount", field: "choice" }]
          },
          recipients: () => [],
          view: () => ({}),
          submit() {}
        });
      }
    }))).toThrow(/integer submission field/);
  });

  it("validates authored tap and hold submission values against the declared input schema", () => {
    const pluginWithBinding = (binding) => defineGamePlugin({
      namespace: "gesture",
      register(registry) {
        registry.inputs("gesture.choice", {
          name: "Gesture Choice",
          fields: [{ key: "answersSubmittedTargetActionId", label: "After", control: "actionTarget" }],
          submission: [
            { id: "choice", type: "choice", optionsSource: "options" },
            { id: "mode", type: "choice", optionsSource: "modes" },
            { id: "amount", type: "integer", min: 1, max: 5 }
          ],
          controller: { layoutStateId: "gesture", bindings: [binding] },
          recipients: () => [],
          view: () => ({}),
          submit() {}
        });
      }
    });

    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "choice", kind: "choice", layoutElementId: "choice", field: "choice", optionIndex: 0,
      autoSubmit: true,
      submitValues: { mode: "tap", amount: 2 },
      holdSubmit: {
        seconds: 1.5,
        submitValues: { mode: "hold", amount: 4 },
        progress: {
          delaySeconds: 0.5,
          targetComponentId: "hold-meter",
          startLabel: "HoldStart",
          completeLabel: "HoldComplete",
          resetLabel: "Off"
        }
      }
    }))).not.toThrow();
    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "choice", kind: "choice", layoutElementId: "choice", field: "choice", optionIndex: 0,
      holdSubmit: { seconds: 0, submitValues: { mode: "hold" } }
    }))).toThrow(/positive seconds/);
    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "choice", kind: "choice", layoutElementId: "choice", field: "choice", optionIndex: 0,
      autoSubmit: true, submitValues: { undeclared: "value" }
    }))).toThrow(/undeclared submission field/);
    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "choice", kind: "choice", layoutElementId: "choice", field: "choice", optionIndex: 0,
      autoSubmit: true, submitValues: { amount: 9 }
    }))).toThrow(/outside its declared bounds/);
    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "choice", kind: "choice", layoutElementId: "choice", field: "choice", optionIndex: 0,
      holdSubmit: {
        seconds: 1.5,
        submitValues: { mode: "hold" },
        progress: {
          delaySeconds: 1.5,
          targetComponentId: "hold-meter",
          startLabel: "HoldStart",
          completeLabel: "HoldComplete",
          resetLabel: "Off"
        }
      }
    }))).toThrow(/delaySeconds must be non-negative and less than hold seconds/);
  });

  it("accepts a reusable authored choice collection and rejects incomplete item templates", () => {
    const pluginWithBinding = (binding) => defineGamePlugin({
      namespace: "dynamic",
      register(registry) {
        registry.inputs("dynamic.targets", {
          name: "Dynamic Targets",
          fields: [{ key: "answersSubmittedTargetActionId", label: "After", control: "actionTarget" }],
          submission: [{ id: "target", type: "choice", optionsSource: "targets" }],
          controller: { layoutStateId: "dynamic-targets", bindings: [binding] },
          recipients: () => [],
          view: () => ({}),
          submit() {}
        });
      }
    });
    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "targets",
      kind: "choiceCollection",
      layoutElementId: "target-collection",
      field: "target",
      item: {
        artCompositionId: "fixture-controller-target-option",
        targetComponentId: "target-label",
        labelSource: "display.label",
        disabledSource: "disabled"
      },
      autoSubmit: true
    }))).not.toThrow();
    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "targets",
      kind: "choiceCollection",
      layoutElementId: "target-collection",
      field: "target",
      item: { targetComponentId: "target-label" },
      autoSubmit: true
    }))).toThrow(/artCompositionId/);
    expect(() => createGamePluginRegistry().install(pluginWithBinding({
      id: "targets",
      kind: "choiceCollection",
      layoutElementId: "target-collection",
      field: "target",
      item: { artCompositionId: "fixture-controller-target-option" },
      autoSubmit: true
    }))).toThrow(/targetComponentId/);
  });

  it("adds namespaced action metadata, normalization, public serialization, and stage completion", () => {
    const registrations = createGamePluginRegistry().install(fixturePlugin()).actions;
    const definitions = createPluginFlowActionDefinitions(registrations);
    const registry = createFlowActionRegistry({}, definitions);
    const normalized = registry.normalizeAction("fixture.drawCard", {
      type: "fixture.drawCard",
      amount: 99,
      resultVariable: "cards"
    }, { id: "draw", type: "fixture.drawCard" });

    expect(pluginFlowActionTypes(registrations)[0]).toMatchObject({
      id: "fixture.drawCard",
      name: "Draw Card",
      fields: expect.arrayContaining([expect.objectContaining({ key: "amount" })])
    });
    expect(normalized).toMatchObject({ amount: 5, resultVariable: "cards", actorId: "" });
    expect(registry.publicAction(normalized, { id: "draw" })).toMatchObject({
      id: "draw",
      type: "fixture.drawCard",
      amount: 5,
      resultVariable: "cards"
    });
    expect(registry.isCompletableStageActionType("fixture.drawCard")).toBe(true);
    expect(registry.stageActionRunnerDefinitions).toContainEqual({
      actionId: "fixture.drawCard",
      type: "fixture.drawCard",
      runner: "serverEffect"
    });
  });

  it("executes with scoped state, actor capability, deterministic randomness, outputs, and broadcast", async () => {
    const registrations = createGamePluginRegistry().install(fixturePlugin()).actions;
    const broadcastLobby = vi.fn();
    const room = {
      stageCode: "ABCD",
      gameSessionId: 3,
      momentVisitId: 4,
      actionExecutionId: 5,
      vipPlayerId: "p1",
      players: new Map([
        ["p1", { id: "p1", name: "VIP", active: true, points: 0, avatar: { color: "#fff" } }]
      ]),
      flowVariables: {},
      gamePluginState: {}
    };
    const action = {
      id: "draw",
      type: "fixture.drawCard",
      amount: 2,
      resultVariable: "cardsDrawn",
      actorId: "p1"
    };
    const executor = createGameActionExecutor({ actionRegistrations: registrations, broadcastLobby });

    expect(executor.execute(room, action)).toBe(true);
    await Promise.resolve();
    expect(room.gamePluginState.fixture).toMatchObject({ draws: 2, actorWasVip: true });
    expect(room.flowVariables.cardsDrawn).toBe(2);
    expect(broadcastLobby).toHaveBeenCalledWith(room);

    broadcastLobby.mockClear();
    room.revision = 10;
    executor.execute(room, action);
    room.revision = 11;
    await Promise.resolve();
    expect(broadcastLobby).not.toHaveBeenCalled();

    const randomSample = room.gamePluginState.fixture.randomSample;
    room.gamePluginState = {};
    room.flowVariables = {};
    executor.execute(room, action, { deferBroadcast: true });
    expect(room.gamePluginState.fixture.randomSample).toBe(randomSample);

    room.localVariables = {};
    executor.execute(room, { ...action, resultVariable: "l.cardsDrawn" }, { deferBroadcast: true });
    expect(room.localVariables.cardsDrawn).toBe(4);
  });

  it("publishes renderer manifests and JSON-safe live view models without exposing mutable room state", () => {
    const registrations = createGamePluginRegistry().install(fixturePlugin());
    const runtime = createGameRendererRuntime({
      stageRenderers: registrations.stageRenderers,
      controllerRenderers: registrations.controllerRenderers
    });
    const room = {
      phase: "play",
      flowStateId: "play",
      gamePluginState: { fixture: { draws: 3 } },
      flowVariables: {},
      players: new Map()
    };

    expect(runtime.manifests).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "fixture.stageCounter", surface: "stage" }),
      expect.objectContaining({ id: "fixture.controllerCounter", surface: "controller" }),
      expect.objectContaining({
        id: "fixture.layerCounter",
        surface: "controller",
        target: expect.objectContaining({ layoutScope: "layer", layoutLayerId: "game-context" })
      })
    ]));
    expect(runtime.viewModels(room)).toEqual({ "fixture.stageCounter": { label: "3" } });
    room.players.set("p1", { id: "p1", name: "Player", active: true });
    expect(runtime.viewModels(room, "p1")).toMatchObject({
      "fixture.stageCounter": { label: "3" },
      "fixture.controllerCounter": { label: "3" },
      "fixture.layerCounter": { label: "3" }
    });
  });

  it("exposes authoritative public player state to game-owned renderers without requiring engine Art", () => {
    const plugin = defineGamePlugin({
      namespace: "presentation",
      register(registry) {
        registry.stageRenderers("presentation.players", {
          name: "Game-owned player presentation",
          target: { layoutElementId: "players" },
          bindings: [{ id: "label", kind: "text", source: "label", targetComponentId: "label" }],
          select: (context) => ({ label: "Players", players: context.players })
        });
      }
    });
    const registrations = createGamePluginRegistry().install(plugin);
    const runtime = createGameRendererRuntime({
      stageRenderers: registrations.stageRenderers,
      currentAction: () => ({ id: "choice-1" })
    });
    const room = {
      phase: "play",
      flowStateId: "play",
      vipPlayerId: "p1",
      choiceInputActionId: "choice-1",
      choiceInputMode: "once",
      choiceInputAnswers: new Map(),
      displayedPlayerAnswers: new Map([["p1", { text: "Seven", done: true, correct: true, nonce: 3 }]]),
      hiddenPlayerAnswerIds: new Set(),
      gamePluginState: { presentation: {} },
      flowVariables: {},
      players: new Map([["p1", {
        id: "p1",
        name: "Ava",
        active: true,
        points: 12,
        pendingPoints: 4
      }]])
    };

    expect(runtime.viewModels(room)["presentation.players"].players[0]).toEqual({
      id: "p1",
      name: "Ava",
      active: true,
      isVip: true,
      points: 12,
      pendingPoints: 4,
      needsInput: true,
      displayedAnswer: {
        text: "Seven",
        done: true,
        invalid: false,
        correct: true,
        hidden: false,
        nonce: 3
      }
    });
  });

  it("publishes recursive keyed collection manifests and rejects duplicate dynamic keys", () => {
    const plugin = defineGamePlugin({
      namespace: "cards",
      register(registry) {
        registry.stageRenderers("cards.hand", {
          name: "Hand",
          target: { layoutElementId: "hand" },
          bindings: [{
            id: "rows",
            kind: "collection",
            source: "rows",
            item: {
              keySource: "id",
              artCompositionId: "hand-row",
              bindings: [{
                id: "cards",
                kind: "collection",
                source: "cards",
                targetComponentId: "cards-slot",
                item: {
                  keySource: "id",
                  artCompositionId: "card",
                  bindings: [
                    { id: "label", kind: "text", source: "label", targetComponentId: "label" },
                    { id: "state", kind: "state", source: "state", playback: "play" }
                  ]
                }
              }]
            }
          }],
          select: (context) => context.state.hand
        });
      }
    });
    const registrations = createGamePluginRegistry().install(plugin);
    const runtime = createGameRendererRuntime({ stageRenderers: registrations.stageRenderers });
    const room = {
      phase: "play",
      gamePluginState: { cards: { hand: { rows: [{ id: "r1", cards: [{ id: "c1", label: "7", state: "Choosing Start" }] }] } } },
      flowVariables: {},
      players: new Map()
    };

    expect(runtime.manifests[0].bindings[0]).toMatchObject({
      kind: "collection",
      item: { keySource: "id", artCompositionId: "hand-row", bindings: [expect.objectContaining({ kind: "collection" })] }
    });
    expect(runtime.viewModels(room)["cards.hand"].rows[0].cards[0].id).toBe("c1");

    room.gamePluginState.cards.hand.rows[0].cards.push({ id: "c1", label: "duplicate" });
    expect(runtime.viewModels(room)["cards.hand"]).toBeNull();
    expect(room.runtimeFault).toMatchObject({ code: "GAME_PLUGIN_RENDERER_FAILED" });
  });

  it("publishes public players through an ordinary game-owned keyed collection", () => {
    const plugin = defineGamePlugin({
      namespace: "roster",
      register(registry) {
        registry.stageRenderers("roster.tableau", {
          name: "Game-owned player presentation",
          target: { kind: "layout", layoutElementId: "players", layoutScope: "global" },
          bindings: [{
            id: "players", kind: "collection", source: "players",
            item: {
              keySource: "id", artCompositionId: "game-player", bindings: [
                { id: "name", kind: "text", source: "name", targetComponentId: "name" },
                { id: "score", kind: "text", source: "score", targetComponentId: "score" },
                {
                  id: "rows", kind: "collection", source: "rows", targetComponentId: "rows",
                  item: { keySource: "id", artCompositionId: "game-row", bindings: [] }
                }
              ]
            }
          }],
          select: (context) => ({ players: context.state.players })
        });
      }
    });
    const registrations = createGamePluginRegistry().install(plugin);
    const runtime = createGameRendererRuntime({ stageRenderers: registrations.stageRenderers });
    const room = {
      phase: "play",
      gamePluginState: { roster: { players: [{ id: "p1", name: "Ava", score: "12", rows: [] }] } },
      flowVariables: {},
      players: new Map([["p1", { id: "p1", name: "Ava", active: true }]])
    };

    expect(runtime.manifests[0].target).toEqual({
      kind: "layout",
      layoutElementId: "players",
      layoutScope: "global",
      layoutLayerId: ""
    });
    expect(runtime.viewModels(room)["roster.tableau"].players[0]).toMatchObject({ id: "p1", score: "12" });

    room.gamePluginState.roster.players.push({ id: "p1", name: "Duplicate", score: "duplicate", rows: [] });
    expect(runtime.viewModels(room)["roster.tableau"]).toBeNull();
    expect(room.runtimeFault).toMatchObject({ code: "GAME_PLUGIN_RENDERER_FAILED" });
  });

  it("runs authenticated current-player and private per-player input barriers", async () => {
    const registrations = createGamePluginRegistry().install(fixturePlugin()).inputs;
    expect(pluginFlowActionTypes(registrations)[0]).toMatchObject({ category: "input", primaryOnly: true });
    const definitions = createPluginInputActionDefinitions(registrations);
    const registry = createFlowActionRegistry({}, definitions);
    expect(registry.stageActionRunnerDefinitions).toContainEqual({
      actionId: "fixture.turnChoice",
      type: "fixture.turnChoice",
      runner: "controllerInputBarrier"
    });
    const room = {
      stageCode: "TEST",
      phase: "play",
      flowStateId: "play",
      gameSessionId: 2,
      momentVisitId: 3,
      controllerInputVisitCounter: 0,
      vipPlayerId: "p1",
      players: new Map([
        ["p1", { id: "p1", name: "One", active: true, points: 0 }],
        ["p2", { id: "p2", name: "Two", active: true, points: 0 }]
      ]),
      flowVariables: {},
      localVariables: { currentPlayerId: "p1" },
      gamePluginState: { fixture: { currentPlayerId: "p1", offers: { p1: 12, p2: 29 } } }
    };
    let action = {
      id: "turn",
      type: "fixture.turnChoice",
      answersSubmittedTargetActionId: "after-turn",
      resultVariable: "turnResult"
    };
    const jumpToAction = vi.fn();
    const broadcastLobby = vi.fn();
    const runtime = createGameInputRuntime({
      inputRegistrations: registrations,
      currentRoomAction: () => action,
      jumpToAction,
      broadcastLobby
    });
    expect(runtime.ensure(room, action)).toBe(true);
    expect(broadcastLobby).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(broadcastLobby).toHaveBeenCalledOnce();
    broadcastLobby.mockClear();
    expect(runtime.ensure(room, action)).toBe(true);
    await Promise.resolve();
    expect(broadcastLobby).not.toHaveBeenCalled();
    expect(runtime.payloadForViewer(room, action, "p1")).toMatchObject({
      type: "fixture.turnChoice",
      viewModel: { prompt: "Turn for One" }
    });
    expect(runtime.payloadForViewer(room, action, "p2")).toBeNull();
    const visitId = room.gamePluginInputVisitId;
    expect(runtime.submit(room, "p2", {
      actionId: "turn", visitId, gameSessionId: 2, submissionId: "bad", payload: { choice: "hit" }
    })).toMatchObject({ status: 403 });
    expect(runtime.submit(room, "p1", {
      actionId: "turn", visitId: visitId - 1, gameSessionId: 2, submissionId: "stale", payload: { choice: "hit" }
    })).toMatchObject({ status: 409 });
    expect(runtime.submit(room, "p1", {
      actionId: "turn", visitId, gameSessionId: 2, submissionId: "one", payload: { choice: "hit" }
    })).toMatchObject({ status: 200, duplicate: false });
    expect(room.gamePluginState.fixture.lastChoice).toEqual({ playerId: "p1", choice: "hit" });
    expect(room.flowVariables.turnResult).toBe("hit");
    expect(jumpToAction).toHaveBeenCalledWith(room, "after-turn", action);

    action = { id: "wager", type: "fixture.privateWager", answersSubmittedTargetActionId: "after-wagers" };
    runtime.ensure(room, action);
    const wagerVisit = room.gamePluginInputVisitId;
    expect(runtime.payloadForViewer(room, action, "p1").viewModel.target).toBe(12);
    expect(runtime.payloadForViewer(room, action, "p2").viewModel.target).toBe(29);
    expect(runtime.submit(room, "p1", {
      actionId: "wager", visitId: wagerVisit, gameSessionId: 2, submissionId: "w1",
      payload: { side: "over", amount: 50 }
    })).toMatchObject({ status: 200 });
    expect(runtime.payloadForViewer(room, action, "p1")).toMatchObject({
      submitted: true,
      layoutStateId: "fixture-wager-confirmed",
      viewModel: { target: 12 }
    });
    expect(runtime.payloadForViewer(room, action, "p2")).toMatchObject({
      submitted: false,
      layoutStateId: "fixture-private-wager",
      viewModel: { target: 29 }
    });
    expect(runtime.manifests.find((manifest) => manifest.id === "fixture.privateWager").controller.submitted)
      .toMatchObject({ layoutStateId: "fixture-wager-confirmed", bindings: [{ id: "confirmedTarget" }] });
    expect(broadcastLobby).toHaveBeenCalled();
    expect(runtime.submit(room, "p1", {
      actionId: "wager", visitId: wagerVisit, gameSessionId: 2, submissionId: "w1",
      payload: { side: "over", amount: 50 }
    })).toMatchObject({ status: 200, duplicate: true });
    expect(runtime.submit(room, "p2", {
      actionId: "wager", visitId: wagerVisit, gameSessionId: 2, submissionId: "w2",
      payload: { side: "under", amount: 51 }
    })).toMatchObject({ status: 422 });
    room.players.get("p2").active = false;
    expect(runtime.playerDisconnected(room)).toBe(true);
    expect(jumpToAction).toHaveBeenLastCalledWith(room, "after-wagers", action);
  });

  it("runs persistent authenticated controller interactions outside Flow without granting cross-player mutation", () => {
    const registrations = createGamePluginRegistry().install(fixturePlugin()).controllerInteractions;
    const broadcastLobby = vi.fn();
    const runtime = createGameControllerInteractionRuntime({ registrations, broadcastLobby });
    const room = {
      stageCode: "TEST",
      phase: "lobby",
      flowStateId: "lobby",
      gameSessionId: 0,
      vipPlayerId: "p1",
      controllerInteractionVisitCounter: 0,
      players: new Map([
        ["p1", { id: "p1", name: "One", active: true, points: 0 }],
        ["p2", { id: "p2", name: "Two", active: true, points: 0 }]
      ]),
      flowVariables: {},
      localVariables: {},
      gamePluginState: { fixture: { round: 1 } },
      gamePluginProfiles: {}
    };

    const p1 = runtime.payloadsForViewer(room, "p1")[0];
    const p2 = runtime.payloadsForViewer(room, "p2")[0];
    expect(p1).toMatchObject({
      id: "fixture.avatarProfile",
      gameSessionId: 0,
      layoutScope: "layer",
      layoutLayerId: "profile-picker",
      viewModel: { selectedAvatarId: "trike" }
    });
    expect(runtime.manifests[0].controller.disclosure).toEqual({
      triggerLayoutElementId: "player-banner",
      triggerLayoutScope: "global",
      ariaLabel: "Choose avatar"
    });
    expect(p2.visitId).not.toBe(p1.visitId);
    expect(runtime.payloadsForViewer(room, "p1")[0].visitId).toBe(p1.visitId);

    expect(runtime.submit(room, "p1", {
      interactionId: "fixture.avatarProfile",
      visitId: p1.visitId - 1,
      gameSessionId: 0,
      submissionId: "stale",
      payload: { avatarId: "bronto" }
    })).toMatchObject({ status: 409, errorCode: "GAME_PLUGIN_CONTROLLER_INTERACTION_STALE" });
    expect(runtime.submit(room, "p1", {
      interactionId: "fixture.avatarProfile",
      visitId: p1.visitId,
      gameSessionId: 0,
      submissionId: "invalid",
      payload: { avatarId: "raptor" }
    })).toMatchObject({ status: 422, errorCode: "GAME_PLUGIN_CONTROLLER_INTERACTION_INVALID" });
    expect(runtime.submit(room, "p1", {
      interactionId: "fixture.avatarProfile",
      visitId: p1.visitId,
      gameSessionId: 0,
      submissionId: "choose-bronto",
      payload: { avatarId: "bronto" }
    })).toMatchObject({ status: 200, duplicate: false });
    expect(room.gamePluginProfiles.fixture).toEqual({ p1: { avatarId: "bronto" }, p2: {} });
    expect(broadcastLobby).toHaveBeenCalledOnce();
    expect(runtime.submit(room, "p1", {
      interactionId: "fixture.avatarProfile",
      visitId: p1.visitId,
      gameSessionId: 0,
      submissionId: "choose-bronto",
      payload: { avatarId: "bronto" }
    })).toMatchObject({ status: 200, duplicate: true });

    const next = runtime.payloadsForViewer(room, "p1")[0];
    expect(next.visitId).not.toBe(p1.visitId);
    expect(next.viewModel.selectedAvatarId).toBe("bronto");
    room.gameSessionId = 1;
    expect(runtime.payloadsForViewer(room, "p1")[0].visitId).not.toBe(next.visitId);
    expect(room.gamePluginProfiles.fixture.p1.avatarId).toBe("bronto");
    expect(runtime.submit(room, "p1", {
      interactionId: "fixture.avatarProfile",
      visitId: p1.visitId,
      gameSessionId: 0,
      submissionId: "choose-bronto",
      payload: { avatarId: "bronto" }
    })).toMatchObject({ status: 409, errorCode: "GAME_PLUGIN_CONTROLLER_INTERACTION_STALE" });
    room.phase = "post-game";
    expect(runtime.payloadsForViewer(room, "p1")).toEqual([]);
  });

  it("completes an input barrier according to its authored timeout policy", () => {
    vi.useFakeTimers();
    try {
      const registrations = createGamePluginRegistry().install(fixturePlugin()).inputs;
      const room = {
        stageCode: "TEST",
        phase: "play",
        flowStateId: "play",
        gameSessionId: 2,
        momentVisitId: 3,
        controllerInputVisitCounter: 0,
        players: new Map([
          ["p1", { id: "p1", name: "One", active: true, points: 0 }]
        ]),
        flowVariables: {},
        gamePluginState: { fixture: { offers: { p1: 12 } } }
      };
      const action = {
        id: "wager",
        type: "fixture.privateWager",
        answersSubmittedTargetActionId: "after-timeout",
        timeoutSeconds: 1
      };
      const jumpToAction = vi.fn();
      const runtime = createGameInputRuntime({
        inputRegistrations: registrations,
        currentRoomAction: () => action,
        jumpToAction
      });

      expect(runtime.ensure(room, action)).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(jumpToAction).toHaveBeenCalledWith(room, "after-timeout", action);
    } finally {
      vi.useRealTimers();
    }
  });
});
