"use strict";

const PLUGIN_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;
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

function createGamePluginRegistry() {
  const registrations = new Map(REGISTRATION_KINDS.map((kind) => [kind, new Map()]));

  function register(kind, id, value, ownerNamespace) {
    const bucket = registrations.get(kind);
    if (!bucket) throw new Error(`Unknown game plugin registration kind: ${kind}`);
    const normalizedId = String(id || "").trim();
    if (!normalizedId.startsWith(`${ownerNamespace}.`)) {
      throw new Error(`Plugin "${ownerNamespace}" may only register ids beginning with "${ownerNamespace}."`);
    }
    if (normalizedId.startsWith("engine.")) {
      throw new Error(`Plugin registration id "${normalizedId}" is reserved for the engine`);
    }
    if (bucket.has(normalizedId)) {
      throw new Error(`Duplicate ${kind} registration: ${normalizedId}`);
    }
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
  REGISTRATION_KINDS,
  createGamePluginRegistry,
  defineGamePlugin
};
