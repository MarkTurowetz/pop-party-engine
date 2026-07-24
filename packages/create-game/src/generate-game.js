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

function generatedRenderBlueprintSource(gameId) {
  return `services:\n  - type: web\n    name: ${gameId}\n    runtime: node\n    plan: starter\n    numInstances: 1\n    buildCommand: npm install --no-audit --no-fund && npm run build\n    startCommand: npm start\n    healthCheckPath: /health\n    maxShutdownDelaySeconds: 300\n    envVars:\n      - key: NODE_ENV\n        value: production\n`;
}

function generatedPluginSource(pluginNamespace) {
  return `"use strict";\n\nconst { defineGamePlugin } = require("@pop-party/engine/plugin");\nconst actions = require("../actions");\nconst stageRenderers = require("../stage");\nconst controllerRenderers = require("../controller");\nconst toolPanels = require("../tools");\n\nconst contributionGroups = Object.freeze([\n  ["actions", actions],\n  ["stageRenderers", stageRenderers],\n  ["controllerRenderers", controllerRenderers],\n  ["toolPanels", toolPanels]\n]);\n\nmodule.exports = defineGamePlugin({\n  namespace: ${JSON.stringify(pluginNamespace)},\n  register(registry) {\n    for (const [kind, contributions] of contributionGroups) {\n      for (const contribution of contributions) registry[kind](contribution.id, contribution.value);\n    }\n  }\n});\n`;
}

function generatedConfigTestSource({ engineVersion, gameId, pluginNamespace }) {
  return `"use strict";\n\nconst assert = require("node:assert/strict");\nconst test = require("node:test");\nconst { createGameApplicationRuntime } = require("@pop-party/engine/server/application");\nconst { createGameReadinessRuntime } = require("@pop-party/engine/server/readiness");\nconst game = require("../game.config");\n\ntest("game configuration owns an exact engine and plugin boundary", async () => {\n  assert.equal(game.gameId, ${JSON.stringify(gameId)});\n  assert.equal(game.engineCompatibility, ${JSON.stringify(engineVersion)});\n  assert.equal(game.plugin.namespace, ${JSON.stringify(pluginNamespace)});\n  assert.equal(game.gameData, null);\n  assert.deepEqual({\n    actions: game.registrations.actions,\n    stageRenderers: game.registrations.stageRenderers,\n    controllerRenderers: game.registrations.controllerRenderers,\n    stateSchemas: game.registrations.stateSchemas,\n    validators: game.registrations.validators,\n    migrations: game.registrations.migrations,\n    toolPanels: game.registrations.toolPanels,\n    diagnostics: game.registrations.diagnostics\n  }, {\n    actions: [],\n    stageRenderers: [],\n    controllerRenderers: [],\n    stateSchemas: [],\n    validators: [],\n    migrations: [],\n    toolPanels: [],\n    diagnostics: []\n  });\n  const readiness = createGameReadinessRuntime({ gameDefinition: game, engineVersion: ${JSON.stringify(engineVersion)} });\n  const active = await readiness.check();\n  assert.equal(active.release.gameId, ${JSON.stringify(gameId)});\n  assert.equal(active.release.engineVersion, ${JSON.stringify(engineVersion)});\n  assert.ok(active.gameData.defaultGameFlow.states.length > 0);\n  assert.ok(active.gameData.defaultArtCompositions.length > 0);\n  assert.equal(readiness.state.status, "ready");\n});\n\ntest("generated game starts with the complete engine-owned application", async () => {\n  const runtime = createGameApplicationRuntime({\n    gameDefinition: game,\n    engineVersion: ${JSON.stringify(engineVersion)},\n    workspaceRoot: process.cwd(),\n    host: "127.0.0.1",\n    port: 0\n  });\n  try {\n    const startup = await runtime.start();\n    const health = await fetch(\`${"${startup.localUrl}"}/health\`);\n    const stage = await fetch(\`${"${startup.localUrl}"}/stage\`);\n    const controller = await fetch(\`${"${startup.localUrl}"}/controller\`);\n    const tools = await fetch(\`${"${startup.localUrl}"}/tools\`);\n    const flow = await fetch(\`${"${startup.localUrl}"}/api/game-flow\`);\n    assert.equal(health.status, 200);\n    assert.equal((await health.json()).game.id, ${JSON.stringify(gameId)});\n    assert.equal(stage.status, 200);\n    assert.match(await stage.text(), /id="stageScreen"/);\n    assert.equal(controller.status, 200);\n    assert.match(await controller.text(), /id="controllerScreen"/);\n    assert.equal(tools.status, 200);\n    assert.match(await tools.text(), /id="toolDashboardBar"/);\n    assert.equal(flow.status, 200);\n    assert.ok((await flow.json()).flow.states.length > 0);\n  } finally {\n    await runtime.stop();\n  }\n});\n`;
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
    writeText(stagingRoot, "src/stage/index.js", generatedContributionSource("stage renderer"));
    writeText(stagingRoot, "src/controller/index.js", generatedContributionSource("controller renderer"));
    writeText(stagingRoot, "src/tools/index.js", generatedContributionSource("authenticated tool panel"));
    writeText(stagingRoot, "src/plugin/index.js", generatedPluginSource(pluginNamespace));
    writeText(stagingRoot, "tests/config.test.js", generatedConfigTestSource({ engineVersion, gameId, pluginNamespace }));
    writeText(stagingRoot, ".gitignore", "node_modules/\n.env\n.pop-party/\ndist/\noutputs/\n");
    writeText(stagingRoot, "README.md", `# ${displayName}\n\nIndependent Pop Party game using \`@pop-party/engine@${engineVersion}\`.\n\nRun \`npm run dev\` locally or \`npm start\` in production. Development seeds ignored \`.pop-party/content\` once and then preserves that independent local copy; production uses the configured active store. The engine validates the selected release before binding the service port and supplies the complete stage, controller, room lifecycle, and authenticated core tools. Game-owned contributions live under \`src/actions\`, \`src/stage\`, \`src/controller\`, and \`src/tools\`; register them through the namespaced plugin in \`src/plugin\`. Content and starter blobs under \`content\` are independent copies owned by this game.\n`);
    writeText(stagingRoot, "render.yaml", generatedRenderBlueprintSource(gameId));
    writeText(stagingRoot, "DEPLOYMENT.md", `# ${displayName} deployment\n\nThis game deploys as one independent Render web service defined by \`render.yaml\`. Keep \`numInstances: 1\` and autoscaling disabled while rooms are in-memory. Render builds with \`npm install --no-audit --no-fund && npm run build\`, starts with \`npm start\`, and checks \`/health\`.\n\nProduction must use reviewed provider credentials and an immutable active release. Do not point \`POP_PARTY_CONTENT_ROOT\` at \`.pop-party/content\`; that override is only for the engine-owned local development command. Configure provider, OAuth, and content-writer secrets in Render rather than committing them.\n`);
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
