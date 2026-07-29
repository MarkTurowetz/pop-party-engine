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
  for (const contract of [
    "id-token: write",
    "environment: npm-publish",
    "actions/checkout@v6",
    "actions/setup-node@v6",
    "node-version: 24",
    "package-manager-cache: false",
    "scripts/publish-public-package.js --package ./packages/engine",
    "scripts/publish-public-package.js --package ./packages/create-game",
    "scripts/coordinate-reference-release.js activate",
    "scripts/trigger-render-deploy.js",
    "scripts/verify-production-release.js",
    "secrets.RENDER_DEPLOY_HOOK_URL",
    "scripts/deploy-reference-preview.js",
    "secrets.RENDER_PREVIEW_DEPLOY_HOOK_URL"
  ]) {
    if (!workflow.includes(contract)) throw new Error(`Publish workflow is missing: ${contract}`);
  }
  const publisher = fs.readFileSync(path.join(root, "scripts", "publish-public-package.js"), "utf8");
  for (const contract of ["--provenance", "--access", "public", "digestPackageDirectory"]) {
    if (!publisher.includes(contract)) throw new Error(`Public package publisher is missing: ${contract}`);
  }
  const checkWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "check.yml"), "utf8");
  for (const contract of ["actions/checkout@v6", "actions/setup-node@v6", "node-version: 24"]) {
    if (!checkWorkflow.includes(contract)) throw new Error(`Check workflow is missing: ${contract}`);
  }
  if (!/push:\s*\n\s*branches:\s*\[main\]/.test(checkWorkflow)) {
    throw new Error("Check workflow must avoid duplicate feature-branch push and pull-request runs");
  }
  const previewWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "preview.yml"), "utf8");
  for (const contract of [
    "workflow_run:",
    "workflows: [check]",
    "workflow_run.conclusion == 'success'",
    "workflow_run.event == 'push'",
    "workflow_run.head_branch == 'main'",
    "workflow_run.head_sha",
    "scripts/deploy-reference-preview.js",
    "secrets.RENDER_PREVIEW_DEPLOY_HOOK_URL"
  ]) {
    if (!previewWorkflow.includes(contract)) throw new Error(`Preview workflow is missing: ${contract}`);
  }
  const renderBlueprint = fs.readFileSync(path.join(root, "render.yaml"), "utf8");
  for (const contract of [
    "autoDeployTrigger: off",
    "buildCommand: npm ci --no-audit --no-fund && npm run build-info:next",
    "startCommand: node server.js",
    "key: NODE_VERSION",
    "value: 24",
    "name: pop-party",
    "name: pop-party-preview",
    "key: PARTY_GAME_DEPLOYMENT_CHANNEL",
    "value: production",
    "value: preview"
  ]) {
    if (!renderBlueprint.includes(contract)) throw new Error(`Render Blueprint is missing: ${contract}`);
  }
  for (const [label, source] of [["publish", workflow], ["check", checkWorkflow]]) {
    if (source.includes("game-data") || source.includes(".authored-game-data")) {
      throw new Error(`${label} workflow cannot depend on a game-data branch`);
    }
  }
  console.log(`Release readiness passed for @pop-party/engine and @pop-party/create-game ${expectedVersion}.`);
}

checkReleaseReadiness();
