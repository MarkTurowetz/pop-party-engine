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
  if (!referenceConfig.includes('mode: "bundle"') || referenceConfig.includes('require("./game-data")')) {
    throw new Error("Reference game configuration must be bundle-backed without importing legacy game data");
  }
  const rootServer = fs.readFileSync(path.join(root, "server.js"), "utf8");
  if (!rootServer.includes('require("./apps/reference/server")')) {
    throw new Error("Root server must remain only a reference-app compatibility launcher");
  }
  const referenceServer = fs.readFileSync(path.join(root, "apps", "reference", "server.js"), "utf8");
  if (!referenceServer.includes('require("./game.config")')) {
    throw new Error("Reference server must load the app-owned game configuration directly");
  }
  if (!referenceServer.includes('require("@pop-party/engine/server/application")')) {
    throw new Error("Reference server must start through the public engine application boundary");
  }
  if (referenceServer.includes("authoring-source-game-data")
    || referenceServer.includes("createWebServiceRuntime")
    || referenceServer.includes("createRouterRuntime")) {
    throw new Error("Reference server must remain a thin game-owned wrapper without engine application assembly");
  }
  const referenceCompatibilityModules = [
    "art-assets-runtime",
    "art-runtime-dependencies",
    "controller-layout-normalization-runtime",
    "controller-layout-state-runtime",
    "controller-player-banner-art-runtime",
    "layout-normalization-runtime",
    "player-widget-point-popup-anchor-runtime",
    "stage-background-art-runtime",
    "stage-layout-normalization-runtime",
    "stage-layout-state-runtime"
  ];
  for (const moduleName of referenceCompatibilityModules) {
    const compatibilitySource = fs.readFileSync(path.join(root, "server", `${moduleName}.js`), "utf8");
    if (!compatibilitySource.includes(`require("../apps/reference/server/${moduleName}")`)) {
      throw new Error(`Legacy ${moduleName} path must remain only a reference-app compatibility export`);
    }
  }
  const requiredPublicImports = [
    "@pop-party/engine/security/admin",
    "@pop-party/engine/security/audit",
    "@pop-party/engine/content/admin",
    "@pop-party/engine/content/environment",
    "@pop-party/engine/rooms/content-pin",
    "@pop-party/engine/security/runtime-capabilities",
    "@pop-party/engine/testing",
    "@pop-party/engine/tooling",
    "@pop-party/engine/game",
    "@pop-party/engine/server",
    "@pop-party/engine/server/readiness",
    "@pop-party/engine/server/web-service"
  ];
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
    ["app-version", "readBuildInfo"],
    ["http-utils", "sendJson"],
    ["network-urls-runtime", "createNetworkUrlsRuntime"],
    ["web-service-runtime", "createWebServiceRuntime"],
    ["local-json-store", "readJsonFile"],
    ["router-runtime", "createRouterRuntime"],
    ["static-files-runtime", "createStaticFilesRuntime"],
    ["stage-events-runtime", "createStageEventsRuntime"],
    ["inactive-player-sweep-runtime", "createInactivePlayerSweepRuntime"],
    ["player-answers-runtime", "createPlayerAnswersRuntime"],
    ["room-broadcast-runtime", "createRoomBroadcastRuntime"],
    ["room-state-runtime", "createRoomStateRuntime"],
    ["room-runtime-content-runtime", "createRoomRuntimeContentRuntime"],
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
    ["game-readiness-runtime", "createGameReadinessRuntime"],
    ["game-service-runtime", "createGameServiceRuntime"],
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
  const engineRuntimeDataModules = new Set([
    "src/server/content-game-data-runtime.js",
    "src/server/content-game-data-runtime.d.ts"
  ]);
  const forbidden = packed.files.filter((file) => file.path.startsWith("dist/")
    || (file.path.endsWith(".ts") && !file.path.endsWith(".d.ts"))
    || (!engineRuntimeDataModules.has(file.path)
      && /(?:^|\/)(?:game-(?:flow|data|constants)|art|controller-layouts|stage-layouts|host-audios|prompts)(?:\/|\.|$)/i.test(file.path)));
  if (forbidden.length) throw new Error(`Game-owned files leaked into engine tarball: ${forbidden.map((file) => file.path).join(", ")}`);
  const packageOwnedModules = compatibilityExports.map(([legacyModule]) => `src/server/${legacyModule}.js`);
  packageOwnedModules.push(...serverKernelCompatibility.map(([legacyModule]) => `src/server/${legacyModule}.js`));
  packageOwnedModules.push("src/server/layout-normalization-runtime.js");
  packageOwnedModules.push("src/server/stage-layout-normalization-runtime.js");
  packageOwnedModules.push("src/server/controller-layout-normalization-runtime.js");
  packageOwnedModules.push("src/server/content-game-data-runtime.js");
  packageOwnedModules.push("src/shared/content-bundle-schema.js");
  const missingPackageOwnedModules = packageOwnedModules.filter((expected) => !packed.files.some((file) => file.path === expected));
  if (missingPackageOwnedModules.length) throw new Error(`Canonical package modules are missing: ${missingPackageOwnedModules.join(", ")}`);
  if (!packed.files.some((file) => file.path === "bin/pop-party.js")) {
    throw new Error("Packed engine is missing the pop-party CLI executable");
  }
  for (const expected of [
    "web/index.html",
    "web/dist/client/.vite/manifest.json",
    "web/client/app/legacy/app-shell.js",
    "web/client/styles/legacy-shell.css"
  ]) {
    if (!packed.files.some((file) => file.path === expected)) {
      throw new Error(`Packed engine is missing its browser application asset: ${expected}`);
    }
  }
  if (!packed.files.some((file) => /^web\/dist\/client\/assets\/tools-.*\.js$/.test(file.path))) {
    throw new Error("Packed engine is missing the authenticated tools application bundle");
  }
  const tarball = path.join(fixtureRoot, packed.filename);
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "engine-pack-fixture", private: true }, null, 2)}\n`);
  execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: fixtureRoot, stdio: "pipe", env: commandEnvironment });
  execFileSync(
    process.execPath,
    [path.join(root, "checks", "check-packed-engine-web-runtime.js"), tarball, engineManifest.version],
    { cwd: root, stdio: "inherit", env: commandEnvironment }
  );
  const cliHelp = execFileSync(process.execPath, [path.join(fixtureRoot, "node_modules", "@pop-party", "engine", "bin", "pop-party.js"), "--help"], { cwd: fixtureRoot, encoding: "utf8" });
  if (!cliHelp.includes("validate [content-directory]")
    || !cliHelp.includes("start [game-config]")
    || !cliHelp.includes("dev [game-config]")
    || !cliHelp.includes("migrate [game-config]")) {
    throw new Error("Packed engine CLI help contract failed");
  }
  const fixtureRequire = createRequire(path.join(fixtureRoot, "fixture.js"));
  const engine = fixtureRequire("@pop-party/engine");
  const bundleGameDataApi = fixtureRequire("@pop-party/engine/content/game-data");
  if (engine.createBundleGameData !== bundleGameDataApi.createBundleGameData) {
    throw new Error("Packed engine root and content game-data exports diverged");
  }
  const gameApi = fixtureRequire("@pop-party/engine/game");
  const pluginApi = fixtureRequire("@pop-party/engine/plugin");
  delete globalThis.createControllerSubmitApi;
  delete globalThis.PartyGameQrCode;
  const clientApi = fixtureRequire("@pop-party/engine/client");
  if (globalThis.createControllerSubmitApi !== undefined) {
    throw new Error("Packed engine client entry point installed a legacy browser global as an import side effect");
  }
  if (globalThis.PartyGameQrCode !== undefined) {
    throw new Error("Packed engine client entry point installed the QR compatibility global as an import side effect");
  }
  const clientHttpApi = fixtureRequire("@pop-party/engine/client/http");
  const clientLayoutStatesApi = fixtureRequire("@pop-party/engine/client/layout-states");
  const clientTextApi = fixtureRequire("@pop-party/engine/client/text");
  const clientQrCodeApi = fixtureRequire("@pop-party/engine/client/qr-code");
  const readinessApi = fixtureRequire("@pop-party/engine/server/readiness");
  const gameServiceApi = fixtureRequire("@pop-party/engine/server/game-service");
  const gameApplicationApi = fixtureRequire("@pop-party/engine/server/application");
  const contentMigrationsApi = fixtureRequire("@pop-party/engine/content/migrations");
  const toolingApi = fixtureRequire("@pop-party/engine/tooling");
  if (gameApi.defineGame !== engine.defineGame || pluginApi.defineGamePlugin !== engine.defineGamePlugin) {
    throw new Error("Packed engine subpath contracts do not match the root public API");
  }
  if (clientApi.createApiClient !== clientHttpApi.createApiClient) {
    throw new Error("Packed engine client entry point does not expose the canonical HTTP API");
  }
  if (clientApi.controllerLayoutStateIds !== clientLayoutStatesApi.controllerLayoutStateIds) {
    throw new Error("Packed engine client entry point does not expose the canonical controller layout states");
  }
  if (clientApi.gameTextHtml !== clientTextApi.gameTextHtml || clientTextApi.gameTextHtml("<script>x</script>") !== "&lt;script&gt;x&lt;/script&gt;") {
    throw new Error("Packed engine client text contract failed");
  }
  if (clientApi.PartyGameQrCode !== clientQrCodeApi.PartyGameQrCode || clientQrCodeApi.matrixForText("test").length !== 37) {
    throw new Error("Packed engine QR code contract failed");
  }
  if (readinessApi.createGameReadinessRuntime !== fixtureRequire("@pop-party/engine/server").createGameReadinessRuntime) {
    throw new Error("Packed engine readiness subpath does not match the server kernel");
  }
  if (gameServiceApi.createGameServiceRuntime !== fixtureRequire("@pop-party/engine/server").createGameServiceRuntime) {
    throw new Error("Packed engine game-service subpath does not match the server kernel");
  }
  if (gameApplicationApi.createGameApplicationRuntime !== fixtureRequire("@pop-party/engine/server").createGameApplicationRuntime) {
    throw new Error("Packed engine application subpath does not match the server kernel");
  }
  if (contentMigrationsApi.createContentMigrationRuntime !== fixtureRequire("@pop-party/engine/server").createContentMigrationRuntime) {
    throw new Error("Packed engine migration subpath does not match the server kernel");
  }
  for (const exportName of ["createActionCompletionBarrier", "createControllerHeartbeatRuntime", "createControllerLocalButtonRuntime", "createControllerModuleCache", "createControllerRecordingLifecycle", "createControllerSessionRuntime", "createControllerStateRuntime", "createControllerSubmitApi", "createControllerViewState", "createControllerVoiceInput", "controllerViewVisitKey", "distributedContainerItemPositions", "effectiveVisibilityTimeline", "gameTextHtml", "normalizeGameTextFontFamily", "resolveControllerSubmissionConfirmation", "shouldDeferVoiceHeartbeat"]) {
    if (typeof clientApi[exportName] !== "function") throw new Error(`Packed engine client entry point is missing ${exportName}`);
  }
  for (const exportName of ["createToolPersistenceRuntime", "createToolSourceReadersRuntime"]) {
    if (typeof toolingApi[exportName] !== "function") throw new Error(`Packed engine tooling entry point is missing ${exportName}`);
  }
  for (const specifier of [
    ...requiredPublicImports,
    "@pop-party/engine/server/application",
    "@pop-party/engine/content/migrations",
    "@pop-party/engine/art/lifecycle",
    "@pop-party/engine/art/timeline",
    "@pop-party/engine/art/architecture",
    "@pop-party/engine/art/components"
  ]) fixtureRequire(specifier);
  const plugin = engine.defineGamePlugin({ namespace: "fixture", register(registry) { registry.actions("fixture.action", { name: "Fixture Action", execute() {} }); } });
  const game = engine.defineGame({
    gameId: "packed-fixture",
    displayName: "Packed Fixture",
    version: "1.0.0",
    engineCompatibility: "1.0.0",
    content: { mode: "bundle", schemaVersion: 1 },
    plugin
  });
  if (game.registrations.actions[0]?.id !== "fixture.action") throw new Error("Packed engine public contract failed");
  fixtureRequire("@pop-party/engine/content/github");
  fs.writeFileSync(path.join(fixtureRoot, "consumer.ts"), [
    'import { defineGame } from "@pop-party/engine/game";',
    'import { defineGamePlugin } from "@pop-party/engine/plugin";',
    'import { controllerLayoutStateIds, controllerViewVisitKey, createActionCompletionBarrier, createApiClient, createControllerHeartbeatRuntime, createControllerLocalButtonRuntime, createControllerModuleCache, createControllerRecordingLifecycle, createControllerSessionRuntime, createControllerStateRuntime, createControllerSubmitApi, createControllerViewState, createControllerVoiceInput, distributedContainerItemPositions, effectiveVisibilityTimeline, resolveControllerSubmissionConfirmation } from "@pop-party/engine/client";',
    'import { gameTextHtml, normalizeGameTextFontFamily } from "@pop-party/engine/client/text";',
    'import { PartyGameQrCode } from "@pop-party/engine/client/qr-code";',
    'import { createControllerLayoutNormalizationRuntime, createInputStateRuntime, createLayoutNormalizationRuntime, createStageLayoutNormalizationRuntime } from "@pop-party/engine/server";',
    'import { createGameReadinessRuntime } from "@pop-party/engine/server/readiness";',
    'import { createGameServiceRuntime } from "@pop-party/engine/server/game-service";',
    'import { createGameApplicationRuntime } from "@pop-party/engine/server/application";',
    'import { createStageTestConfigHandlerRuntime } from "@pop-party/engine/testing";',
    'import { blockingArtArchitectureIssues, compositionSaveConflict, createArtComponentNormalizationRuntime, createArtCompositionCatalogRuntime, createArtFileRuntime, createArtManifestStoreRuntime, createGameMigration, createLayoutSyncRuntime, createToolPersistenceRuntime, createToolSourceReadersRuntime, exportLegacyContentBundle, manifestRevision, normalizeArtAssetReplacementsDraft, normalizeArtOrganization, parseArtAssetReplacement, prepareDevelopmentWorkspace, removeDeletedCompositionOrganizationKeys, revisionMatches, runCli, validateContentBundle } from "@pop-party/engine/tooling";',
    'import { lifecycleLabels } from "@pop-party/engine/art/lifecycle";',
    'import { normalizeTimeline, type TimelineDocument } from "@pop-party/engine/art/timeline";',
    'import { collectArtArchitectureIssues } from "@pop-party/engine/art/architecture";',
    'import { normalizeComponentKind } from "@pop-party/engine/art/components";',
    'import { normalizeBundlePath } from "@pop-party/engine/content/schema";',
    'import { createContentSnapshot } from "@pop-party/engine/content/snapshot";',
    'import { createBundleGameData } from "@pop-party/engine/content/game-data";',
    'import { createContentMigrationRuntime } from "@pop-party/engine/content/migrations";',
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
    'const plugin = defineGamePlugin({ namespace: "typed", register(registry) { registry.actions("typed.action", { name: "Typed Action", execute() {} }); registry.inputs("typed.choice", { name: "Typed Choice", fields: [{ key: "answersSubmittedTargetActionId", label: "After", control: "actionTarget" }], submission: [{ id: "choice", type: "choice", optionsSource: "options" }], controller: { layoutStateId: "typed-choice", bindings: [{ id: "left", kind: "choice", layoutElementId: "left", field: "choice", optionIndex: 0, autoSubmit: true }, { id: "targets", kind: "choiceCollection", layoutElementId: "target-options", field: "choice", item: { artCompositionId: "typed-controller-choice", targetComponentId: "option-label", labelSource: "label", disabledSource: "disabled" }, autoSubmit: true, holdSubmit: { seconds: 1.5, submitValues: {} } }] }, recipients(context) { return context.players.map((player) => player.id); }, view(context) { return { viewer: context.viewer.id, options: [{ id: "left", label: "Left", disabled: false }] }; }, submit(context, payload) { context.state.choice = payload.choice; } }); } });',
    'defineGame({ gameId: "typed-fixture", displayName: "Typed Fixture", version: "1.0.0", engineCompatibility: "1.0.0", content: { mode: "bundle", schemaVersion: 1 }, plugin });',
    'const timeline: TimelineDocument | null = normalizeTimeline({ fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] });',
    'const organization = normalizeArtOrganization();',
    'const manifest = { compositions: {} };',
    'void [controllerLayoutStateIds, controllerViewVisitKey({}, {}, "lobby"), createActionCompletionBarrier(), createApiClient, createControllerHeartbeatRuntime({ applyLayoutForPhase() {}, closeAvatarPicker() {}, elements: { meta: document.body }, getJoinButton: () => document.createElement("button"), getControllerState: () => null, hideViews() {}, renderState() {}, sendHeartbeat: async () => ({ lobby: {} }), setControllerState() {}, showView() {} }), createControllerModuleCache(), createControllerRecordingLifecycle({ recognitionConstructor: () => null, submitText: async () => null }), createControllerSessionRuntime({ elements: { joinState: document.body }, getControllerState: () => null, heartbeatRuntime: { start() {} }, renderState() {}, setControllerState() {}, setLocalValue() {}, setSessionValue() {} }), createControllerSubmitApi({ getControllerState: () => null, postJson: async () => null }), createControllerViewState(), createControllerVoiceInput({ getButton: () => null, getReleaseBufferSeconds: () => 1, renderGlobalMessage() {}, status: document.body, submitText: async () => null }), distributedContainerItemPositions({}, [], "horizontal"), effectiveVisibilityTimeline(null), gameTextHtml("text"), normalizeGameTextFontFamily(""), PartyGameQrCode.matrixForText("text"), resolveControllerSubmissionConfirmation({}, {}), createControllerLayoutNormalizationRuntime, createGameApplicationRuntime, createGameMigration, createGameReadinessRuntime, createGameServiceRuntime, createInputStateRuntime, createLayoutNormalizationRuntime, createStageLayoutNormalizationRuntime, createStageTestConfigHandlerRuntime, createArtComponentNormalizationRuntime, createArtCompositionCatalogRuntime, createArtFileRuntime, createArtManifestStoreRuntime, createLayoutSyncRuntime, exportLegacyContentBundle, organization, normalizeArtAssetReplacementsDraft(), parseArtAssetReplacement, prepareDevelopmentWorkspace, removeDeletedCompositionOrganizationKeys(organization, []), manifestRevision(manifest), revisionMatches({}, manifest), compositionSaveConflict(), blockingArtArchitectureIssues([], []), runCli, validateContentBundle, lifecycleLabels, timeline, collectArtArchitectureIssues, normalizeComponentKind, normalizeBundlePath, createContentSnapshot, createBundleGameData, createContentMigrationRuntime, createRevisionedContentStoreRuntime, createLocalContentBundleProvider, createGithubContentBundleStore, createGithubAppCredentialRuntime, createGithubGitDataRuntime, createContentStoreEnvironmentRuntime, createContentAdminHandlersRuntime, createRoomContentPinRuntime, createAdminAuthRuntime, createAdminAuditRuntime, createRuntimeCapabilityRuntime, assertSafeSvg];'
  ].join("\n"));
  execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16", "consumer.ts"], { cwd: fixtureRoot, stdio: "pipe" });
  console.log(`Packed engine fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
