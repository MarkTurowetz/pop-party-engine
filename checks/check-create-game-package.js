"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "packages", "create-game");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-create-game-"));

try {
  const packOutput = JSON.parse(execFileSync("npm", ["pack", packageRoot, "--json", "--pack-destination", fixtureRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  }));
  const packed = packOutput[0];
  if (!packed?.filename) throw new Error("npm pack did not return a create-game tarball");
  if (!packed.files.some((file) => file.path === "bin/create-game.js")) throw new Error("create-game tarball is missing its CLI");
  const tarball = path.join(fixtureRoot, packed.filename);
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "create-game-pack-fixture", private: true }, null, 2)}\n`);
  execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: fixtureRoot,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  });
  const fixtureRequire = createRequire(path.join(fixtureRoot, "fixture.js"));
  const { generateGame } = fixtureRequire("@pop-party/create-game");
  const starterRoot = path.join(fixtureRoot, "starter");
  fs.mkdirSync(starterRoot);
  fs.writeFileSync(path.join(starterRoot, "content-bundle.json"), `${JSON.stringify({ gameId: "starter" }, null, 2)}\n`);
  fs.writeFileSync(path.join(starterRoot, "owned.bin"), Buffer.from([1, 2, 3]));
  const targetRoot = path.join(fixtureRoot, "generated-game");
  generateGame({ displayName: "Generated Fixture", engineVersion: "1.0.0", starterRoot, targetRoot });
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(targetRoot, "package.json"), "utf8"));
  if (generatedManifest.dependencies?.["@pop-party/engine"] !== "1.0.0") throw new Error("Generated game did not pin the exact engine version");
  if (JSON.stringify(generatedManifest).includes("file:") || JSON.stringify(generatedManifest).includes("workspace:")) {
    throw new Error("Generated game contains a local dependency reference");
  }
  console.log(`Packed create-game fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
