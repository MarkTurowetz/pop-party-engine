"use strict";

const { createRuntimeFault } = require("./runtime-fault-runtime");
const { writeScopePath } = require("./subroutine-interface-runtime");

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

function assertJsonValue(value, label, seen = new Set()) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error(`${label} must be JSON-safe`);
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new Error(`${label} must not contain circular references`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${label}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function normalizePluginField(field, value, context = {}) {
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
  if (field.control === "actionTarget" && typeof context.flowActionTarget === "function") {
    return context.flowActionTarget(value ?? fallback);
  }
  return String(value ?? fallback ?? "").slice(0, 10000);
}

function publicActionRegistration(registration) {
  const value = registration.value;
  return Object.freeze({
    id: registration.id,
    name: String(value.name),
    category: registration.kind === "inputs" ? "input" : String(value.category || "standard"),
    deprecated: value.deprecated === true,
    primaryOnly: registration.kind === "inputs" || value.primaryOnly === true,
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
      normalize(action, base, context) {
        const fields = Object.fromEntries((config.fields || []).map((field) => [
          field.key,
          normalizePluginField(field, action?.[field.key], context)
        ]));
        return { ...base, ...fields };
      },
      toPublic(action, base, context) {
        const fields = Object.fromEntries((config.fields || []).map((field) => [
          field.key,
          normalizePluginField(field, action?.[field.key], context)
        ]));
        return { ...base, type: registration.id, ...fields };
      },
      applyRoomEffect(room, action, context) {
        context.executeGameAction(room, action);
      }
    };
  });
}

function createPluginInputActionDefinitions(inputRegistrations = []) {
  return inputRegistrations.map((registration) => {
    const config = registration.value;
    return {
      id: registration.id,
      name: String(config.name),
      category: "input",
      deprecated: config.deprecated === true,
      primaryOnly: true,
      canCompleteFromStage: true,
      stageActionType: registration.id,
      stageRunner: "controllerInputBarrier",
      completionCleanup: "pluginInput",
      pluginRegistration: registration,
      normalize(action, base, context) {
        const fields = Object.fromEntries((config.fields || []).map((field) => [
          field.key,
          normalizePluginField(field, action?.[field.key], context)
        ]));
        return { ...base, ...fields };
      },
      toPublic(action, base, context) {
        const fields = Object.fromEntries((config.fields || []).map((field) => [
          field.key,
          normalizePluginField(field, action?.[field.key], context)
        ]));
        return { ...base, type: registration.id, ...fields };
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

function playerNeedsInput(player, room, currentAction) {
  const currentActionId = String(currentAction?.id || "");
  const hasChoiceInput = Boolean(room.choiceInputActionId) && room.choiceInputActionId === currentActionId;
  const hasTextInput = Boolean(room.textInputActionId) && room.textInputActionId === currentActionId;
  const hasMicrophoneInput = Boolean(room.microphoneAccessActionId) && room.microphoneAccessActionId === currentActionId;
  const hasPluginInput = Boolean(room.gamePluginInputActionId) && room.gamePluginInputActionId === currentActionId;
  const needsChoice = hasChoiceInput && (
    room.choiceInputMode === "continuous" || !room.choiceInputAnswers?.get(player.id)
  );
  const needsText = hasTextInput
    && (room.textInputMode !== "voiceVip" || player.id === room.vipPlayerId)
    && room.textInputAnswers?.get(player.id)?.done !== true;
  const needsMicrophone = hasMicrophoneInput
    && (room.microphoneAccessMode === "all" || player.id === room.vipPlayerId)
    && room.microphoneAccessAnswers?.get(player.id)?.done !== true;
  const needsPlugin = hasPluginInput
    && room.gamePluginInputRecipientIds?.has(player.id) === true
    && !room.gamePluginInputSubmissions?.has(player.id);
  return player.active !== false && (needsChoice || needsText || needsMicrophone || needsPlugin);
}

function displayedAnswerSnapshot(player, room) {
  const answer = room.displayedPlayerAnswers?.get(player.id) || null;
  if (!answer) return null;
  return Object.freeze({
    ...(answer.optionIndex == null ? {} : { optionIndex: Number(answer.optionIndex) }),
    ...(answer.originalOptionIndex == null ? {} : { originalOptionIndex: Number(answer.originalOptionIndex) }),
    ...(answer.text == null ? {} : { text: String(answer.text) }),
    done: answer.done === true,
    invalid: answer.invalid === true,
    correct: answer.correct === true ? true : answer.correct === false ? false : null,
    hidden: room.hiddenPlayerAnswerIds?.has(player.id) === true,
    nonce: answer.nonce || 0
  });
}

function publicPlayerSnapshot(player, room, currentAction = null) {
  if (!player) return null;
  return Object.freeze({
    id: String(player.id || ""),
    name: String(player.name || ""),
    active: player.active !== false,
    isVip: String(room.vipPlayerId || "") === String(player.id || ""),
    points: Number(player.points || 0),
    pendingPoints: Number(player.pendingPoints || 0),
    needsInput: playerNeedsInput(player, room, currentAction),
    displayedAnswer: displayedAnswerSnapshot(player, room)
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

function writePluginOutput(room, variableName, value) {
  if (/^[gGlL]\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(variableName)) {
    room.G = room.G && typeof room.G === "object" && !Array.isArray(room.G) ? room.G : {};
    room.localVariables = room.localVariables
      && typeof room.localVariables === "object"
      && !Array.isArray(room.localVariables)
      ? room.localVariables
      : {};
    writeScopePath(room.G, room.localVariables, variableName, value);
    return;
  }
  room.flowVariables = room.flowVariables && typeof room.flowVariables === "object" ? room.flowVariables : {};
  room.flowVariables[variableName] = cloneJson(value, null);
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
      local: Object.freeze(cloneJson(room.localVariables, {})),
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
          writePluginOutput(room, variableName, value);
        }
      }),
      broadcast: Object.freeze({
        request() {
          broadcastRequested = true;
        }
      })
    });
    try {
      const revisionBeforeExecution = Number(room.revision || 0);
      const result = config.execute(context, Object.freeze(cloneJson(action, {})));
      if (result && typeof result.then === "function") {
        throw new Error("Game action execute functions must be synchronous");
      }
      if (broadcastRequested && execution.deferBroadcast !== true) {
        queueMicrotask(() => {
          if (Number(room.revision || 0) === revisionBeforeExecution) broadcastLobby(room);
        });
      }
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

function rendererBindingManifest(binding) {
  return Object.freeze({
    id: String(binding.id),
    kind: binding.kind,
    source: String(binding.source),
    ...(binding.targetComponentId ? { targetComponentId: String(binding.targetComponentId) } : {}),
    ...(binding.kind === "component" ? { property: binding.property } : {}),
    ...(binding.kind === "state" ? { playback: String(binding.playback || "play") } : {}),
    ...(binding.kind === "collection" ? {
      item: Object.freeze({
        keySource: String(binding.item.keySource),
        artCompositionId: String(binding.item.artCompositionId),
        bindings: Object.freeze(binding.item.bindings.map(rendererBindingManifest))
      })
    } : {}),
    ...("fallback" in binding ? { fallback: cloneJson(binding.fallback) } : {})
  });
}

function rendererManifest(registration, surface) {
  const value = registration.value;
  return Object.freeze({
    id: registration.id,
    name: String(value.name),
    surface,
    target: Object.freeze({
      kind: "layout",
      layoutElementId: String(value.target.layoutElementId),
      layoutScope: String(value.target.layoutScope || "moment"),
      layoutLayerId: String(value.target.layoutLayerId || "")
    }),
    bindings: Object.freeze(value.bindings.map(rendererBindingManifest))
  });
}

function rendererPathValue(root, path) {
  let current = root;
  for (const segment of String(path || "").split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function assertRendererCollectionModel(bindings, model, path = "model") {
  for (const binding of bindings) {
    if (binding.kind !== "collection") continue;
    const selected = rendererPathValue(model, binding.source);
    const value = selected === undefined ? binding.fallback : selected;
    if (!Array.isArray(value)) throw new Error(`${path}.${binding.source} must be an array`);
    const keys = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${path}.${binding.source}[${index}] must be an object`);
      const key = rendererPathValue(item, binding.item.keySource);
      if (typeof key !== "string" && typeof key !== "number") throw new Error(`${path}.${binding.source}[${index}] requires a string or number key`);
      const normalizedKey = String(key);
      if (!normalizedKey || keys.has(normalizedKey)) throw new Error(`${path}.${binding.source} contains an empty or duplicate item key "${normalizedKey}"`);
      keys.add(normalizedKey);
      assertRendererCollectionModel(binding.item.bindings, item, `${path}.${binding.source}[${normalizedKey}]`);
    }
  }
}

function createGameRendererRuntime({
  stageRenderers = [],
  controllerRenderers = [],
  activePlayers,
  currentAction = () => null
} = {}) {
  const registrations = [
    ...stageRenderers.map((registration) => ({ ...registration, surface: "stage" })),
    ...controllerRenderers.map((registration) => ({ ...registration, surface: "controller" }))
  ];
  const manifests = registrations.map((registration) => rendererManifest(registration, registration.surface));

  function viewModels(room, viewerPlayerId = "") {
    const action = currentAction(room);
    const players = (activePlayers ? activePlayers(room) : Array.from(room.players?.values?.() || []))
      .map((player) => publicPlayerSnapshot(player, room, action));
    const result = {};
    for (const registration of registrations) {
      if (registration.surface === "controller" && !viewerPlayerId) continue;
      const viewer = registration.surface === "controller"
        ? players.find((player) => player.id === String(viewerPlayerId || "")) || null
        : null;
      const context = Object.freeze({
        namespace: registration.ownerNamespace,
        state: cloneJson(pluginStateFor(room, registration.ownerNamespace), {}),
        players: Object.freeze(players),
        viewer,
        capability: Object.freeze({
          hasViewer: Boolean(viewer),
          isVip: viewer?.isVip === true
        }),
        flow: Object.freeze(cloneJson(room.flowVariables, {})),
        local: Object.freeze(cloneJson(room.localVariables, {})),
        phase: String(room.phase || ""),
        flowStateId: String(room.flowStateId || room.phase || "")
      });
      try {
        const selected = registration.value.select(context);
        assertJsonValue(selected, `Game renderer "${registration.id}" view model`);
        assertRendererCollectionModel(registration.value.bindings, selected);
        result[registration.id] = cloneJson(selected, null);
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

function inputManifest(registration) {
  const config = registration.value;
  return Object.freeze({
    id: registration.id,
    name: String(config.name),
    submission: Object.freeze(config.submission.map((field) => Object.freeze(cloneJson(field)))),
    controller: Object.freeze({
      layoutStateId: String(config.controller.layoutStateId || ""),
      layoutStateIdField: String(config.controller.layoutStateIdField || ""),
      bindings: Object.freeze(config.controller.bindings.map((binding) => Object.freeze(cloneJson(binding)))),
      ...(config.controller.submitted ? {
        submitted: Object.freeze({
          layoutStateId: String(config.controller.submitted.layoutStateId || ""),
          bindings: Object.freeze(config.controller.submitted.bindings.map((binding) => Object.freeze(cloneJson(binding))))
        })
      } : {})
    })
  });
}

function createOutputWriter(room, action, config) {
  const outputDefinitions = new Map((config.outputs || []).map((output) => [output.id, output]));
  return Object.freeze({
    set(outputId, value) {
      const output = outputDefinitions.get(String(outputId || ""));
      if (!output) throw new Error(`Unknown output "${String(outputId || "")}"`);
      const variableName = String(action?.[output.variableField] || output.defaultVariable || "").trim();
      if (!/^[A-Za-z_$][A-Za-z0-9_$.-]{0,127}$/.test(variableName)) {
        throw new Error(`Output "${output.id}" requires a valid authored Flow variable`);
      }
      writePluginOutput(room, variableName, value);
    }
  });
}

function inputRandom(room, action, registration, actorId, submissionId) {
  const random = deterministicRandom([
    room.stageCode,
    room.gameSessionId,
    room.momentVisitId,
    room.gamePluginInputVisitId,
    action.id,
    registration.id,
    actorId,
    submissionId
  ].join(":"));
  return Object.freeze({
    float: () => random(),
    integer: (min, max) => {
      const lower = Math.ceil(Math.min(Number(min), Number(max)));
      const upper = Math.floor(Math.max(Number(min), Number(max)));
      return lower + Math.floor(random() * Math.max(1, upper - lower + 1));
    },
    pick: (values) => Array.isArray(values) && values.length ? values[Math.floor(random() * values.length)] : undefined
  });
}

function propertyPathValue(root, path) {
  let current = root;
  for (const segment of String(path || "").split(".").filter(Boolean)) {
    if (!current || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

function validateInputPayload(config, viewModel, rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
  const result = {};
  for (const field of config.submission) {
    const value = payload[field.id];
    if (field.type === "choice") {
      const options = propertyPathValue(viewModel, field.optionsSource);
      if (!Array.isArray(options) || !options.length) throw new Error(`Choice field "${field.id}" has no eligible options`);
      const optionId = String(value ?? "");
      const eligibleIds = options.map((option, index) => String(option && typeof option === "object" ? option.id ?? index : option));
      if (!eligibleIds.includes(optionId)) throw new Error(`Choice field "${field.id}" is invalid`);
      result[field.id] = optionId;
      continue;
    }
    const number = Number(value);
    if (!Number.isInteger(number) || number < Number(field.min) || number > Number(field.max)) {
      throw new Error(`Integer field "${field.id}" must be between ${field.min} and ${field.max}`);
    }
    result[field.id] = number;
  }
  return Object.freeze(result);
}

function createGameInputRuntime({
  inputRegistrations = [],
  activePlayers = (room) => Array.from(room.players?.values?.() || []).filter((player) => player.active !== false),
  currentRoomAction,
  jumpToAction,
  broadcastLobby = () => {}
} = {}) {
  const registrationById = new Map(inputRegistrations.map((registration) => [registration.id, registration]));
  const manifests = Object.freeze(inputRegistrations.map(inputManifest));

  function clear(room) {
    if (room.gamePluginInputTimeoutId) clearTimeout(room.gamePluginInputTimeoutId);
    room.gamePluginInputTimeoutId = null;
    room.gamePluginInputActionId = "";
    room.gamePluginInputType = "";
    room.gamePluginInputVisitId = 0;
    room.gamePluginInputGameSessionId = 0;
    room.gamePluginInputRecipientIds = new Set();
    room.gamePluginInputSubmissions = new Map();
  }

  function scopedReadContext(room, registration) {
    const players = activePlayers(room).map((player) => publicPlayerSnapshot(player, room));
    return Object.freeze({
      namespace: registration.ownerNamespace,
      state: Object.freeze(cloneJson(pluginStateFor(room, registration.ownerNamespace), {})),
      players: Object.freeze(players),
      flow: Object.freeze(cloneJson(room.flowVariables, {})),
      local: Object.freeze(cloneJson(room.localVariables, {})),
      phase: String(room.phase || ""),
      flowStateId: String(room.flowStateId || room.phase || "")
    });
  }

  function fail(room, action, code, message, actual = "") {
    createRuntimeFault(room, {
      code,
      message,
      actionId: action?.id,
      expected: "A valid namespaced controller input limited to its scoped game context",
      actual
    });
    clear(room);
    queueMicrotask(() => broadcastLobby(room));
  }

  function completionTarget(config, action) {
    return String(action?.[config.completionTargetField || "answersSubmittedTargetActionId"] || "");
  }

  function complete(room, action, registration) {
    const target = completionTarget(registration.value, action);
    clear(room);
    if (!target) {
      fail(room, action, "GAME_PLUGIN_INPUT_TARGET_INVALID", `Game input "${registration.id}" has no completion target`);
      return false;
    }
    jumpToAction(room, target, action);
    broadcastLobby(room);
    return true;
  }

  function maybeComplete(room, action, registration) {
    const config = registration.value;
    if (config.completion === "manual") return false;
    const submitted = room.gamePluginInputSubmissions || new Map();
    if (config.completion === "anyRecipient") return submitted.size > 0 && complete(room, action, registration);
    const recipients = Array.from(room.gamePluginInputRecipientIds || []);
    const required = config.disconnect === "completeRemaining"
      ? recipients.filter((id) => room.players?.get(id)?.active !== false)
      : recipients;
    return (required.length === 0 || required.every((id) => submitted.has(id))) && complete(room, action, registration);
  }

  function ensure(room, action) {
    const registration = registrationById.get(action?.type);
    if (!registration) {
      if (room.gamePluginInputActionId) clear(room);
      return false;
    }
    if (
      room.gamePluginInputActionId === action.id
      && room.gamePluginInputType === action.type
      && room.gamePluginInputGameSessionId === Number(room.gameSessionId || 0)
    ) return true;
    clear(room);
    try {
      const selected = registration.value.recipients(scopedReadContext(room, registration), Object.freeze(cloneJson(action, {})));
      if (!Array.isArray(selected)) throw new Error("recipients must return an array of player IDs");
      const activeIds = new Set(activePlayers(room).map((player) => String(player.id || "")));
      const recipientIds = [...new Set(selected.map((id) => String(id || "")).filter((id) => activeIds.has(id)))];
      if (!recipientIds.length) throw new Error("recipients returned no active players");
      room.controllerInputVisitCounter = Math.max(0, Number(room.controllerInputVisitCounter || 0)) + 1;
      room.gamePluginInputActionId = String(action.id || "");
      room.gamePluginInputType = String(action.type || "");
      room.gamePluginInputVisitId = room.controllerInputVisitCounter;
      room.gamePluginInputGameSessionId = Number(room.gameSessionId || 0);
      room.gamePluginInputRecipientIds = new Set(recipientIds);
      room.gamePluginInputSubmissions = new Map();
      const timeout = registration.value.timeout;
      const seconds = timeout ? Math.max(0, Number(action?.[timeout.secondsField] || 0)) : 0;
      if (seconds > 0 && timeout.policy !== "wait") {
        const expectedVisitId = room.gamePluginInputVisitId;
        room.gamePluginInputTimeoutId = setTimeout(() => {
          if (room.gamePluginInputVisitId !== expectedVisitId || currentRoomAction(room)?.id !== action.id) return;
          if (timeout.policy === "complete") complete(room, action, registration);
          else fail(room, action, "GAME_PLUGIN_INPUT_TIMEOUT", `Game input "${registration.id}" timed out`);
        }, seconds * 1000);
      }
      // Plugin input state is initialized while the current lobby payload is
      // being serialized. That payload's revision was already incremented by
      // broadcastLobby, so controllers would otherwise receive their private
      // input on the next heartbeat with the same revision and correctly
      // discard it as stale. Emit one follow-up lobby revision after the input
      // visit is fully installed. The next ensure() observes this visit and
      // cannot queue another broadcast.
      const installedVisitId = room.gamePluginInputVisitId;
      queueMicrotask(() => {
        if (room.gamePluginInputActionId !== action.id || room.gamePluginInputVisitId !== installedVisitId) return;
        broadcastLobby(room);
      });
      return true;
    } catch (error) {
      fail(room, action, "GAME_PLUGIN_INPUT_RECIPIENTS_FAILED", `Game input "${registration.id}" could not select recipients`, String(error?.message || error));
      return false;
    }
  }

  function privateView(room, action, registration, playerId) {
    const player = room.players?.get(playerId);
    if (!player) return null;
    const base = scopedReadContext(room, registration);
    const context = Object.freeze({
      ...base,
      viewer: publicPlayerSnapshot(player, room),
      capability: Object.freeze({
        isRecipient: room.gamePluginInputRecipientIds?.has(playerId) === true,
        isVip: String(room.vipPlayerId || "") === playerId
      })
    });
    const model = registration.value.view(context, Object.freeze(cloneJson(action, {})));
    return cloneJson(model, null);
  }

  function payloadForViewer(room, action, viewerPlayerId) {
    const registration = registrationById.get(action?.type);
    const playerId = String(viewerPlayerId || "");
    if (!registration || !playerId || !ensure(room, action) || !room.gamePluginInputRecipientIds.has(playerId)) return null;
    try {
      const config = registration.value;
      const submitted = room.gamePluginInputSubmissions?.has(playerId) === true;
      return {
        actionId: String(action.id || ""),
        type: registration.id,
        visitId: Number(room.gamePluginInputVisitId || 0),
        gameSessionId: Number(room.gameSessionId || 0),
        submitted,
        layoutStateId: String(submitted && config.controller.submitted
          ? config.controller.submitted.layoutStateId
          : config.controller.layoutStateIdField
            ? action?.[config.controller.layoutStateIdField] || ""
            : config.controller.layoutStateId || ""),
        viewModel: privateView(room, action, registration, playerId)
      };
    } catch (error) {
      fail(room, action, "GAME_PLUGIN_INPUT_VIEW_FAILED", `Game input "${registration.id}" could not build its private view`, String(error?.message || error));
      return null;
    }
  }

  function submit(room, playerId, request) {
    const action = currentRoomAction(room);
    const registration = registrationById.get(action?.type);
    if (!registration || !ensure(room, action)) return { status: 409, error: "No game-owned input is active", errorCode: "GAME_PLUGIN_INPUT_INACTIVE" };
    if (
      String(request.actionId || "") !== String(action.id || "")
      || Number(request.visitId || 0) !== Number(room.gamePluginInputVisitId || 0)
      || Number(request.gameSessionId || 0) !== Number(room.gameSessionId || 0)
    ) return { status: 409, error: "This input visit is stale", errorCode: "GAME_PLUGIN_INPUT_STALE" };
    const actorId = String(playerId || "");
    if (!room.gamePluginInputRecipientIds.has(actorId)) {
      return { status: 403, error: "This player is not eligible for the active input", errorCode: "GAME_PLUGIN_INPUT_INELIGIBLE" };
    }
    if (room.gamePluginInputSubmissions.has(actorId)) {
      return { status: 200, duplicate: true };
    }
    let payload;
    try {
      const viewModel = privateView(room, action, registration, actorId);
      payload = validateInputPayload(registration.value, viewModel, request.payload);
    } catch (error) {
      return { status: 422, error: String(error?.message || error), errorCode: "GAME_PLUGIN_INPUT_INVALID" };
    }
    try {
      const actor = publicPlayerSnapshot(room.players.get(actorId), room);
      let completionRequested = false;
      const context = Object.freeze({
        namespace: registration.ownerNamespace,
        state: pluginStateFor(room, registration.ownerNamespace),
        actor,
        players: Object.freeze(activePlayers(room).map((player) => publicPlayerSnapshot(player, room))),
        capability: Object.freeze({ authenticated: true, isRecipient: true, isVip: actor?.isVip === true }),
        flow: Object.freeze(cloneJson(room.flowVariables, {})),
        local: Object.freeze(cloneJson(room.localVariables, {})),
        random: inputRandom(room, action, registration, actorId, String(request.submissionId || "")),
        outputs: createOutputWriter(room, action, registration.value),
        completion: Object.freeze({ request() { completionRequested = true; } }),
        broadcast: Object.freeze({ request() {} })
      });
      const result = registration.value.submit(context, payload, Object.freeze(cloneJson(action, {})));
      if (result && typeof result.then === "function") throw new Error("Game input submit functions must be synchronous");
      room.gamePluginInputSubmissions.set(actorId, {
        submissionId: String(request.submissionId || ""),
        submittedAt: Date.now()
      });
      if (completionRequested) complete(room, action, registration);
      else if (!maybeComplete(room, action, registration)) {
        // The submitted controller is an authoritative per-recipient state.
        // Always publish it immediately, even when game-owned submit logic did
        // not request a general state broadcast.
        broadcastLobby(room);
      }
      return { status: 200, duplicate: false };
    } catch (error) {
      fail(room, action, "GAME_PLUGIN_INPUT_SUBMIT_FAILED", `Game input "${registration.id}" submission failed`, String(error?.message || error));
      return { status: 500, error: String(error?.message || error), errorCode: "GAME_PLUGIN_INPUT_FAILED" };
    }
  }

  function playerDisconnected(room) {
    const action = currentRoomAction(room);
    const registration = registrationById.get(action?.type);
    if (!registration || !room.gamePluginInputActionId) return false;
    if (registration.value.disconnect === "fault") {
      fail(room, action, "GAME_PLUGIN_INPUT_PLAYER_DISCONNECTED", `A required player disconnected during "${registration.id}"`);
      return true;
    }
    return maybeComplete(room, action, registration);
  }

  return Object.freeze({
    clear,
    ensure,
    has: (type) => registrationById.has(type),
    manifests,
    payloadForViewer,
    playerDisconnected,
    submit
  });
}

function pluginFlowActionTypes(actionRegistrations = []) {
  return actionRegistrations.map(publicActionRegistration);
}

module.exports = {
  SAFE_COMPONENT_PROPERTIES,
  createGameActionExecutor,
  createGameInputRuntime,
  createGameRendererRuntime,
  createPluginInputActionDefinitions,
  createPluginFlowActionDefinitions,
  inputManifest,
  pluginFlowActionTypes
};
