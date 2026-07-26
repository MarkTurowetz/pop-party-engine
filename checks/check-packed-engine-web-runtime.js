"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { chromium } = require("playwright");
const { generateGame } = require("../packages/create-game/src/generate-game");

const tarball = path.resolve(process.argv[2] || "");
const engineVersion = String(process.argv[3] || "").trim();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-packed-web-"));
const gameRoot = path.join(fixtureRoot, "external-game");
const entryByRole = Object.freeze({
  stage: "client/app/entries/stage.ts",
  controller: "client/app/entries/controller.ts",
  tools: "client/app/entries/tools.tsx"
});

function moduleScriptSource(html) {
  return html.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1] || "";
}

async function assertScreenBoots(browser, baseUrl, role) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  try {
    await page.goto(`${baseUrl}/${role}`, { waitUntil: "domcontentloaded" });
    try {
      if (role === "stage") {
        await page.waitForFunction(() =>
          document.querySelector("#stageScreen:not(.hidden)")
          && typeof window.setupStage === "function"
        );
      } else if (role === "controller") {
        await page.waitForFunction(() => {
          const screen = document.querySelector("#controllerScreen:not(.hidden)");
          return screen
            && screen.getAttribute("aria-busy") === "false"
            && typeof window.setupController === "function";
        });
      } else {
        await page.waitForFunction(() =>
          document.body.classList.contains("tool-dashboard-mode")
          && document.querySelector("#toolDashboardBar:not(.hidden)")
          && window.activeToolId === "flow"
          && typeof window.setupToolDashboard === "function"
        );
      }
    } catch (error) {
      const state = await page.evaluate((screenRole) => ({
        bodyClass: document.body.className,
        screenClass: document.querySelector(`#${screenRole}Screen`)?.className || "",
        setupType: typeof window[`setup${screenRole[0].toUpperCase()}${screenRole.slice(1)}`],
        scripts: [...document.scripts].map((script) => script.src).filter(Boolean)
      }), role);
      throw new Error(`/${role} did not boot: ${error.message}; state=${JSON.stringify(state)}; pageErrors=${pageErrors.join(" | ")}; consoleErrors=${consoleErrors.join(" | ")}`);
    }
    assert.deepEqual(pageErrors, [], `/${role} emitted browser errors: ${pageErrors.join("; ")}`);
  } finally {
    await page.close();
  }
}

async function main() {
  assert.ok(engineVersion, "Packed web check requires the engine version");
  assert.ok(fs.existsSync(tarball), `Packed engine tarball does not exist: ${tarball}`);

  generateGame({
    displayName: "Packed Web Fixture",
    engineVersion,
    gameId: "packed-web-fixture",
    targetRoot: gameRoot
  });
  const gameManifestPath = path.join(gameRoot, "package.json");
  const gameManifest = JSON.parse(fs.readFileSync(gameManifestPath, "utf8"));
  gameManifest.dependencies["@pop-party/engine"] = `file:${tarball}`;
  fs.writeFileSync(gameManifestPath, `${JSON.stringify(gameManifest, null, 2)}\n`, "utf8");

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: gameRoot,
    env: {
      ...process.env,
      npm_config_cache: path.join(fixtureRoot, ".npm-cache")
    },
    stdio: "pipe"
  });

  assert.equal(fs.existsSync(path.join(gameRoot, "client")), false, "External game copied the engine client runtime");
  assert.equal(fs.existsSync(path.join(gameRoot, "server")), false, "External game copied the engine server runtime");

  const gameRequire = createRequire(path.join(gameRoot, "package.json"));
  const installedEngineRoot = path.dirname(gameRequire.resolve("@pop-party/engine"));
  const installedManifestPath = path.join(installedEngineRoot, "package.json");
  const installedManifest = JSON.parse(fs.readFileSync(installedManifestPath, "utf8"));
  assert.equal(installedManifest.version, engineVersion);
  const viteManifest = JSON.parse(fs.readFileSync(
    path.join(installedEngineRoot, "web", "dist", "client", ".vite", "manifest.json"),
    "utf8"
  ));
  const { createGameApplicationRuntime } = gameRequire("@pop-party/engine/server/application");
  const gameDefinition = gameRequire(path.join(gameRoot, "game.config.js"));
  const runtime = createGameApplicationRuntime({
    gameDefinition,
    engineVersion,
    workspaceRoot: gameRoot,
    host: "127.0.0.1",
    port: 0
  });

  let browser;
  try {
    const startup = await runtime.start();
    for (const [role, manifestKey] of Object.entries(entryByRole)) {
      const response = await fetch(`${startup.localUrl}/${role}`);
      assert.equal(response.status, 200, `/${role} did not return 200`);
      const html = await response.text();
      const scriptSource = moduleScriptSource(html);
      const expectedSource = `/${viteManifest[manifestKey]?.file || ""}`;
      assert.ok(scriptSource, `/${role} omitted its module entry script`);
      assert.equal(scriptSource, expectedSource, `/${role} used the wrong Vite entry`);
      const assetResponse = await fetch(`${startup.localUrl}${scriptSource}`);
      assert.equal(assetResponse.status, 200, `${scriptSource} did not return 200`);
      assert.match(
        String(assetResponse.headers.get("content-type") || ""),
        /javascript/,
        `${scriptSource} was not served as JavaScript`
      );
    }

    browser = await chromium.launch({ headless: true });
    for (const role of Object.keys(entryByRole)) {
      await assertScreenBoots(browser, startup.localUrl, role);
    }
    console.log(`Packed engine web runtime passed for @pop-party/engine@${engineVersion}.`);
  } finally {
    await browser?.close();
    await runtime.stop();
  }
}

main()
  .catch((error) => {
    console.error("Packed engine web runtime check failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });
