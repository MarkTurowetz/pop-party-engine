"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createGameReadinessRuntime } = require("../server/game-readiness-runtime");

function loadGameDefinition(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const configPath = path.resolve(cwd, options.configPath || "game.config.js");
  if (configPath !== cwd && !configPath.startsWith(`${cwd}${path.sep}`)) {
    throw new Error("Game config must remain inside the game workspace");
  }
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    throw new Error(`Game config not found: ${path.relative(cwd, configPath) || "game.config.js"}`);
  }
  const environment = options.environment && typeof options.environment === "object" ? options.environment : {};
  const entries = Object.entries(environment);
  for (const [key, value] of entries) {
    if (key !== "POP_PARTY_CONTENT_ROOT") throw new Error(`Unsupported game config environment override: ${key}`);
    if (typeof value !== "string" || !value) throw new Error(`Game config environment override ${key} must be a non-empty string`);
  }
  const previous = new Map(entries.map(([key]) => [key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined]));
  try {
    for (const [key, value] of entries) process.env[key] = value;
    delete require.cache[require.resolve(configPath)];
    return Object.freeze({ configPath, cwd, gameDefinition: require(configPath) });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function createGameBuild(options = {}) {
  const engineVersion = String(options.engineVersion || "").trim();
  if (!engineVersion) throw new Error("Game build requires the running engine version");
  const loaded = loadGameDefinition(options);
  const readiness = createGameReadinessRuntime({
    gameDefinition: loaded.gameDefinition,
    engineVersion,
    contentSchemaVersion: options.contentSchemaVersion || engineVersion
  });
  const active = await readiness.check();
  const outputRoot = path.resolve(loaded.cwd, options.outputDirectory || "dist");
  if (outputRoot !== loaded.cwd && !outputRoot.startsWith(`${loaded.cwd}${path.sep}`)) {
    throw new Error("Game build output must remain inside the game workspace");
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  const manifest = Object.freeze({
    schemaVersion: 1,
    gameId: loaded.gameDefinition.gameId,
    displayName: loaded.gameDefinition.displayName,
    gameVersion: loaded.gameDefinition.version,
    engineVersion,
    pluginNamespace: loaded.gameDefinition.plugin.namespace,
    pluginVersion: active.release.pluginVersion,
    contentRevision: active.release.contentRevision,
    releaseRevision: active.release.releaseRevision,
    semanticRoles: active.semanticRoles
  });
  const manifestPath = path.join(outputRoot, "pop-party-build.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return Object.freeze({ ...loaded, manifest, manifestPath, readiness });
}

module.exports = Object.freeze({ createGameBuild, loadGameDefinition });
