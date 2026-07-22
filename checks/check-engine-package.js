"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "packages", "engine");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-engine-fixture-"));
const commandEnvironment = { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") };

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
  });
}

function assertPackageImportQuarantine() {
  const packagePrefix = `${path.resolve(packageRoot)}${path.sep}`;
  const sourceFiles = filesUnder(path.join(packageRoot, "src")).filter((file) => /\.(?:js|ts)$/.test(file));
  const violations = [];
  const importPattern = /(?:require\(\s*|from\s+|import\(\s*)["']([^"']+)["']/g;
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      if (!resolved.startsWith(packagePrefix)) {
        violations.push(`${path.relative(root, file)} -> ${specifier}`);
      }
    }
  }
  if (violations.length) {
    throw new Error(`Engine source imports files outside its package quarantine: ${violations.join(", ")}`);
  }
}

try {
  assertPackageImportQuarantine();
  const engineManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const referenceManifest = JSON.parse(fs.readFileSync(path.join(root, "apps", "reference", "package.json"), "utf8"));
  if (referenceManifest.dependencies?.["@pop-party/engine"] !== engineManifest.version) {
    throw new Error("Reference app must pin the exact local engine package version");
  }
  const referenceConfig = fs.readFileSync(path.join(root, "apps", "reference", "game.config.js"), "utf8");
  if (!referenceConfig.includes('require("@pop-party/engine/game")') || !referenceConfig.includes('require("@pop-party/engine/plugin")')) {
    throw new Error("Reference game configuration must consume the public engine package subpaths");
  }
  if (!referenceConfig.includes('require("./game-data")')) {
    throw new Error("Reference game configuration must consume app-owned game data");
  }
  const referenceServer = fs.readFileSync(path.join(root, "server.js"), "utf8");
  if (!referenceServer.includes('require("./apps/reference/game.config")')) {
    throw new Error("Reference server must load the app-owned game configuration directly");
  }
  const requiredServerImports = [
    "@pop-party/engine/security/admin",
    "@pop-party/engine/security/audit",
    "@pop-party/engine/content/admin",
    "@pop-party/engine/content/environment",
    "@pop-party/engine/rooms/content-pin",
    "@pop-party/engine/security/runtime-capabilities",
    "@pop-party/engine/testing",
    "@pop-party/engine/tooling",
    "@pop-party/engine/server"
  ];
  const missingServerImports = requiredServerImports.filter((specifier) => !referenceServer.includes(`require("${specifier}")`));
  if (missingServerImports.length) {
    throw new Error(`Reference server is missing public engine imports: ${missingServerImports.join(", ")}`);
  }
  const localRequire = createRequire(path.join(root, "package.json"));
  if (require(path.join(root, "game.config")) !== require(path.join(root, "apps", "reference", "game.config"))) {
    throw new Error("Root game configuration is not a reference-app compatibility export");
  }
  if (require(path.join(root, "apps", "reference", "game.config")).engineCompatibility !== engineManifest.version) {
    throw new Error("Reference game engine compatibility must match its exact engine dependency");
  }
  if (require(path.join(root, "shared", "game-data")) !== require(path.join(root, "apps", "reference", "game-data"))) {
    throw new Error("Legacy game-data path is not a reference-app compatibility export");
  }
  if (require(path.join(root, "server", "game-definition-runtime")).defineGame !== localRequire("@pop-party/engine/game").defineGame) {
    throw new Error("Legacy game-definition path is not a package compatibility re-export");
  }
  if (require(path.join(root, "server", "game-plugin-runtime")).defineGamePlugin !== localRequire("@pop-party/engine/plugin").defineGamePlugin) {
    throw new Error("Legacy game-plugin path is not a package compatibility re-export");
  }
  const compatibilityExports = [
    ["content-snapshot-runtime", "@pop-party/engine/content/snapshot", "createContentSnapshot"],
    ["revisioned-content-store-runtime", "@pop-party/engine/content/store", "createRevisionedContentStoreRuntime"],
    ["local-content-bundle-provider", "@pop-party/engine/content/local", "createLocalContentBundleProvider"],
    ["github-git-data-runtime", "@pop-party/engine/content/github-git", "createGithubGitDataRuntime"],
    ["github-content-bundle-store", "@pop-party/engine/content/github", "createGithubContentBundleStore"],
    ["github-app-credential-runtime", "@pop-party/engine/content/github-app", "createGithubAppCredentialRuntime"],
    ["content-store-environment-runtime", "@pop-party/engine/content/environment", "createContentStoreEnvironmentRuntime"],
    ["content-admin-handlers-runtime", "@pop-party/engine/content/admin", "createContentAdminHandlersRuntime"],
    ["room-content-pin-runtime", "@pop-party/engine/rooms/content-pin", "createRoomContentPinRuntime"],
    ["admin-auth-runtime", "@pop-party/engine/security/admin", "createAdminAuthRuntime"],
    ["admin-audit-runtime", "@pop-party/engine/security/audit", "createAdminAuditRuntime"],
    ["runtime-capability-runtime", "@pop-party/engine/security/runtime-capabilities", "createRuntimeCapabilityRuntime"],
    ["svg-sanitizer", "@pop-party/engine/security/svg", "assertSafeSvg"],
    ["stage-test-config-handler-runtime", "@pop-party/engine/testing", "createStageTestConfigHandlerRuntime"],
    ["legacy-content-bundle-exporter", "@pop-party/engine/tooling", "exportLegacyContentBundle"],
    ["art-asset-replacement-runtime", "@pop-party/engine/tooling", "normalizeArtAssetReplacementsDraft"],
    ["art-asset-replacement-runtime", "@pop-party/engine/tooling", "parseArtAssetReplacement"],
    ["art-component-normalization-runtime", "@pop-party/engine/tooling", "createArtComponentNormalizationRuntime"],
    ["art-composition-catalog-runtime", "@pop-party/engine/tooling", "createArtCompositionCatalogRuntime"],
    ["art-composition-dependency-runtime", "@pop-party/engine/tooling", "createArtCompositionDependencyReport"],
    ["art-file-runtime", "@pop-party/engine/tooling", "createArtFileRuntime"],
    ["art-manifest-store-runtime", "@pop-party/engine/tooling", "createArtManifestStoreRuntime"],
    ["art-organization-runtime", "@pop-party/engine/tooling", "normalizeArtOrganization"],
    ["art-organization-runtime", "@pop-party/engine/tooling", "removeDeletedCompositionOrganizationKeys"],
    ["art-revision-runtime", "@pop-party/engine/tooling", "compositionSaveConflict"],
    ["art-revision-runtime", "@pop-party/engine/tooling", "manifestRevision"],
    ["art-revision-runtime", "@pop-party/engine/tooling", "revisionMatches"],
    ["art-validation-runtime", "@pop-party/engine/tooling", "blockingArtArchitectureIssues"]
  ];
  for (const [legacyModule, specifier, exportName] of compatibilityExports) {
    if (require(path.join(root, "server", legacyModule))[exportName] !== localRequire(specifier)[exportName]) {
      throw new Error(`Legacy ${legacyModule} path is not a package compatibility re-export`);
    }
  }
  const serverKernel = localRequire("@pop-party/engine/server");
  const serverKernelCompatibility = [
    ["value-normalizers", "normalizeStageCode"],
    ["runtime-fault-runtime", "createRuntimeFault"],
    ["action-effect-state-runtime", "createActionEffectStateRuntime"],
    ["dynamic-game-state-runtime", "applyDynamicGameStateCode"],
    ["stored-player-answers-runtime", "storePlayerAnswerRecord"],
    ["game-session-reset-runtime", "resetGameSessionState"],
    ["player-public-runtime", "createPlayerPublicRuntime"],
    ["player-state-runtime", "createPlayerStateRuntime"],
    ["input-state-runtime", "createInputStateRuntime"],
    ["pause-runtime", "createPauseRuntime"],
    ["countdown-runtime", "createCountdownRuntime"],
    ["crafting-timer-runtime", "createCraftingTimerRuntime"],
    ["flow-navigation-runtime", "createFlowNavigationRuntime"],
    ["flow-target-runtime", "createFlowTargetRuntime"],
    ["flow-state-kind-runtime", "flowStateHasActionType"],
    ["decision-runtime", "createDecisionRuntime"],
    ["decision-action-normalization-runtime", "createDecisionActionNormalizationRuntime"],
    ["game-flow-merge-runtime", "createGameFlowMergeRuntime"],
    ["app-version", "readAppVersion"],
    ["http-utils", "sendJson"],
    ["network-urls-runtime", "createNetworkUrlsRuntime"],
    ["local-json-store", "readJsonFile"],
    ["router-runtime", "createRouterRuntime"],
    ["static-files-runtime", "createStaticFilesRuntime"],
    ["stage-events-runtime", "createStageEventsRuntime"],
    ["inactive-player-sweep-runtime", "createInactivePlayerSweepRuntime"],
    ["player-answers-runtime", "createPlayerAnswersRuntime"],
    ["room-broadcast-runtime", "createRoomBroadcastRuntime"],
    ["room-state-runtime", "createRoomStateRuntime"],
    ["voting-runtime", "createVotingRuntime"],
    ["room-phase-runtime", "createRoomPhaseRuntime"],
    ["moment-route-runtime", "createMomentRouteRuntime"],
    ["lobby-control-handlers-runtime", "createLobbyControlHandlersRuntime"],
    ["start-handlers-runtime", "createStartHandlersRuntime"],
    ["player-session-handlers-runtime", "createPlayerSessionHandlersRuntime"],
    ["lobby-payload-runtime", "createLobbyPayloadRuntime"],
    ["host-audio-runtime", "createHostAudioRuntime"],
    ["trivia-content-runtime", "createTriviaContentRuntime"],
    ["text-answer-action-runtime", "isTextAnswerAction"],
    ["controller-input-payload-runtime", "createControllerInputPayloadRuntime"],
    ["controller-submit-handlers-runtime", "createControllerSubmitHandlersRuntime"],
    ["action-completion-runtime", "createActionCompletionRuntime"],
    ["room-action-effects-runtime", "createRoomActionEffectsRuntime"],
    ["stage-action-handlers-runtime", "createStageActionHandlersRuntime"],
    ["flow-action-public-runtime", "createFlowActionPublicRuntime"],
    ["game-flow-normalization-runtime", "createGameFlowNormalizationRuntime"],
    ["room-flow-helpers-runtime", "createRoomFlowHelpersRuntime"],
    ["game-constants-runtime", "createGameConstantsRuntime"],
    ["layout-sync-runtime", "createLayoutSyncRuntime"],
    ["local-draft-runtime", "createLocalDraftRuntime"],
    ["tool-data-read-runtime", "createToolDataReadRuntime"],
    ["tool-source-readers-runtime", "createToolSourceReadersRuntime"],
    ["tool-source-stores-runtime", "createToolSourceStoresRuntime"],
    ["tool-persistence-runtime", "createToolPersistenceRuntime"],
    ["github-storage-runtime", "createGithubStorageRuntime"],
    ["tool-github-sources-runtime", "createToolGithubSourcesRuntime"],
    ["save-handlers-runtime", "createSaveHandlersRuntime"]
  ];
  for (const [legacyModule, exportName] of serverKernelCompatibility) {
    if (require(path.join(root, "server", legacyModule))[exportName] !== serverKernel[exportName]) {
      throw new Error(`Legacy ${legacyModule} path is not an engine server compatibility export`);
    }
  }
  if (require(path.join(root, "shared", "content-bundle-schema")) !== localRequire("@pop-party/engine/content/schema")) {
    throw new Error("Legacy content schema path is not a package compatibility re-export");
  }
  const packOutput = JSON.parse(execFileSync("npm", ["pack", packageRoot, "--json", "--pack-destination", fixtureRoot], { cwd: root, encoding: "utf8", env: commandEnvironment }));
  const packed = packOutput[0];
  if (!packed?.filename) throw new Error("npm pack did not return a tarball");
  const forbidden = packed.files.filter((file) => file.path.startsWith("dist/") || (file.path.endsWith(".ts") && !file.path.endsWith(".d.ts")) || /(?:^|\/)(?:game-(?:flow|data|constants)|art|controller-layouts|stage-layouts|host-audios|prompts)(?:\/|\.|$)/i.test(file.path));
  if (forbidden.length) throw new Error(`Game-owned files leaked into engine tarball: ${forbidden.map((file) => file.path).join(", ")}`);
  const packageOwnedModules = compatibilityExports.map(([legacyModule]) => `src/server/${legacyModule}.js`);
  packageOwnedModules.push(...serverKernelCompatibility.map(([legacyModule]) => `src/server/${legacyModule}.js`));
  packageOwnedModules.push("src/server/layout-normalization-runtime.js");
  packageOwnedModules.push("src/server/stage-layout-normalization-runtime.js");
  packageOwnedModules.push("src/server/controller-layout-normalization-runtime.js");
  packageOwnedModules.push("src/shared/content-bundle-schema.js");
  const missingPackageOwnedModules = packageOwnedModules.filter((expected) => !packed.files.some((file) => file.path === expected));
  if (missingPackageOwnedModules.length) throw new Error(`Canonical package modules are missing: ${missingPackageOwnedModules.join(", ")}`);
  const tarball = path.join(fixtureRoot, packed.filename);
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "engine-pack-fixture", private: true }, null, 2)}\n`);
  execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: fixtureRoot, stdio: "pipe", env: commandEnvironment });
  const fixtureRequire = createRequire(path.join(fixtureRoot, "fixture.js"));
  const engine = fixtureRequire("@pop-party/engine");
  const gameApi = fixtureRequire("@pop-party/engine/game");
  const pluginApi = fixtureRequire("@pop-party/engine/plugin");
  delete globalThis.createControllerSubmitApi;
  const clientApi = fixtureRequire("@pop-party/engine/client");
  if (globalThis.createControllerSubmitApi !== undefined) {
    throw new Error("Packed engine client entry point installed a legacy browser global as an import side effect");
  }
  const clientHttpApi = fixtureRequire("@pop-party/engine/client/http");
  if (gameApi.defineGame !== engine.defineGame || pluginApi.defineGamePlugin !== engine.defineGamePlugin) {
    throw new Error("Packed engine subpath contracts do not match the root public API");
  }
  if (clientApi.createApiClient !== clientHttpApi.createApiClient) {
    throw new Error("Packed engine client entry point does not expose the canonical HTTP API");
  }
  for (const exportName of ["createActionCompletionBarrier", "createControllerHeartbeatRuntime", "createControllerModuleCache", "createControllerSessionRuntime", "createControllerSubmitApi", "createControllerViewState", "controllerViewVisitKey", "distributedContainerItemPositions", "effectiveVisibilityTimeline", "resolveControllerSubmissionConfirmation"]) {
    if (typeof clientApi[exportName] !== "function") throw new Error(`Packed engine client entry point is missing ${exportName}`);
  }
  for (const specifier of [
    ...requiredServerImports,
    "@pop-party/engine/art/lifecycle",
    "@pop-party/engine/art/timeline",
    "@pop-party/engine/art/architecture",
    "@pop-party/engine/art/components"
  ]) fixtureRequire(specifier);
  const plugin = engine.defineGamePlugin({ namespace: "fixture", register(registry) { registry.actions("fixture.action", {}); } });
  const gameData = Object.fromEntries(engine.REQUIRED_GAME_DATA_KEYS.map((key) => [key, {}]));
  const game = engine.defineGame({
    gameId: "packed-fixture",
    displayName: "Packed Fixture",
    version: "1.0.0",
    engineCompatibility: "1.0.0",
    content: { mode: "bundle", schemaVersion: 1 },
    gameData,
    plugin
  });
  if (game.registrations.actions[0]?.id !== "fixture.action") throw new Error("Packed engine public contract failed");
  fixtureRequire("@pop-party/engine/content/github");
  fs.writeFileSync(path.join(fixtureRoot, "consumer.ts"), [
    'import { REQUIRED_GAME_DATA_KEYS } from "@pop-party/engine";',
    'import { defineGame } from "@pop-party/engine/game";',
    'import { defineGamePlugin } from "@pop-party/engine/plugin";',
    'import { controllerViewVisitKey, createActionCompletionBarrier, createApiClient, createControllerHeartbeatRuntime, createControllerModuleCache, createControllerSessionRuntime, createControllerSubmitApi, createControllerViewState, distributedContainerItemPositions, effectiveVisibilityTimeline, resolveControllerSubmissionConfirmation } from "@pop-party/engine/client";',
    'import { createControllerLayoutNormalizationRuntime, createInputStateRuntime, createLayoutNormalizationRuntime, createStageLayoutNormalizationRuntime } from "@pop-party/engine/server";',
    'import { createStageTestConfigHandlerRuntime } from "@pop-party/engine/testing";',
    'import { blockingArtArchitectureIssues, compositionSaveConflict, createArtComponentNormalizationRuntime, createArtCompositionCatalogRuntime, createArtFileRuntime, createArtManifestStoreRuntime, createLayoutSyncRuntime, exportLegacyContentBundle, manifestRevision, normalizeArtAssetReplacementsDraft, normalizeArtOrganization, parseArtAssetReplacement, removeDeletedCompositionOrganizationKeys, revisionMatches } from "@pop-party/engine/tooling";',
    'import { lifecycleLabels } from "@pop-party/engine/art/lifecycle";',
    'import { normalizeTimeline, type TimelineDocument } from "@pop-party/engine/art/timeline";',
    'import { collectArtArchitectureIssues } from "@pop-party/engine/art/architecture";',
    'import { normalizeComponentKind } from "@pop-party/engine/art/components";',
    'import { normalizeBundlePath } from "@pop-party/engine/content/schema";',
    'import { createContentSnapshot } from "@pop-party/engine/content/snapshot";',
    'import { createRevisionedContentStoreRuntime } from "@pop-party/engine/content/store";',
    'import { createLocalContentBundleProvider } from "@pop-party/engine/content/local";',
    'import { createGithubContentBundleStore } from "@pop-party/engine/content/github";',
    'import { createGithubAppCredentialRuntime } from "@pop-party/engine/content/github-app";',
    'import { createGithubGitDataRuntime } from "@pop-party/engine/content/github-git";',
    'import { createContentStoreEnvironmentRuntime } from "@pop-party/engine/content/environment";',
    'import { createContentAdminHandlersRuntime } from "@pop-party/engine/content/admin";',
    'import { createRoomContentPinRuntime } from "@pop-party/engine/rooms/content-pin";',
    'import { createAdminAuthRuntime } from "@pop-party/engine/security/admin";',
    'import { createAdminAuditRuntime } from "@pop-party/engine/security/audit";',
    'import { createRuntimeCapabilityRuntime } from "@pop-party/engine/security/runtime-capabilities";',
    'import { assertSafeSvg } from "@pop-party/engine/security/svg";',
    'const plugin = defineGamePlugin({ namespace: "typed", register(registry) { registry.actions("typed.action", {}); } });',
    'const gameData = Object.fromEntries(REQUIRED_GAME_DATA_KEYS.map((key) => [key, {}]));',
    'defineGame({ gameId: "typed-fixture", displayName: "Typed Fixture", version: "1.0.0", engineCompatibility: "1.0.0", content: { mode: "bundle", schemaVersion: 1 }, gameData, plugin });',
    'const timeline: TimelineDocument | null = normalizeTimeline({ fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] });',
    'const organization = normalizeArtOrganization();',
    'const manifest = { compositions: {} };',
    'void [controllerViewVisitKey({}, {}, "lobby"), createActionCompletionBarrier(), createApiClient, createControllerHeartbeatRuntime({ applyLayoutForPhase() {}, closeAvatarPicker() {}, elements: { meta: document.body }, getJoinButton: () => document.createElement("button"), getControllerState: () => null, hideViews() {}, renderState() {}, sendHeartbeat: async () => ({ lobby: {} }), setControllerState() {}, showView() {} }), createControllerModuleCache(), createControllerSessionRuntime({ elements: { joinState: document.body }, getControllerState: () => null, heartbeatRuntime: { start() {} }, renderState() {}, setControllerState() {}, setLocalValue() {}, setSessionValue() {} }), createControllerSubmitApi({ getControllerState: () => null, postJson: async () => null }), createControllerViewState(), distributedContainerItemPositions({}, [], "horizontal"), effectiveVisibilityTimeline(null), resolveControllerSubmissionConfirmation({}, {}), createControllerLayoutNormalizationRuntime, createInputStateRuntime, createLayoutNormalizationRuntime, createStageLayoutNormalizationRuntime, createStageTestConfigHandlerRuntime, createArtComponentNormalizationRuntime, createArtCompositionCatalogRuntime, createArtFileRuntime, createArtManifestStoreRuntime, createLayoutSyncRuntime, exportLegacyContentBundle, organization, normalizeArtAssetReplacementsDraft(), parseArtAssetReplacement, removeDeletedCompositionOrganizationKeys(organization, []), manifestRevision(manifest), revisionMatches({}, manifest), compositionSaveConflict(), blockingArtArchitectureIssues([], []), lifecycleLabels, timeline, collectArtArchitectureIssues, normalizeComponentKind, normalizeBundlePath, createContentSnapshot, createRevisionedContentStoreRuntime, createLocalContentBundleProvider, createGithubContentBundleStore, createGithubAppCredentialRuntime, createGithubGitDataRuntime, createContentStoreEnvironmentRuntime, createContentAdminHandlersRuntime, createRoomContentPinRuntime, createAdminAuthRuntime, createAdminAuditRuntime, createRuntimeCapabilityRuntime, assertSafeSvg];'
  ].join("\n"));
  execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16", "consumer.ts"], { cwd: fixtureRoot, stdio: "pipe" });
  console.log(`Packed engine fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
