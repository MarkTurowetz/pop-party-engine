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
  execFileSync(process.execPath, [path.join(root, "scripts", "build-engine-package.js")], { cwd: root, stdio: "inherit" });
  const packOutput = JSON.parse(execFileSync("npm", ["pack", packageRoot, "--json", "--pack-destination", fixtureRoot], { cwd: root, encoding: "utf8", env: commandEnvironment }));
  const packed = packOutput[0];
  if (!packed?.filename) throw new Error("npm pack did not return a tarball");
  const forbidden = packed.files.filter((file) => /(?:^|\/)(?:game-flow|art|controller-layouts|stage-layouts)(?:\/|\.|$)/i.test(file.path));
  if (forbidden.length) throw new Error(`Game-owned files leaked into engine tarball: ${forbidden.map((file) => file.path).join(", ")}`);
  const tarball = path.join(fixtureRoot, packed.filename);
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "engine-pack-fixture", private: true }, null, 2)}\n`);
  execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: fixtureRoot, stdio: "pipe", env: commandEnvironment });
  const fixtureRequire = createRequire(path.join(fixtureRoot, "fixture.js"));
  const engine = fixtureRequire("@pop-party/engine");
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
    'import { defineGame, defineGamePlugin, REQUIRED_GAME_DATA_KEYS } from "@pop-party/engine";',
    'const plugin = defineGamePlugin({ namespace: "typed", register(registry) { registry.actions("typed.action", {}); } });',
    'const gameData = Object.fromEntries(REQUIRED_GAME_DATA_KEYS.map((key) => [key, {}]));',
    'defineGame({ gameId: "typed-fixture", displayName: "Typed Fixture", version: "1.0.0", engineCompatibility: "1.0.0", content: { mode: "bundle", schemaVersion: 1 }, gameData, plugin });'
  ].join("\n"));
  execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16", "consumer.ts"], { cwd: fixtureRoot, stdio: "pipe" });
  console.log(`Packed engine fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.rmSync(path.join(packageRoot, "dist"), { recursive: true, force: true });
}
