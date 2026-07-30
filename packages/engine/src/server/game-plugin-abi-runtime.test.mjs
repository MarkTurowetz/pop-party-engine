import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGamePluginRegistry, defineGamePlugin } = require("./game-plugin-runtime");
const {
  createGameActionExecutor,
  createGameRendererRuntime,
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

    const randomSample = room.gamePluginState.fixture.randomSample;
    room.gamePluginState = {};
    room.flowVariables = {};
    executor.execute(room, action, { deferBroadcast: true });
    expect(room.gamePluginState.fixture.randomSample).toBe(randomSample);
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
      expect.objectContaining({ id: "fixture.controllerCounter", surface: "controller" })
    ]));
    expect(runtime.viewModels(room)).toMatchObject({
      "fixture.stageCounter": { label: "3" },
      "fixture.controllerCounter": { label: "3" }
    });
  });
});
