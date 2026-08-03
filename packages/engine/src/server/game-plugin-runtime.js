"use strict";

const PLUGIN_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;
const REGISTRATION_ID_PATTERN = /^[a-z][a-z0-9-]{1,47}\.[a-z][a-zA-Z0-9.-]{0,95}$/;
const ACTION_FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/;
const ACTION_OUTPUT_ID_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/;
const LAYOUT_LAYER_ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const ACTION_FIELD_CONTROLS = new Set([
  "actionTarget",
  "boolean",
  "componentTarget",
  "gameObjectTarget",
  "integer",
  "number",
  "select",
  "stateTarget",
  "text",
  "textarea",
  "textTarget"
]);
const ACTION_CATEGORIES = new Set(["input", "logic", "standard"]);
const INPUT_FIELD_TYPES = new Set(["choice", "integer"]);
const INPUT_BINDING_KINDS = new Set(["choice", "choiceCollection", "integer", "submit", "text"]);
const INPUT_COMPLETION_POLICIES = new Set(["allRecipients", "anyRecipient", "manual"]);
const INPUT_DISCONNECT_POLICIES = new Set(["wait", "completeRemaining", "fault"]);
const INPUT_TIMEOUT_POLICIES = new Set(["wait", "complete", "fault"]);
const CONTROLLER_INTERACTION_VISIBILITIES = new Set(["private", "public"]);
const RENDERER_BINDING_KINDS = new Set(["collection", "component", "state", "text"]);
const RENDERER_COMPONENT_PROPERTIES = new Set([
  "defaultText",
  "fill",
  "imageTint",
  "isShown",
  "opacity",
  "rotation",
  "scale"
]);
const REGISTRATION_KINDS = Object.freeze([
  "actions",
  "inputs",
  "controllerInteractions",
  "stageRenderers",
  "controllerRenderers",
  "stateSchemas",
  "validators",
  "migrations",
  "toolPanels",
  "diagnostics"
]);

function assertPluginNamespace(namespace) {
  if (!PLUGIN_NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(`Game plugin namespace must match ${PLUGIN_NAMESPACE_PATTERN}`);
  }
  if (namespace === "engine") {
    throw new Error('The "engine" plugin namespace is reserved');
  }
}

function defineGamePlugin(definition = {}) {
  const namespace = String(definition.namespace || "").trim();
  assertPluginNamespace(namespace);
  if (typeof definition.register !== "function") {
    throw new Error(`Game plugin "${namespace}" must provide a register function`);
  }
  return Object.freeze({ namespace, register: definition.register });
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertJsonValue(value, label) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error(`${label} must be JSON-safe`);
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${label}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) assertJsonValue(item, `${label}.${key}`);
}

function validateActionField(field, actionId, seenKeys) {
  assertPlainObject(field, `Action "${actionId}" field`);
  const key = String(field.key || "").trim();
  if (!ACTION_FIELD_KEY_PATTERN.test(key) || seenKeys.has(key)) {
    throw new Error(`Action "${actionId}" has an invalid or duplicate field key: ${key || "(missing)"}`);
  }
  seenKeys.add(key);
  if (!String(field.label || "").trim()) throw new Error(`Action "${actionId}" field "${key}" requires a label`);
  if (!ACTION_FIELD_CONTROLS.has(field.control)) {
    throw new Error(`Action "${actionId}" field "${key}" has unsupported control "${String(field.control || "")}"`);
  }
  if (field.control === "select") {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      throw new Error(`Action "${actionId}" select field "${key}" requires options`);
    }
    const optionIds = new Set();
    for (const option of field.options) {
      assertPlainObject(option, `Action "${actionId}" select option`);
      const optionId = String(option.id ?? "");
      if (optionIds.has(optionId) || !String(option.name || "").trim()) {
        throw new Error(`Action "${actionId}" field "${key}" has an invalid or duplicate select option`);
      }
      optionIds.add(optionId);
    }
  }
  if ("default" in field) assertJsonValue(field.default, `Action "${actionId}" field "${key}" default`);
}

function validateActionRegistration(id, value) {
  assertPlainObject(value, `Action registration "${id}"`);
  if (!String(value.name || "").trim()) throw new Error(`Action "${id}" requires a name`);
  if (value.category !== undefined && !ACTION_CATEGORIES.has(value.category)) {
    throw new Error(`Action "${id}" has unsupported category "${String(value.category)}"`);
  }
  if (typeof value.execute !== "function") throw new Error(`Action "${id}" requires an execute function`);
  const fields = value.fields === undefined ? [] : value.fields;
  if (!Array.isArray(fields)) throw new Error(`Action "${id}" fields must be an array`);
  const fieldKeys = new Set();
  fields.forEach((field) => validateActionField(field, id, fieldKeys));
  const outputs = value.outputs === undefined ? [] : value.outputs;
  if (!Array.isArray(outputs)) throw new Error(`Action "${id}" outputs must be an array`);
  const outputIds = new Set();
  for (const output of outputs) {
    assertPlainObject(output, `Action "${id}" output`);
    const outputId = String(output.id || "").trim();
    if (!ACTION_OUTPUT_ID_PATTERN.test(outputId) || outputIds.has(outputId)) {
      throw new Error(`Action "${id}" has an invalid or duplicate output id: ${outputId || "(missing)"}`);
    }
    outputIds.add(outputId);
    if (!String(output.name || "").trim()) throw new Error(`Action "${id}" output "${outputId}" requires a name`);
    if (!fieldKeys.has(String(output.variableField || ""))) {
      throw new Error(`Action "${id}" output "${outputId}" must reference a declared variableField`);
    }
  }
  if (value.actorPlayerIdField !== undefined && !fieldKeys.has(String(value.actorPlayerIdField))) {
    throw new Error(`Action "${id}" actorPlayerIdField must reference a declared field`);
  }
}

function validateInputRegistration(id, value) {
  assertPlainObject(value, `Input registration "${id}"`);
  if (!String(value.name || "").trim()) throw new Error(`Input "${id}" requires a name`);
  if (typeof value.recipients !== "function") throw new Error(`Input "${id}" requires a recipients function`);
  if (typeof value.view !== "function") throw new Error(`Input "${id}" requires a view function`);
  if (typeof value.submit !== "function") throw new Error(`Input "${id}" requires a submit function`);
  const fields = value.fields === undefined ? [] : value.fields;
  if (!Array.isArray(fields)) throw new Error(`Input "${id}" fields must be an array`);
  const fieldKeys = new Set();
  fields.forEach((field) => validateActionField(field, id, fieldKeys));
  const completionTargetField = String(value.completionTargetField || "answersSubmittedTargetActionId");
  const completionTargetDefinition = fields.find((field) => field.key === completionTargetField);
  if (!completionTargetDefinition || completionTargetDefinition.control !== "actionTarget") {
    throw new Error(`Input "${id}" completion target "${completionTargetField}" must be a declared actionTarget field`);
  }
  const outputs = value.outputs === undefined ? [] : value.outputs;
  if (!Array.isArray(outputs)) throw new Error(`Input "${id}" outputs must be an array`);
  const outputIds = new Set();
  for (const output of outputs) {
    assertPlainObject(output, `Input "${id}" output`);
    const outputId = String(output.id || "").trim();
    if (!ACTION_OUTPUT_ID_PATTERN.test(outputId) || outputIds.has(outputId)) {
      throw new Error(`Input "${id}" has an invalid or duplicate output id: ${outputId || "(missing)"}`);
    }
    outputIds.add(outputId);
    if (!String(output.name || "").trim()) throw new Error(`Input "${id}" output "${outputId}" requires a name`);
    if (!fieldKeys.has(String(output.variableField || ""))) {
      throw new Error(`Input "${id}" output "${outputId}" must reference a declared variableField`);
    }
  }
  if (!Array.isArray(value.submission) || value.submission.length === 0) {
    throw new Error(`Input "${id}" requires at least one submission field`);
  }
  const submissionIds = new Set();
  for (const field of value.submission) {
    assertPlainObject(field, `Input "${id}" submission field`);
    const fieldId = String(field.id || "").trim();
    if (!ACTION_FIELD_KEY_PATTERN.test(fieldId) || submissionIds.has(fieldId)) {
      throw new Error(`Input "${id}" has an invalid or duplicate submission field: ${fieldId || "(missing)"}`);
    }
    submissionIds.add(fieldId);
    if (!INPUT_FIELD_TYPES.has(field.type)) {
      throw new Error(`Input "${id}" submission field "${fieldId}" has unsupported type "${String(field.type || "")}"`);
    }
    if (field.type === "choice" && !String(field.optionsSource || "").trim()) {
      throw new Error(`Input "${id}" choice field "${fieldId}" requires optionsSource`);
    }
    if (field.type === "choice" && field.options !== undefined) {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new Error(`Input "${id}" choice field "${fieldId}" options must be a non-empty array`);
      }
      const optionIds = new Set();
      for (const option of field.options) {
        const optionId = String(option && typeof option === "object" ? option.id : option ?? "").trim();
        if (!optionId || optionIds.has(optionId)) {
          throw new Error(`Input "${id}" choice field "${fieldId}" has an empty or duplicate static option`);
        }
        optionIds.add(optionId);
      }
    }
    if (field.type === "integer") {
      if (!Number.isInteger(Number(field.min)) || !Number.isInteger(Number(field.max)) || Number(field.min) > Number(field.max)) {
        throw new Error(`Input "${id}" integer field "${fieldId}" requires valid min and max bounds`);
      }
    }
  }
  assertPlainObject(value.controller, `Input "${id}" controller`);
  if (!String(value.controller.layoutStateIdField || "").trim() && !String(value.controller.layoutStateId || "").trim()) {
    throw new Error(`Input "${id}" controller requires layoutStateId or layoutStateIdField`);
  }
  if (value.controller.layoutStateIdField && !fieldKeys.has(String(value.controller.layoutStateIdField))) {
    throw new Error(`Input "${id}" controller layoutStateIdField must reference a declared field`);
  }
  if (!Array.isArray(value.controller.bindings) || value.controller.bindings.length === 0) {
    throw new Error(`Input "${id}" controller requires bindings`);
  }
  const submissionById = new Map(value.submission.map((field) => [String(field.id), field]));
  function validateSubmitValues(submitValues, label) {
    assertPlainObject(submitValues, `Input "${id}" ${label}`);
    for (const [fieldId, submittedValue] of Object.entries(submitValues)) {
      const field = submissionById.get(fieldId);
      if (!field) throw new Error(`Input "${id}" ${label} references undeclared submission field "${fieldId}"`);
      if (field.type === "choice" && !["string", "number"].includes(typeof submittedValue)) {
        throw new Error(`Input "${id}" ${label} choice field "${fieldId}" requires a string or number value`);
      }
      if (field.type === "integer") {
        const number = Number(submittedValue);
        if (!Number.isInteger(number) || number < Number(field.min) || number > Number(field.max)) {
          throw new Error(`Input "${id}" ${label} integer field "${fieldId}" is outside its declared bounds`);
        }
      }
    }
  }
  function validateControllerBindings(bindings, label, { requireSubmissionTrigger = false } = {}) {
    if (!Array.isArray(bindings)) throw new Error(`Input "${id}" ${label} requires bindings`);
    const bindingIds = new Set();
    let hasSubmissionTrigger = false;
    for (const binding of bindings) {
      assertPlainObject(binding, `Input "${id}" controller binding`);
      const bindingId = String(binding.id || "").trim();
      if (!ACTION_OUTPUT_ID_PATTERN.test(bindingId) || bindingIds.has(bindingId)) {
        throw new Error(`Input "${id}" has an invalid or duplicate controller binding id: ${bindingId || "(missing)"}`);
      }
      bindingIds.add(bindingId);
      if (!INPUT_BINDING_KINDS.has(binding.kind)) {
        throw new Error(`Input "${id}" binding "${bindingId}" has unsupported kind "${String(binding.kind || "")}"`);
      }
      if (!String(binding.layoutElementId || "").trim()) {
        throw new Error(`Input "${id}" binding "${bindingId}" requires layoutElementId`);
      }
      if (binding.kind === "text" && (!String(binding.source || "").trim() || !String(binding.targetComponentId || "").trim())) {
        throw new Error(`Input "${id}" text binding "${bindingId}" requires source and targetComponentId`);
      }
      if (binding.kind === "choice" || binding.kind === "choiceCollection") {
        const submissionField = submissionById.get(String(binding.field || ""));
        if (submissionField?.type !== "choice") {
          throw new Error(`Input "${id}" ${binding.kind} binding "${bindingId}" must reference a choice submission field`);
        }
        if (binding.kind === "choice" && (!Number.isInteger(Number(binding.optionIndex)) || Number(binding.optionIndex) < 0)) {
          throw new Error(`Input "${id}" choice binding "${bindingId}" requires a non-negative optionIndex`);
        }
        if (binding.kind === "choiceCollection") {
          assertPlainObject(binding.item, `Input "${id}" choiceCollection binding "${bindingId}" item`);
          if (!String(binding.item.artCompositionId || "").trim()) {
            throw new Error(`Input "${id}" choiceCollection binding "${bindingId}" item requires artCompositionId`);
          }
          if (!String(binding.item.targetComponentId || "").trim()) {
            throw new Error(`Input "${id}" choiceCollection binding "${bindingId}" item requires targetComponentId`);
          }
          for (const sourceName of ["labelSource", "disabledSource"]) {
            if (binding.item[sourceName] !== undefined && !String(binding.item[sourceName] || "").trim()) {
              throw new Error(`Input "${id}" choiceCollection binding "${bindingId}" item ${sourceName} must be a non-empty property path`);
            }
          }
        }
        if (binding.submitValues !== undefined) validateSubmitValues(binding.submitValues, `binding "${bindingId}" submitValues`);
        if (binding.holdSubmit !== undefined) {
          assertPlainObject(binding.holdSubmit, `Input "${id}" binding "${bindingId}" holdSubmit`);
          if (!Number.isFinite(Number(binding.holdSubmit.seconds)) || Number(binding.holdSubmit.seconds) <= 0) {
            throw new Error(`Input "${id}" binding "${bindingId}" holdSubmit requires positive seconds`);
          }
          validateSubmitValues(binding.holdSubmit.submitValues, `binding "${bindingId}" holdSubmit submitValues`);
        }
        if (binding.autoSubmit === true || binding.holdSubmit !== undefined) hasSubmissionTrigger = true;
      }
      if (binding.kind === "integer") {
        const submissionField = submissionById.get(String(binding.field || ""));
        if (submissionField?.type !== "integer") {
          throw new Error(`Input "${id}" integer binding "${bindingId}" must reference an integer submission field`);
        }
      }
      if (binding.kind === "submit") hasSubmissionTrigger = true;
    }
    if (requireSubmissionTrigger && !hasSubmissionTrigger) {
      throw new Error(`Input "${id}" controller requires a submit binding or an auto-submit choice binding`);
    }
  }
  validateControllerBindings(value.controller.bindings, "controller", { requireSubmissionTrigger: true });
  if (value.controller.submitted !== undefined) {
    assertPlainObject(value.controller.submitted, `Input "${id}" submitted controller`);
    if (!String(value.controller.submitted.layoutStateId || "").trim()) {
      throw new Error(`Input "${id}" submitted controller requires layoutStateId`);
    }
    validateControllerBindings(value.controller.submitted.bindings, "submitted controller");
  }
  const completion = String(value.completion || "allRecipients");
  if (!INPUT_COMPLETION_POLICIES.has(completion)) {
    throw new Error(`Input "${id}" has unsupported completion policy "${completion}"`);
  }
  const disconnect = String(value.disconnect || "wait");
  if (!INPUT_DISCONNECT_POLICIES.has(disconnect)) {
    throw new Error(`Input "${id}" has unsupported disconnect policy "${disconnect}"`);
  }
  if (value.timeout !== undefined) {
    assertPlainObject(value.timeout, `Input "${id}" timeout`);
    if (!String(value.timeout.secondsField || "").trim() || !fieldKeys.has(String(value.timeout.secondsField))) {
      throw new Error(`Input "${id}" timeout secondsField must reference a declared field`);
    }
    const timeoutPolicy = String(value.timeout.policy || "wait");
    if (!INPUT_TIMEOUT_POLICIES.has(timeoutPolicy)) {
      throw new Error(`Input "${id}" has unsupported timeout policy "${timeoutPolicy}"`);
    }
  }
}

function validateControllerInteractionRegistration(id, value) {
  assertPlainObject(value, `Controller interaction registration "${id}"`);
  if (!String(value.name || "").trim()) throw new Error(`Controller interaction "${id}" requires a name`);
  const profileField = String(value.profileField || "").trim();
  if (!ACTION_FIELD_KEY_PATTERN.test(profileField)) {
    throw new Error(`Controller interaction "${id}" requires a normalized profileField`);
  }
  const visibility = String(value.visibility || "private");
  if (!CONTROLLER_INTERACTION_VISIBILITIES.has(visibility)) {
    throw new Error(`Controller interaction "${id}" has unsupported visibility "${visibility}"`);
  }
  if (typeof value.available !== "function") throw new Error(`Controller interaction "${id}" requires an available function`);
  if (typeof value.view !== "function") throw new Error(`Controller interaction "${id}" requires a view function`);
  if (typeof value.submit !== "function") throw new Error(`Controller interaction "${id}" requires a submit function`);
  assertPlainObject(value.controller, `Controller interaction "${id}" controller`);
  const layoutScope = String(value.controller.layoutScope || "");
  if (!new Set(["global", "layer"]).has(layoutScope)) {
    throw new Error(`Controller interaction "${id}" controller layoutScope must be global or layer`);
  }
  if (layoutScope === "layer" && !LAYOUT_LAYER_ID_PATTERN.test(String(value.controller.layoutLayerId || "").trim())) {
    throw new Error(`Controller interaction "${id}" targeting a persistent layer requires a normalized layoutLayerId`);
  }
  validateInputRegistration(id, {
    ...value,
    fields: [{ key: "answersSubmittedTargetActionId", label: "Internal completion target", control: "actionTarget" }],
    completionTargetField: "answersSubmittedTargetActionId",
    controller: {
      layoutStateId: "engine-controller-interaction",
      bindings: value.controller.bindings
    },
    recipients() { return []; }
  });
}

function validateRendererBinding(rendererId, binding, bindingIds, context = {}) {
  assertPlainObject(binding, `Renderer "${rendererId}" binding`);
  const bindingId = String(binding.id || "").trim();
  if (!ACTION_OUTPUT_ID_PATTERN.test(bindingId) || bindingIds.has(bindingId)) {
    throw new Error(`Renderer "${rendererId}" has an invalid or duplicate binding id: ${bindingId || "(missing)"}`);
  }
  bindingIds.add(bindingId);
  if (!RENDERER_BINDING_KINDS.has(binding.kind)) {
    throw new Error(`Renderer "${rendererId}" binding "${bindingId}" has unsupported kind "${String(binding.kind || "")}"`);
  }
  if (!String(binding.source || "").trim()) {
    throw new Error(`Renderer "${rendererId}" binding "${bindingId}" requires source`);
  }
  if (binding.kind === "collection") {
    if ((context.nested === true || context.requireTarget === true) && !String(binding.targetComponentId || "").trim()) {
      throw new Error(`Renderer "${rendererId}" nested collection binding "${bindingId}" requires targetComponentId`);
    }
    assertPlainObject(binding.item, `Renderer "${rendererId}" collection binding "${bindingId}" item`);
    if (!String(binding.item.keySource || "").trim() || !String(binding.item.artCompositionId || "").trim()) {
      throw new Error(`Renderer "${rendererId}" collection binding "${bindingId}" item requires keySource and artCompositionId`);
    }
    if (!Array.isArray(binding.item.bindings)) {
      throw new Error(`Renderer "${rendererId}" collection binding "${bindingId}" item requires bindings`);
    }
    const childIds = new Set();
    for (const child of binding.item.bindings) {
      validateRendererBinding(rendererId, child, childIds, { nested: true });
    }
    return;
  }
  if ((binding.kind === "text" || binding.kind === "component") && !String(binding.targetComponentId || "").trim()) {
    throw new Error(`Renderer "${rendererId}" binding "${bindingId}" requires targetComponentId`);
  }
  if (binding.kind === "component" && !RENDERER_COMPONENT_PROPERTIES.has(binding.property)) {
    throw new Error(`Renderer "${rendererId}" binding "${bindingId}" has unsupported component property "${String(binding.property || "")}"`);
  }
  if (binding.kind === "state") {
    if (context.requireTarget === true && !String(binding.targetComponentId || "").trim()) {
      throw new Error(`Renderer "${rendererId}" state binding "${bindingId}" requires targetComponentId`);
    }
    const playback = String(binding.playback || "play");
    if (!new Set(["play", "stop"]).has(playback)) {
      throw new Error(`Renderer "${rendererId}" state binding "${bindingId}" has unsupported playback "${playback}"`);
    }
  }
  if ("fallback" in binding) assertJsonValue(binding.fallback, `Renderer "${rendererId}" binding "${bindingId}" fallback`);
}

function validateRendererRegistration(kind, id, value) {
  assertPlainObject(value, `${kind} registration "${id}"`);
  if (!String(value.name || "").trim()) throw new Error(`Renderer "${id}" requires a name`);
  assertPlainObject(value.target, `Renderer "${id}" target`);
  const targetKind = String(value.target.kind || "layout");
  if (targetKind === "layout") {
    if (!String(value.target.layoutElementId || "").trim()) {
      throw new Error(`Renderer "${id}" target requires layoutElementId`);
    }
    const scope = String(value.target.layoutScope || "moment");
    if (!["global", "layer", "moment"].includes(scope)) throw new Error(`Renderer "${id}" has unsupported layoutScope "${scope}"`);
    if (scope === "layer" && !LAYOUT_LAYER_ID_PATTERN.test(String(value.target.layoutLayerId || "").trim())) {
      throw new Error(`Renderer "${id}" targeting a persistent layer requires a normalized layoutLayerId`);
    }
  } else {
    throw new Error(`Renderer "${id}" has unsupported target kind "${targetKind}"`);
  }
  if (typeof value.select !== "function") throw new Error(`Renderer "${id}" requires a select function`);
  if (!Array.isArray(value.bindings) || value.bindings.length === 0) {
    throw new Error(`Renderer "${id}" requires at least one binding`);
  }
  const bindingIds = new Set();
  for (const binding of value.bindings) {
    validateRendererBinding(id, binding, bindingIds, { nested: false, requireTarget: false });
  }
}

function validateRegistration(kind, id, value) {
  if (kind === "actions") validateActionRegistration(id, value);
  if (kind === "inputs") validateInputRegistration(id, value);
  if (kind === "controllerInteractions") validateControllerInteractionRegistration(id, value);
  if (kind === "stageRenderers" || kind === "controllerRenderers") {
    validateRendererRegistration(kind, id, value);
  }
}

function createGamePluginRegistry() {
  const registrations = new Map(REGISTRATION_KINDS.map((kind) => [kind, new Map()]));

  function register(kind, id, value, ownerNamespace) {
    const bucket = registrations.get(kind);
    if (!bucket) throw new Error(`Unknown game plugin registration kind: ${kind}`);
    const normalizedId = String(id || "").trim();
    if (!REGISTRATION_ID_PATTERN.test(normalizedId)) {
      throw new Error(`Plugin registration id must match ${REGISTRATION_ID_PATTERN}: ${normalizedId || "(missing)"}`);
    }
    if (!normalizedId.startsWith(`${ownerNamespace}.`)) {
      throw new Error(`Plugin "${ownerNamespace}" may only register ids beginning with "${ownerNamespace}."`);
    }
    if (normalizedId.startsWith("engine.")) {
      throw new Error(`Plugin registration id "${normalizedId}" is reserved for the engine`);
    }
    if (bucket.has(normalizedId)) {
      throw new Error(`Duplicate ${kind} registration: ${normalizedId}`);
    }
    validateRegistration(kind, normalizedId, value);
    if (kind === "controllerInteractions") {
      const duplicateField = Array.from(bucket.values()).find((registration) => (
        registration.ownerNamespace === ownerNamespace
        && String(registration.value.profileField || "") === String(value.profileField || "")
      ));
      if (duplicateField) {
        throw new Error(`Plugin "${ownerNamespace}" already owns controller profile field "${String(value.profileField || "")}"`);
      }
    }
    bucket.set(normalizedId, Object.freeze({ id: normalizedId, kind, ownerNamespace, value }));
  }

  function install(plugin) {
    if (!plugin || typeof plugin.register !== "function") {
      throw new Error("A defined game plugin is required");
    }
    const api = Object.freeze(Object.fromEntries(REGISTRATION_KINDS.map((kind) => [
      kind,
      (id, value) => register(kind, id, value, plugin.namespace)
    ])));
    plugin.register(api);
    return registrySnapshot();
  }

  function registrySnapshot() {
    return Object.freeze(Object.fromEntries(REGISTRATION_KINDS.map((kind) => [
      kind,
      Object.freeze(Array.from(registrations.get(kind).values()))
    ])));
  }

  return Object.freeze({ install, snapshot: registrySnapshot });
}

module.exports = {
  ACTION_FIELD_CONTROLS,
  REGISTRATION_KINDS,
  createGamePluginRegistry,
  defineGamePlugin,
  validateActionRegistration,
  validateControllerInteractionRegistration,
  validateInputRegistration,
  validateRendererRegistration
};
