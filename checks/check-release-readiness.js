"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assertPublicPackage(manifest, expectedName, expectedVersion) {
  if (manifest.name !== expectedName) throw new Error(`Expected public package ${expectedName}`);
  if (manifest.version !== expectedVersion) throw new Error(`${expectedName} version must equal ${expectedVersion}`);
  if (manifest.private === true) throw new Error(`${expectedName} cannot be private`);
  if (manifest.license !== "MIT") throw new Error(`${expectedName} must declare MIT licensing`);
  if (manifest.publishConfig?.access !== "public" || manifest.publishConfig?.provenance !== true) {
    throw new Error(`${expectedName} must require public provenance publishing`);
  }
}

function checkReleaseReadiness(version = process.argv[2]) {
  const expectedVersion = String(version || "").trim();
  if (!exactVersionPattern.test(expectedVersion)) throw new Error("Release version must be an exact semantic version");
  const engine = readJson("packages/engine/package.json");
  const createGame = readJson("packages/create-game/package.json");
  const reference = readJson("apps/reference/package.json");
  assertPublicPackage(engine, "@pop-party/engine", expectedVersion);
  assertPublicPackage(createGame, "@pop-party/create-game", expectedVersion);
  if (createGame.bin?.["create-game"] !== "bin/create-game.js") {
    throw new Error("@pop-party/create-game must expose the npm initializer executable");
  }
  if (reference.private !== true) throw new Error("Reference application must remain private as an npm package");
  if (reference.dependencies?.["@pop-party/engine"] !== expectedVersion) {
    throw new Error("Reference application must pin the exact released engine version");
  }
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "publish.yml"), "utf8");
  for (const contract of ["id-token: write", "environment: npm-publish", "npm publish ./packages/engine", "npm publish ./packages/create-game", "--provenance", "--access public"]) {
    if (!workflow.includes(contract)) throw new Error(`Publish workflow is missing: ${contract}`);
  }
  const checkWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "check.yml"), "utf8");
  for (const [label, source] of [["publish", workflow], ["check", checkWorkflow]]) {
    if (source.includes("game-data") || source.includes(".authored-game-data")) {
      throw new Error(`${label} workflow cannot depend on a game-data branch`);
    }
  }
  console.log(`Release readiness passed for @pop-party/engine and @pop-party/create-game ${expectedVersion}.`);
}

checkReleaseReadiness();
