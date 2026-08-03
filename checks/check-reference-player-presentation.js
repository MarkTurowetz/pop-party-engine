#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const host = "127.0.0.1";

function openPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Reference server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok && (await response.json()).ok === true) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Reference server did not become healthy");
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.status, 200, `${pathname} failed: ${payload.error || response.status}`);
  assert.equal(payload.ok, true, `${pathname} did not return ok`);
  return payload;
}

async function main() {
  const port = await openPort();
  const baseUrl = `http://${host}:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      GAME_FLOW_STORAGE: "local",
      GAME_FLOW_GITHUB_TOKEN: "",
      GITHUB_TOKEN: "",
      PARTY_GAME_RUNTIME_CAPABILITIES: "legacy"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let browser;
  try {
    await waitForHealth(baseUrl, child);
    await postJson(baseUrl, "/api/stage/rooms", { stageCode: "AVTR" });
    const ava = await postJson(baseUrl, "/api/join", { stageCode: "AVTR", playerName: "AVA" });
    const ben = await postJson(baseUrl, "/api/join", { stageCode: "AVTR", playerName: "BEN" });

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(`${baseUrl}/stage?stage=AVTR`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      document.querySelectorAll('[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-collection-item="true"]').length === 2
    );

    const before = await page.evaluate(({ avaId, benId }) => {
      const host = document.querySelector('[data-stage-layout-element-id="gameplayerpresentation"]');
      const items = [...host.querySelectorAll(':scope > [data-game-plugin-renderer-collection-item="true"]')];
      const visible = (element) => {
        const rect = element?.getBoundingClientRect();
        const style = element ? getComputedStyle(element) : null;
        return Boolean(rect && rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden");
      };
      const itemState = items.map((item) => {
        const avatarSprite = [...item.querySelectorAll('[data-art-component-id="avatar"]')]
          .find((element) => element.classList.contains("is-sprite"));
        return {
          key: item.getAttribute("data-game-plugin-renderer-item-key"),
          visible: visible(item),
          widgetVisible: visible(item.querySelector('[data-art-component-id="player-widget-mc"]')),
          avatarVisible: visible(avatarSprite),
          backgroundVisible: visible(item.querySelector('[data-art-component-id="avatar-background"]')),
          avatarAsset: avatarSprite?.dataset.spriteSource || "",
          name: item.querySelector('[data-art-component-id="name-text"]')?.textContent?.trim() || ""
        };
      });
      window.__referenceFirstPlayerItem = items.find((item) => item.getAttribute("data-game-plugin-renderer-item-key") === avaId);
      return {
        hostVisible: visible(host),
        hostDiagnostic: host ? {
          className: host.className,
          rect: Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, host.getBoundingClientRect()[key]])),
          display: getComputedStyle(host).display,
          visibility: getComputedStyle(host).visibility,
          opacity: getComputedStyle(host).opacity,
          dataset: { ...host.dataset }
        } : null,
        itemState,
        model: window.currentStageState?.lobby?.gamePlugin?.viewModels?.["reference.players"]
          || window.currentStageState?.gamePlugin?.viewModels?.["reference.players"],
        hasEngineAvatarRole: Boolean(document.querySelector('[data-semantic-role="engine.stage.playerIdentityWidget"]')),
        expectedIds: [avaId, benId]
      };
    }, { avaId: ava.player.id, benId: ben.player.id });

    assert.equal(before.hostVisible, true, `The authored player-presentation collection is not visible: ${JSON.stringify(before.hostDiagnostic)}`);
    assert.deepEqual(before.itemState.map((item) => item.key), before.expectedIds, "Player items are not keyed by public player ID");
    assert.deepEqual(before.itemState.map((item) => item.name), ["AVA", "BEN"], "Local player-name Art did not bind public names");
    for (const item of before.itemState) {
      assert.equal(item.visible, true, `${item.key} collection item has no visible geometry`);
      assert.equal(item.widgetVisible, true, `${item.key} local Player Widget MC is hidden`);
      assert.equal(item.avatarVisible, true, `${item.key} local avatar sprite is hidden`);
      assert.equal(item.backgroundVisible, true, `${item.key} local avatar background is hidden`);
      assert.ok(item.avatarAsset, `${item.key} local avatar sprite has no image asset`);
    }
    assert.equal(before.model.players.length, 2, "Stage did not receive the reference game's player view model");
    assert.equal(before.hasEngineAvatarRole, false, "Reference avatars depend on a retired engine avatar role");

    const cal = await postJson(baseUrl, "/api/join", { stageCode: "AVTR", playerName: "CAL" });
    await page.waitForFunction(() =>
      document.querySelectorAll('[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-collection-item="true"]').length === 3
    );
    const after = await page.evaluate((calId) => ({
      retained: window.__referenceFirstPlayerItem === document.querySelector(
        `[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-item-key="${CSS.escape(window.__referenceFirstPlayerItem?.dataset.gamePluginRendererItemKey || "")}"]`
      ),
      calName: document.querySelector(
        `[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-item-key="${CSS.escape(calId)}"] [data-art-component-id="name-text"]`
      )?.textContent?.trim() || ""
    }), cal.player.id);
    assert.equal(after.retained, true, "Adding a player rebuilt an unchanged avatar item");
    assert.equal(after.calName, "CAL", "The added player did not receive a local avatar widget");
    assert.deepEqual(browserErrors, [], `Stage emitted browser errors: ${browserErrors.join("; ")}`);
    console.log("Reference-game-owned player avatars rendered and reconciled in Chromium.");
  } catch (error) {
    if (stdout.trim()) console.error(`\nserver stdout:\n${stdout.trim()}`);
    if (stderr.trim()) console.error(`\nserver stderr:\n${stderr.trim()}`);
    throw error;
  } finally {
    await browser?.close();
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

main().catch((error) => {
  console.error(`Reference player presentation check failed: ${error.message}`);
  process.exitCode = 1;
});
