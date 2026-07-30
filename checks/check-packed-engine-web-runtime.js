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

async function assertScreenBoots(browser, baseUrl, role, {
  pathName = `/${role}`,
  verify = async () => {}
} = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  try {
    await page.goto(`${baseUrl}${pathName}`, { waitUntil: "domcontentloaded" });
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
    await verify(page);
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
  fs.writeFileSync(path.join(gameRoot, "src", "actions", "index.js"), `"use strict";
module.exports = Object.freeze([{
  id: "packed-web-fixture.increment",
  value: {
    name: "Increment Packed Counter",
    fields: [
      { key: "amount", label: "Amount", control: "integer", min: 1, max: 10, default: 1 },
      { key: "resultVariable", label: "Result Variable", control: "text", default: "packedCount" }
    ],
    outputs: [
      { id: "count", name: "Count", variableField: "resultVariable", defaultVariable: "packedCount" }
    ],
    execute(context, action) {
      context.state.count = Number(context.state.count || 0) + Number(action.amount || 0);
      context.outputs.set("count", context.state.count);
    }
  }
}]);
`);
  const rendererSource = (id, layoutElementId) => `"use strict";
module.exports = Object.freeze([{
  id: ${JSON.stringify(id)},
  value: {
    name: "Packed Counter",
    target: { layoutElementId: ${JSON.stringify(layoutElementId)}, layoutScope: "moment" },
    bindings: [
      { id: "label", kind: "text", source: "label", targetComponentId: "prefab-layout-text-field-text/text", fallback: "PLUGIN 0" }
    ],
    select(context) { return { label: "PLUGIN " + String(context.state.count || 0) }; }
  }
}]);
`;
  fs.writeFileSync(
    path.join(gameRoot, "src", "stage", "index.js"),
    rendererSource("packed-web-fixture.stageCounter", "stagetitle")
  );
  fs.writeFileSync(
    path.join(gameRoot, "src", "controller", "index.js"),
    rendererSource("packed-web-fixture.controllerCounter", "controllerplayername")
  );
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
    const flowResponse = await fetch(`${startup.localUrl}/api/game-flow`);
    const flowPayload = await flowResponse.json();
    const fixtureLobby = {
      id: "lobby",
      name: "Lobby",
      entryTargetActionId: "packed-increment",
      actions: [
        {
          id: "packed-increment",
          name: "Increment Packed Counter",
          type: "packed-web-fixture.increment",
          amount: 2,
          resultVariable: "packedCount",
          timing: { mode: "E+", seconds: 0 },
          subActions: [],
          nextTargetActionId: "packed-hold"
        },
        {
          id: "packed-hold",
          name: "Hold Packed Fixture",
          type: "presentText",
          text: "Packed plugin browser fixture",
          isShown: true,
          timing: { mode: "E+", seconds: 0 },
          subActions: [],
          nextTargetActionId: "none"
        }
      ]
    };
    const fixtureFlow = {
      ...flowPayload.flow,
      states: flowPayload.flow.states.map((state) => state.id === "lobby" ? fixtureLobby : state)
    };
    const saveResponse = await fetch(`${startup.localUrl}/api/game-flow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: fixtureFlow })
    });
    assert.equal(saveResponse.status, 200, "Plugin fixture Flow did not save");
    const roomResponse = await fetch(`${startup.localUrl}/api/stage/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageCode: "PLUG" })
    });
    assert.equal(roomResponse.status, 200, "Plugin fixture room was not created");
    const room = await roomResponse.json();
    const stageHeaders = {
      "content-type": "application/json",
      "x-stage-capability": room.stageCapability
    };
    const testConfigResponse = await fetch(`${startup.localUrl}/api/stage/PLUG/test-config`, {
      method: "POST",
      headers: stageHeaders,
      body: JSON.stringify({ flow: fixtureFlow })
    });
    assert.equal(testConfigResponse.status, 200, "Plugin fixture Flow was not activated");
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
    await assertScreenBoots(browser, startup.localUrl, "stage", {
      pathName: "/stage?stage=PLUG",
      verify: async (page) => {
        await page.waitForFunction(() => [...document.querySelectorAll("[data-art-component-id='layout-text-field-text']")]
          .some((element) => element.textContent?.trim() === "PLUGIN 2"));
      }
    });
    await assertScreenBoots(browser, startup.localUrl, "controller", {
      pathName: "/controller?stage=PLUG&name=Ava&autojoin=1",
      verify: async (page) => {
        await page.waitForFunction(() => Boolean(window.controllerState));
        try {
          await page.waitForFunction(() => [...document.querySelectorAll("[data-art-component-id='layout-text-field-text']")]
            .some((element) => element.textContent?.trim() === "PLUGIN 2"), { timeout: 5000 });
        } catch (error) {
          const state = await page.evaluate(() => ({
            componentText: [...document.querySelectorAll("[data-art-component-id]")]
              .map((element) => [element.getAttribute("data-art-component-id"), element.textContent?.trim()]),
            viewModels: window.controllerState?.lobby?.gamePlugin?.viewModels,
            runtimeFault: window.controllerState?.lobby?.runtimeFault,
            controllerViewStateId: window.controllerState?.controllerViewStateId,
            target: document.querySelector("[data-controller-layout-element-id='controllerplayername']")?.outerHTML
          }));
          throw new Error(`Controller plugin renderer did not paint: ${error.message}; state=${JSON.stringify(state)}`);
        }
      }
    });
    await assertScreenBoots(browser, startup.localUrl, "tools", {
      verify: async (page) => {
        await page.locator('[data-node-id="lobby"]').dblclick();
        await page.locator('[data-node-id="packed-increment"]').evaluate((element) => element.click());
        await page.locator('[data-action-id="packed-increment"][data-action-type="packed-web-fixture.increment"]').waitFor();
        await page.locator('[data-flow-react-field="amount"] [data-flow-react-field-input="amount"]').waitFor();
        assert.equal(
          await page.locator("[data-flow-react-action-type-input]").inputValue(),
          "Increment Packed Counter"
        );
      }
    });
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
