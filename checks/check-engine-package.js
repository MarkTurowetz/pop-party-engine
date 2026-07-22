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

try {
  const referenceConfig = fs.readFileSync(path.join(root, "apps", "reference", "game.config.js"), "utf8");
  if (!referenceConfig.includes('require("@pop-party/engine/game")') || !referenceConfig.includes('require("@pop-party/engine/plugin")')) {
    throw new Error("Reference game configuration must consume the public engine package subpaths");
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
    "@pop-party/engine/security/runtime-capabilities"
  ];
  const missingServerImports = requiredServerImports.filter((specifier) => !referenceServer.includes(`require("${specifier}")`));
  if (missingServerImports.length) {
    throw new Error(`Reference server is missing public engine imports: ${missingServerImports.join(", ")}`);
  }
  const localRequire = createRequire(path.join(root, "package.json"));
  if (require(path.join(root, "game.config")) !== require(path.join(root, "apps", "reference", "game.config"))) {
    throw new Error("Root game configuration is not a reference-app compatibility export");
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
    ["svg-sanitizer", "@pop-party/engine/security/svg", "assertSafeSvg"]
  ];
  for (const [legacyModule, specifier, exportName] of compatibilityExports) {
    if (require(path.join(root, "server", legacyModule))[exportName] !== localRequire(specifier)[exportName]) {
      throw new Error(`Legacy ${legacyModule} path is not a package compatibility re-export`);
    }
  }
  if (require(path.join(root, "shared", "content-bundle-schema")) !== localRequire("@pop-party/engine/content/schema")) {
    throw new Error("Legacy content schema path is not a package compatibility re-export");
  }
  const packOutput = JSON.parse(execFileSync("npm", ["pack", packageRoot, "--json", "--pack-destination", fixtureRoot], { cwd: root, encoding: "utf8", env: commandEnvironment }));
  const packed = packOutput[0];
  if (!packed?.filename) throw new Error("npm pack did not return a tarball");
  const forbidden = packed.files.filter((file) => file.path.startsWith("dist/") || (file.path.endsWith(".ts") && !file.path.endsWith(".d.ts")) || /(?:^|\/)(?:game-flow|art|controller-layouts|stage-layouts)(?:\/|\.|$)/i.test(file.path));
  if (forbidden.length) throw new Error(`Game-owned files leaked into engine tarball: ${forbidden.map((file) => file.path).join(", ")}`);
  const packageOwnedModules = compatibilityExports.map(([legacyModule]) => `src/server/${legacyModule}.js`);
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
  if (gameApi.defineGame !== engine.defineGame || pluginApi.defineGamePlugin !== engine.defineGamePlugin) {
    throw new Error("Packed engine subpath contracts do not match the root public API");
  }
  for (const specifier of requiredServerImports) fixtureRequire(specifier);
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
    'void [normalizeBundlePath, createContentSnapshot, createRevisionedContentStoreRuntime, createLocalContentBundleProvider, createGithubContentBundleStore, createGithubAppCredentialRuntime, createGithubGitDataRuntime, createContentStoreEnvironmentRuntime, createContentAdminHandlersRuntime, createRoomContentPinRuntime, createAdminAuthRuntime, createAdminAuditRuntime, createRuntimeCapabilityRuntime, assertSafeSvg];'
  ].join("\n"));
  execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16", "consumer.ts"], { cwd: fixtureRoot, stdio: "pipe" });
  console.log(`Packed engine fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
