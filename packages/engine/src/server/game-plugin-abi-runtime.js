"use strict";

const { createRuntimeFault } = require("./runtime-fault-runtime");

const SAFE_COMPONENT_PROPERTIES = new Set([
  "defaultText",
  "fill",
  "imageTint",
  "isShown",
  "opacity",
  "rotation",
  "scale"
]);

function cloneJson(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizePluginField(field, value) {
  const fallback = cloneJson(field.default, field.control === "boolean" ? false : field.control === "number" || field.control === "integer" ? 0 : "");
  if (field.control === "boolean") return value === undefined ? fallback === true : value === true;
  if (field.control === "number" || field.control === "integer") {
    const numeric = Number(value ?? fallback);
    const finite = Number.isFinite(numeric) ? numeric : Number(fallback || 0);
    const bounded = Math.max(
      Number.isFinite(Number(field.min)) ? Number(field.min) : -Number.MAX_SAFE_INTEGER,
      Math.min(Number.isFinite(Number(field.max)) ? Number(field.max) : Number.MAX_SAFE_INTEGER, finite)
    );
    return field.control === "integer" ? Math.trunc(bounded) : bounded;
  }
  if (field.control === "select") {
    const optionIds = field.options.map((option) => String(option.id));
    const candidate = String(value ?? fallback ?? "");
    return optionIds.includes(candidate) ? candidate : optionIds[0];
  }
  return String(value ?? fallback ?? "").slice(0, 10000);
}

function publicActionRegistration(registration) {
  const value = registration.value;
  return Object.freeze({
    id: registration.id,
    name: String(value.name),
    category: String(value.category || "standard"),
    deprecated: value.deprecated === true,
    primaryOnly: value.primaryOnly === true,
    fields: Object.freeze((value.fields || []).map((field) => Object.freeze(cloneJson(field)))),
    outputs: Object.freeze((value.outputs || []).map((output) => Object.freeze(cloneJson(output))))
  });
}

function createPluginFlowActionDefinitions(actionRegistrations = []) {
  return actionRegistrations.map((registration) => {
    const config = registration.value;
    return {
      id: registration.id,
      name: String(config.name),
      category: String(config.category || "standard"),
      deprecated: config.deprecated === true,
      primaryOnly: config.primaryOnly === true,
      canCompleteFromStage: true,
      stageActionType: registration.id,
      stageRunner: "serverEffect",
      pluginRegistration: registration,
      normalize(action, base) {
        const fields = Object.fromEntries((config.fields || []).map((field) => [
          field.key,
          normalizePluginField(field, action?.[field.key])
        ]));
        return { ...base, ...fields };
      },
      toPublic(action, base) {
        const fields = Object.fromEntries((config.fields || []).map((field) => [
          field.key,
          normalizePluginField(field, action?.[field.key])
        ]));
        return { ...base, type: registration.id, ...fields };
      },
      applyRoomEffect(room, action, context) {
        context.executeGameAction(room, action);
      }
    };
  });
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicRandom(seedText) {
  let state = hashSeed(seedText) || 0x9e3779b9;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function publicPlayerSnapshot(player, room) {
  if (!player) return null;
  return Object.freeze({
    id: String(player.id || ""),
    name: String(player.name || ""),
    active: player.active !== false,
    isVip: String(room.vipPlayerId || "") === String(player.id || ""),
    points: Number(player.points || 0),
    avatar: Object.freeze(cloneJson(player.avatar, {}))
  });
}

function pluginStateFor(room, namespace) {
  if (!room.gamePluginState || typeof room.gamePluginState !== "object" || Array.isArray(room.gamePluginState)) {
    room.gamePluginState = {};
  }
  if (!room.gamePluginState[namespace] || typeof room.gamePluginState[namespace] !== "object" || Array.isArray(room.gamePluginState[namespace])) {
    room.gamePluginState[namespace] = {};
  }
  return room.gamePluginState[namespace];
}

function createGameActionExecutor({
  actionRegistrations = [],
  activePlayers = (room) => Array.from(room.players?.values?.() || []).filter((player) => player.active !== false),
  broadcastLobby = () => {}
} = {}) {
  const registrationById = new Map(actionRegistrations.map((registration) => [registration.id, registration]));

  function execute(room, action, execution = {}) {
    const registration = registrationById.get(action?.type);
    if (!registration) return false;
    const config = registration.value;
    const namespace = registration.ownerNamespace;
    const players = activePlayers(room);
    const playerById = new Map(players.map((player) => [String(player.id || ""), player]));
    const actorId = config.actorPlayerIdField ? String(action?.[config.actorPlayerIdField] || "") : "";
    const actor = publicPlayerSnapshot(playerById.get(actorId), room);
    const random = deterministicRandom([
      room.stageCode,
      room.gameSessionId,
      room.momentVisitId,
      execution.actionExecutionId || room.actionExecutionId || 0,
      action.id,
      registration.id
    ].join(":"));
    let broadcastRequested = false;
    const outputDefinitions = new Map((config.outputs || []).map((output) => [output.id, output]));
    const context = Object.freeze({
      namespace,
      state: pluginStateFor(room, namespace),
      actor,
      players: Object.freeze(players.map((player) => publicPlayerSnapshot(player, room))),
      capability: Object.freeze({
        hasActor: Boolean(actor),
        isVip: actor?.isVip === true
      }),
      random: Object.freeze({
        float: () => random(),
        integer: (min, max) => {
          const lower = Math.ceil(Math.min(Number(min), Number(max)));
          const upper = Math.floor(Math.max(Number(min), Number(max)));
          return lower + Math.floor(random() * Math.max(1, upper - lower + 1));
        },
        pick: (values) => Array.isArray(values) && values.length ? values[Math.floor(random() * values.length)] : undefined
      }),
      outputs: Object.freeze({
        set(outputId, value) {
          const output = outputDefinitions.get(String(outputId || ""));
          if (!output) throw new Error(`Unknown output "${String(outputId || "")}"`);
          const variableName = String(action?.[output.variableField] || output.defaultVariable || "").trim();
          if (!/^[A-Za-z_$][A-Za-z0-9_$.-]{0,127}$/.test(variableName)) {
            throw new Error(`Output "${output.id}" requires a valid authored Flow variable`);
          }
          room.flowVariables = room.flowVariables && typeof room.flowVariables === "object" ? room.flowVariables : {};
          room.flowVariables[variableName] = cloneJson(value, null);
        }
      }),
      broadcast: Object.freeze({
        request() {
          broadcastRequested = true;
        }
      })
    });
    try {
      const result = config.execute(context, Object.freeze(cloneJson(action, {})));
      if (result && typeof result.then === "function") {
        throw new Error("Game action execute functions must be synchronous");
      }
      if (broadcastRequested && execution.deferBroadcast !== true) queueMicrotask(() => broadcastLobby(room));
      return true;
    } catch (error) {
      createRuntimeFault(room, {
        code: "GAME_PLUGIN_ACTION_FAILED",
        message: `Game action "${registration.id}" failed: ${String(error?.message || error)}`,
        actionId: action?.id,
        expected: "A synchronous game-owned action limited to its scoped execution context",
        actual: String(error?.message || error)
      });
      return true;
    }
  }

  return Object.freeze({ execute, has: (type) => registrationById.has(type) });
}

function rendererManifest(registration, surface) {
  const value = registration.value;
  return Object.freeze({
    id: registration.id,
    name: String(value.name),
    surface,
    target: Object.freeze({
      layoutElementId: String(value.target.layoutElementId),
      layoutScope: String(value.target.layoutScope || "moment")
    }),
    bindings: Object.freeze(value.bindings.map((binding) => Object.freeze({
      id: String(binding.id),
      kind: binding.kind,
      source: String(binding.source),
      targetComponentId: String(binding.targetComponentId),
      ...(binding.kind === "component" ? { property: binding.property } : {}),
      ...("fallback" in binding ? { fallback: cloneJson(binding.fallback) } : {})
    })))
  });
}

function createGameRendererRuntime({ stageRenderers = [], controllerRenderers = [], activePlayers } = {}) {
  const registrations = [
    ...stageRenderers.map((registration) => ({ ...registration, surface: "stage" })),
    ...controllerRenderers.map((registration) => ({ ...registration, surface: "controller" }))
  ];
  const manifests = registrations.map((registration) => rendererManifest(registration, registration.surface));

  function viewModels(room) {
    const players = (activePlayers ? activePlayers(room) : Array.from(room.players?.values?.() || [])).map((player) => publicPlayerSnapshot(player, room));
    const result = {};
    for (const registration of registrations) {
      const context = Object.freeze({
        namespace: registration.ownerNamespace,
        state: cloneJson(pluginStateFor(room, registration.ownerNamespace), {}),
        players: Object.freeze(players),
        flow: Object.freeze(cloneJson(room.flowVariables, {})),
        phase: String(room.phase || ""),
        flowStateId: String(room.flowStateId || room.phase || "")
      });
      try {
        result[registration.id] = cloneJson(registration.value.select(context), null);
      } catch (error) {
        createRuntimeFault(room, {
          code: "GAME_PLUGIN_RENDERER_FAILED",
          message: `Game renderer "${registration.id}" failed: ${String(error?.message || error)}`,
          expected: "A JSON-safe renderer view model",
          actual: String(error?.message || error)
        });
        result[registration.id] = null;
      }
    }
    return result;
  }

  return Object.freeze({ manifests: Object.freeze(manifests), viewModels });
}

function pluginFlowActionTypes(actionRegistrations = []) {
  return actionRegistrations.map(publicActionRegistration);
}

module.exports = {
  SAFE_COMPONENT_PROPERTIES,
  createGameActionExecutor,
  createGameRendererRuntime,
  createPluginFlowActionDefinitions,
  pluginFlowActionTypes
};
