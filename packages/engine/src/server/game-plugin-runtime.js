"use strict";

const PLUGIN_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;
const REGISTRATION_ID_PATTERN = /^[a-z][a-z0-9-]{1,47}\.[a-z][a-zA-Z0-9.-]{0,95}$/;
const ACTION_FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/;
const ACTION_OUTPUT_ID_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/;
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
const RENDERER_BINDING_KINDS = new Set(["component", "text"]);
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

function validateRendererRegistration(kind, id, value) {
  assertPlainObject(value, `${kind} registration "${id}"`);
  if (!String(value.name || "").trim()) throw new Error(`Renderer "${id}" requires a name`);
  assertPlainObject(value.target, `Renderer "${id}" target`);
  if (!String(value.target.layoutElementId || "").trim()) {
    throw new Error(`Renderer "${id}" target requires layoutElementId`);
  }
  const scope = String(value.target.layoutScope || "moment");
  if (!["global", "moment"].includes(scope)) throw new Error(`Renderer "${id}" has unsupported layoutScope "${scope}"`);
  if (typeof value.select !== "function") throw new Error(`Renderer "${id}" requires a select function`);
  if (!Array.isArray(value.bindings) || value.bindings.length === 0) {
    throw new Error(`Renderer "${id}" requires at least one binding`);
  }
  const bindingIds = new Set();
  for (const binding of value.bindings) {
    assertPlainObject(binding, `Renderer "${id}" binding`);
    const bindingId = String(binding.id || "").trim();
    if (!ACTION_OUTPUT_ID_PATTERN.test(bindingId) || bindingIds.has(bindingId)) {
      throw new Error(`Renderer "${id}" has an invalid or duplicate binding id: ${bindingId || "(missing)"}`);
    }
    bindingIds.add(bindingId);
    if (!RENDERER_BINDING_KINDS.has(binding.kind)) {
      throw new Error(`Renderer "${id}" binding "${bindingId}" has unsupported kind "${String(binding.kind || "")}"`);
    }
    if (!String(binding.source || "").trim() || !String(binding.targetComponentId || "").trim()) {
      throw new Error(`Renderer "${id}" binding "${bindingId}" requires source and targetComponentId`);
    }
    if (binding.kind === "component" && !RENDERER_COMPONENT_PROPERTIES.has(binding.property)) {
      throw new Error(`Renderer "${id}" binding "${bindingId}" has unsupported component property "${String(binding.property || "")}"`);
    }
    if ("fallback" in binding) assertJsonValue(binding.fallback, `Renderer "${id}" binding "${bindingId}" fallback`);
  }
}

function validateRegistration(kind, id, value) {
  if (kind === "actions") validateActionRegistration(id, value);
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
    bucket.set(normalizedId, Object.freeze({ id: normalizedId, ownerNamespace, value }));
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
  validateRendererRegistration
};
