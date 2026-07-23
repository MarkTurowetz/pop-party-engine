"use strict";

const fs = require("fs");
const path = require("path");

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const GAME_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
function gameIdFromName(value) {
  const normalized = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const gameId = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/g, "");
  if (!GAME_ID_PATTERN.test(gameId)) throw new Error("Game name must produce a 3-64 character id beginning with a letter");
  return gameId;
}

function assertExactEngineVersion(value) {
  const version = String(value || "").trim();
  if (!EXACT_VERSION_PATTERN.test(version)) throw new Error("Engine version must be an exact semantic version without a range");
  return version;
}

function assertEmptyTarget(targetRoot) {
  if (!fs.existsSync(targetRoot)) return;
  const stat = fs.lstatSync(targetRoot);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Game target is not an empty directory: ${targetRoot}`);
  if (fs.readdirSync(targetRoot).length) throw new Error(`Game target is not empty: ${targetRoot}`);
}

function copyTree(sourceRoot, targetRoot) {
  const sourceStat = fs.lstatSync(sourceRoot);
  if (sourceStat.isSymbolicLink()) throw new Error(`Starter content cannot contain symlinks: ${sourceRoot}`);
  if (!sourceStat.isDirectory()) throw new Error(`Starter content root is not a directory: ${sourceRoot}`);
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);
    const stat = fs.lstatSync(sourcePath);
    if (stat.isSymbolicLink()) throw new Error(`Starter content cannot contain symlinks: ${sourcePath}`);
    if (stat.isDirectory()) copyTree(sourcePath, targetPath);
    else if (stat.isFile()) fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    else throw new Error(`Unsupported starter content entry: ${sourcePath}`);
  }
}

function writeText(targetRoot, relativePath, text) {
  const absolutePath = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, text, { encoding: "utf8", flag: "wx" });
}

function generatedConfigSource({ displayName, engineVersion, gameId }) {
  return `"use strict";\n\nconst path = require("node:path");\nconst { createLocalContentBundleProvider } = require("@pop-party/engine");\nconst { defineGame } = require("@pop-party/engine/game");\nconst semanticRoles = require("./content/semantic-roles.json").roles;\nconst plugin = require("./src/plugin");\n\nfunction contentRoot() {\n  const configured = process.env.POP_PARTY_CONTENT_ROOT;\n  if (!configured) return path.join(__dirname, "content");\n  const root = path.resolve(__dirname, configured);\n  const relative = path.relative(__dirname, root);\n  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {\n    throw new Error("POP_PARTY_CONTENT_ROOT must remain inside the game workspace");\n  }\n  return root;\n}\n\nconst contentStore = createLocalContentBundleProvider({\n  root: contentRoot(),\n  gameBuild: "0.1.0",\n  engineVersion: ${JSON.stringify(engineVersion)},\n  pluginVersion: "0.1.0"\n});\n\nmodule.exports = defineGame({\n  gameId: ${JSON.stringify(gameId)},\n  displayName: ${JSON.stringify(displayName)},\n  version: "0.1.0",\n  engineCompatibility: ${JSON.stringify(engineVersion)},\n  content: {\n    mode: "bundle",\n    schemaVersion: 1,\n    store: contentStore\n  },\n  plugin,\n  semanticRoles\n});\n`;
}

function generatedContributionSource(kind) {
  return `"use strict";\n\n// Add ${kind} contributions as { id: "game-namespace.name", value: ... }.\nmodule.exports = Object.freeze([]);\n`;
}

function generatedBootstrapRendererSource({ gameId, role }) {
  const kind = role === "stage" ? "Stage" : "Controller";
  return `"use strict";\n\nmodule.exports = Object.freeze([{\n  id: ${JSON.stringify(`${gameId}.bootstrap-${role}`)},\n  value: Object.freeze({\n    renderBootstrap({ game }) {\n      if (game.id !== ${JSON.stringify(gameId)}) throw new Error("${kind} renderer received another game");\n      return Object.freeze({\n        heading: game.displayName,\n        message: ${JSON.stringify(`${kind} service is ready.`)}\n      });\n    }\n  })\n}]);\n`;
}

function generatedPluginSource(pluginNamespace) {
  return `"use strict";\n\nconst { defineGamePlugin } = require("@pop-party/engine/plugin");\nconst actions = require("../actions");\nconst stageRenderers = require("../stage");\nconst controllerRenderers = require("../controller");\nconst toolPanels = require("../tools");\n\nconst contributionGroups = Object.freeze([\n  ["actions", actions],\n  ["stageRenderers", stageRenderers],\n  ["controllerRenderers", controllerRenderers],\n  ["toolPanels", toolPanels]\n]);\n\nmodule.exports = defineGamePlugin({\n  namespace: ${JSON.stringify(pluginNamespace)},\n  register(registry) {\n    for (const [kind, contributions] of contributionGroups) {\n      for (const contribution of contributions) registry[kind](contribution.id, contribution.value);\n    }\n  }\n});\n`;
}

function generatedConfigTestSource({ engineVersion, gameId, pluginNamespace }) {
  return `"use strict";\n\nconst assert = require("node:assert/strict");\nconst test = require("node:test");\nconst { createGameApplicationRuntime } = require("@pop-party/engine/server/application");\nconst { createGameReadinessRuntime } = require("@pop-party/engine/server/readiness");\nconst game = require("../game.config");\n\ntest("game configuration owns an exact engine and plugin boundary", async () => {\n  assert.equal(game.gameId, ${JSON.stringify(gameId)});\n  assert.equal(game.engineCompatibility, ${JSON.stringify(engineVersion)});\n  assert.equal(game.plugin.namespace, ${JSON.stringify(pluginNamespace)});\n  assert.equal(game.gameData, null);\n  assert.equal(game.registrations.stageRenderers.length, 1);\n  assert.equal(game.registrations.stageRenderers[0].id, ${JSON.stringify(`${gameId}.bootstrap-stage`)});\n  assert.equal(game.registrations.controllerRenderers.length, 1);\n  assert.equal(game.registrations.controllerRenderers[0].id, ${JSON.stringify(`${gameId}.bootstrap-controller`)});\n  assert.deepEqual({\n    actions: game.registrations.actions,\n    stateSchemas: game.registrations.stateSchemas,\n    validators: game.registrations.validators,\n    migrations: game.registrations.migrations,\n    toolPanels: game.registrations.toolPanels,\n    diagnostics: game.registrations.diagnostics\n  }, {\n    actions: [],\n    stateSchemas: [],\n    validators: [],\n    migrations: [],\n    toolPanels: [],\n    diagnostics: []\n  });\n  const readiness = createGameReadinessRuntime({ gameDefinition: game, engineVersion: ${JSON.stringify(engineVersion)} });\n  const active = await readiness.check();\n  assert.equal(active.release.gameId, ${JSON.stringify(gameId)});\n  assert.equal(active.release.engineVersion, ${JSON.stringify(engineVersion)});\n  assert.ok(active.gameData.defaultGameFlow.states.length > 0);\n  assert.ok(active.gameData.defaultArtCompositions.length > 0);\n  assert.equal(readiness.state.status, "ready");\n});\n\ntest("generated game starts as an independent validated web service", async () => {\n  const runtime = createGameApplicationRuntime({\n    gameDefinition: game,\n    engineVersion: ${JSON.stringify(engineVersion)},\n    host: "127.0.0.1",\n    port: 0\n  });\n  try {\n    const startup = await runtime.start();\n    const health = await fetch(\`${"${startup.localUrl}"}/health\`);\n    const stage = await fetch(\`${"${startup.localUrl}"}/stage\`);\n    const controller = await fetch(\`${"${startup.localUrl}"}/controller\`);\n    const tools = await fetch(\`${"${startup.localUrl}"}/tools\`);\n    assert.equal(health.status, 200);\n    assert.equal((await health.json()).release.contentRevision, runtime.active.release.contentRevision);\n    assert.equal(stage.status, 200);\n    assert.match(await stage.text(), /data-pop-party-role="stage"/);\n    assert.equal(controller.status, 200);\n    assert.match(await controller.text(), /data-pop-party-role="controller"/);\n    assert.equal(tools.status, 503);\n    assert.equal((await tools.json()).diagnostic.code, "GAME_TOOLING_NOT_CONFIGURED");\n  } finally {\n    await runtime.stop();\n  }\n});\n`;
}

function rewriteBundleGameId(contentRoot, gameId) {
  const manifestPath = path.join(contentRoot, "content-bundle.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.gameId = gameId;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function generateGame(options = {}) {
  const displayName = String(options.displayName || options.name || "").trim();
  if (!displayName) throw new Error("Game display name is required");
  const gameId = options.gameId ? String(options.gameId).trim() : gameIdFromName(displayName);
  if (!GAME_ID_PATTERN.test(gameId)) throw new Error(`Game id must match ${GAME_ID_PATTERN}`);
  const engineVersion = assertExactEngineVersion(options.engineVersion);
  const targetRoot = path.resolve(options.targetRoot || gameId);
  const starterRoot = path.resolve(options.starterRoot || path.join(__dirname, "..", "starter", "content"));
  const pluginNamespace = gameId.slice(0, 48).replace(/-+$/g, "");
  assertEmptyTarget(targetRoot);
  const parentRoot = path.dirname(targetRoot);
  fs.mkdirSync(parentRoot, { recursive: true });
  const stagingRoot = fs.mkdtempSync(path.join(parentRoot, `.${path.basename(targetRoot)}.pop-party-`));
  try {
    copyTree(starterRoot, path.join(stagingRoot, "content"));
    rewriteBundleGameId(path.join(stagingRoot, "content"), gameId);

    const manifest = {
      name: gameId,
      version: "0.1.0",
      private: true,
      description: `${displayName} built with Pop Party Engine.`,
      engines: { node: ">=22" },
      scripts: {
        build: "pop-party build",
        dev: "pop-party dev",
        migrate: "pop-party migrate",
        start: "pop-party start",
        test: "node --test",
        validate: "pop-party validate content"
      },
      dependencies: { "@pop-party/engine": engineVersion }
    };
    writeText(stagingRoot, "package.json", `${JSON.stringify(manifest, null, 2)}\n`);
    writeText(stagingRoot, "game.config.js", generatedConfigSource({ displayName, engineVersion, gameId }));
    writeText(stagingRoot, "src/actions/index.js", generatedContributionSource("server and flow action"));
    writeText(stagingRoot, "src/stage/index.js", generatedBootstrapRendererSource({ gameId, role: "stage" }));
    writeText(stagingRoot, "src/controller/index.js", generatedBootstrapRendererSource({ gameId, role: "controller" }));
    writeText(stagingRoot, "src/tools/index.js", generatedContributionSource("authenticated tool panel"));
    writeText(stagingRoot, "src/plugin/index.js", generatedPluginSource(pluginNamespace));
    writeText(stagingRoot, "tests/config.test.js", generatedConfigTestSource({ engineVersion, gameId, pluginNamespace }));
    writeText(stagingRoot, ".gitignore", "node_modules/\n.env\n.pop-party/\ndist/\noutputs/\n");
    writeText(stagingRoot, "README.md", `# ${displayName}\n\nIndependent Pop Party game using \`@pop-party/engine@${engineVersion}\`.\n\nRun \`npm run dev\` locally or \`npm start\` in production. Development seeds ignored \`.pop-party/content\` once and then preserves that independent local copy; production uses the configured active store. The engine validates the selected release before binding the service port. Game-owned contributions live under \`src/actions\`, \`src/stage\`, \`src/controller\`, and \`src/tools\`; register them through the namespaced plugin in \`src/plugin\`. Content and starter blobs under \`content\` are independent copies owned by this game. Authenticated tools fail closed until the game explicitly configures them.\n`);
    writeText(stagingRoot, "LICENSE", fs.readFileSync(path.join(__dirname, "..", "LICENSE"), "utf8"));
    writeText(stagingRoot, "CONTENT-LICENSE", "Canonical starter art and content were copied into this game under CC0-1.0 (https://creativecommons.org/publicdomain/zero/1.0/). This copy is owned and editable by this game.\n");
    writeText(
      stagingRoot,
      "STARTER-ASSET-NOTICES.json",
      fs.readFileSync(path.join(__dirname, "..", "starter", "ASSET-NOTICES.json"), "utf8")
    );
    if (fs.existsSync(targetRoot)) fs.rmdirSync(targetRoot);
    fs.renameSync(stagingRoot, targetRoot);
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze({ displayName, engineVersion, gameId, pluginNamespace, targetRoot });
}

module.exports = Object.freeze({
  EXACT_VERSION_PATTERN,
  GAME_ID_PATTERN,
  assertExactEngineVersion,
  copyTree,
  gameIdFromName,
  generateGame
});
