"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");
const { execFileSync } = require("child_process");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "packages", "create-game");
const enginePackageRoot = path.join(root, "packages", "engine");
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
  if (!packed.files.some((file) => file.path === "starter/content/content-bundle.json")) throw new Error("create-game tarball is missing canonical starter content");
  if (!packed.files.some((file) => file.path === "starter/ASSET-NOTICES.json")) throw new Error("create-game tarball is missing starter asset notices");
  const tarball = path.join(fixtureRoot, packed.filename);
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "create-game-pack-fixture", private: true }, null, 2)}\n`);
  execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: fixtureRoot,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  });
  const fixtureRequire = createRequire(path.join(fixtureRoot, "fixture.js"));
  const { generateGame } = fixtureRequire("@pop-party/create-game");
  const targetRoot = path.join(fixtureRoot, "generated-game");
  generateGame({ displayName: "Generated Fixture", engineVersion: "1.0.0", targetRoot });
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(targetRoot, "package.json"), "utf8"));
  if (!fs.readFileSync(path.join(targetRoot, "LICENSE"), "utf8").startsWith("MIT License\n")) throw new Error("Generated game is missing its MIT code license");
  if (!fs.existsSync(path.join(targetRoot, "STARTER-ASSET-NOTICES.json"))) throw new Error("Generated game is missing starter asset notices");
  if (!fs.readFileSync(path.join(targetRoot, ".gitignore"), "utf8").includes(".pop-party/")) {
    throw new Error("Generated game does not ignore its local development content workspace");
  }
  const renderBlueprint = fs.readFileSync(path.join(targetRoot, "render.yaml"), "utf8");
  for (const contract of ["type: web", "runtime: node", "numInstances: 1", "startCommand: npm start", "healthCheckPath: /health"]) {
    if (!renderBlueprint.includes(contract)) throw new Error(`Generated Render Blueprint is missing ${contract}`);
  }
  if (!fs.existsSync(path.join(targetRoot, "DEPLOYMENT.md"))) throw new Error("Generated game is missing its deployment runbook");
  for (const relativePath of ["src/actions/index.js", "src/stage/index.js", "src/controller/index.js", "src/tools/index.js", "src/plugin/index.js", "tests/config.test.js"]) {
    if (!fs.existsSync(path.join(targetRoot, relativePath))) throw new Error(`Generated game is missing ${relativePath}`);
  }
  if (generatedManifest.dependencies?.["@pop-party/engine"] !== "1.0.0") throw new Error("Generated game did not pin the exact engine version");
  if (generatedManifest.scripts?.start !== "pop-party start"
    || generatedManifest.scripts?.dev !== "pop-party dev"
    || generatedManifest.scripts?.migrate !== "pop-party migrate") {
    throw new Error("Generated game is missing engine-owned service and migration scripts");
  }
  if (JSON.stringify(generatedManifest).includes("file:") || JSON.stringify(generatedManifest).includes("workspace:")) {
    throw new Error("Generated game contains a local dependency reference");
  }
  const generatedSnapshot = createLocalContentBundleProvider({ root: path.join(targetRoot, "content") }).loadPublishedRevision();
  if (generatedSnapshot.manifest.gameId !== "generated-fixture") throw new Error("Packed generator did not create an independently identified bundle");
  const enginePackOutput = JSON.parse(execFileSync("npm", ["pack", enginePackageRoot, "--json", "--pack-destination", fixtureRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  }));
  const engineTarball = path.join(fixtureRoot, enginePackOutput[0].filename);
  execFileSync("npm", ["install", engineTarball, "--no-save", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: targetRoot,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  });
  const developmentSmoke = execFileSync(process.execPath, ["-e", `
    const { startDevelopmentApplication } = require("@pop-party/engine/tooling");
    (async () => {
      const first = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: "1.0.0", host: "127.0.0.1", port: 0 });
      const firstHealth = await (await fetch(first.startup.localUrl + "/health")).json();
      await first.runtime.stop();
      const second = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: "1.0.0", host: "127.0.0.1", port: 0 });
      const result = {
        firstRevision: first.development.revision,
        healthRevision: firstHealth.release.contentRevision,
        secondRevision: second.development.revision,
        seededFirst: first.development.seeded,
        seededSecond: second.development.seeded
      };
      await second.runtime.stop();
      process.stdout.write(JSON.stringify(result));
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `], { cwd: targetRoot, encoding: "utf8" });
  const development = JSON.parse(developmentSmoke);
  if (!development.seededFirst || development.seededSecond
    || development.firstRevision !== development.secondRevision
    || development.firstRevision !== development.healthRevision) {
    throw new Error("Generated game development workspace did not seed once and remain authoritative");
  }
  if (!fs.existsSync(path.join(targetRoot, ".pop-party", "content", "content-bundle.json"))) {
    throw new Error("Generated game development workspace was not created inside the game");
  }
  execFileSync("npm", ["test"], { cwd: targetRoot, stdio: "pipe" });
  const migrationPreview = execFileSync("npm", ["run", "migrate"], { cwd: targetRoot, encoding: "utf8" });
  if (!migrationPreview.includes("Migration preview valid: level 0 -> 0") || !migrationPreview.includes("Changed paths: (none)")) {
    throw new Error("Generated game migration preview contract failed");
  }
  execFileSync("npm", ["run", "build"], { cwd: targetRoot, stdio: "pipe" });
  const gameBuild = JSON.parse(fs.readFileSync(path.join(targetRoot, "dist", "pop-party-build.json"), "utf8"));
  if (gameBuild.gameId !== "generated-fixture" || gameBuild.engineVersion !== "1.0.0") {
    throw new Error("Generated game build manifest does not identify the exact game and engine");
  }
  if (gameBuild.contentRevision !== generatedSnapshot.revision) {
    throw new Error("Generated game build manifest is not pinned to the validated content revision");
  }
  console.log(`Packed create-game fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
