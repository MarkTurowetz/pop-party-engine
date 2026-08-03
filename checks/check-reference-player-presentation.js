#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const referenceFlow = require(path.join(root, "apps/reference/content/flow.json"));
const referenceArt = require(path.join(root, "apps/reference/content/art/manifest.json"));

function feedbackFixtureFlow() {
  const flow = structuredClone(referenceFlow);
  const visit = (actions) => {
    for (const action of actions || []) {
      if (action.timing) action.timing.seconds = 0;
      visit(action.subActions);
    }
  };
  visit(flow.routeNodes);
  for (const state of flow.states || []) visit(state.actions);
  const intro = flow.states.find((state) => state.id === "intro");
  intro.nextStateTargetId = "crafting-game-state";
  const crafting = flow.states.find((state) => state.id === "crafting-game-state");
  const shown = crafting.actions.find((action) => action.type === "setPlayerAnswersShown" && action.playerFilter === "all");
  shown.timing.seconds = 0.65;
  const reveal = crafting.actions.find((action) => action.type === "revealPlayerAnswerCorrectness");
  reveal.timing.seconds = 0.65;
  const hideWrong = crafting.actions.find((action) => action.type === "setPlayerAnswersShown" && action.playerFilter === "wrong");
  hideWrong.playerFilter = "votingWinner";
  const points = crafting.actions.find((action) => action.type === "showPoints");
  points.playerFilter = "all";
  points.points = 200;
  points.timing.seconds = 2;
  return flow;
}

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
  assert.equal(
    referenceArt.compositions["controller-avatar-picker-panel"]?.components?.[0]?.id,
    "avatar-picker-panel-background",
    "The avatar picker panel background must remain its lowest authored visual layer"
  );
  assert.equal(referenceArt.compositions["game-object-reference-player-presentation"], undefined, "The reference app must use its local Player Widget directly without a redundant presentation wrapper");
  assert.ok(
    referenceArt.compositions["prefab-player-widget-mc"]?.components?.some((component) => component.id === "reference-player-point-popup"),
    "The local Player Widget must own its points popup"
  );
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
    browser = await chromium.launch({ headless: true });
    const controllerPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const browserErrors = [];
    controllerPage.on("pageerror", (error) => browserErrors.push(`controller: ${error.message}`));
    await controllerPage.goto(`${baseUrl}/controller?stage=AVTR&name=AVA&join=1`, { waitUntil: "load" });
    try {
      await controllerPage.waitForFunction(() => (
        Boolean(window.controllerState?.player?.id)
        && document.querySelectorAll('[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option]').length === 6
        && document.querySelector('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]')
        && document.querySelector('[data-controller-layout-element-id="controllerplayerbanner"] [data-art-component-id="avatar-sprite"]')
      ), null, { timeout: 15_000 });
    } catch (error) {
      const diagnostic = await controllerPage.evaluate(() => ({
        player: window.controllerState?.player,
        phase: window.controllerState?.lobby?.phase,
        interactions: window.controllerState?.lobby?.gamePlugin?.controllerInteractions,
        controls: document.querySelectorAll('[data-game-plugin-controller-interaction]').length,
        layoutElements: [...document.querySelectorAll('[data-controller-layout-element-id]')].map((element) => ({
          id: element.getAttribute("data-controller-layout-element-id"),
          scope: element.getAttribute("data-controller-layout-scope"),
          display: getComputedStyle(element).display,
          html: element.outerHTML.slice(0, 500)
        })),
        body: document.body.innerText.slice(0, 800)
      }));
      throw new Error(`Controller presentation did not become ready: ${JSON.stringify(diagnostic)}`, { cause: error });
    }
    const ava = await controllerPage.evaluate(() => ({ player: window.controllerState.player }));
    const ben = await postJson(baseUrl, "/api/join", { stageCode: "AVTR", playerName: "BEN" });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", (error) => browserErrors.push(`stage: ${error.message}`));
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
        const avatarSprite = [...item.querySelectorAll('[data-art-component-id="avatar-sprite"]')]
          .find((element) => element.classList.contains("is-sprite"));
        const widget = item;
        return {
          key: item.getAttribute("data-game-plugin-renderer-item-key"),
          visible: visible(item),
          widgetVisible: visible(widget),
          widgetDisplay: widget ? getComputedStyle(widget).display : "missing",
          widgetState: widget?.getAttribute("data-art-current-state") || widget?.getAttribute("data-art-animation-state") || "",
          widgetHtml: widget?.outerHTML.slice(0, 800) || "",
          avatarVisible: visible(avatarSprite),
          backgroundVisible: visible(item.querySelector('[data-art-component-id="avatar-background"]')),
          avatarAsset: avatarSprite?.dataset.spriteSource || "",
          avatarTint: getComputedStyle(avatarSprite).getPropertyValue("--component-sprite-tint").trim(),
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
      assert.equal(item.widgetVisible, true, `${item.key} local Player Widget MC is hidden: ${JSON.stringify(item)}`);
      assert.equal(item.avatarVisible, true, `${item.key} local avatar sprite is hidden`);
      assert.equal(item.backgroundVisible, true, `${item.key} local avatar background is hidden`);
      assert.ok(item.avatarAsset, `${item.key} local avatar sprite has no image asset`);
    }
    assert.equal(before.model.players.length, 2, "Stage did not receive the reference game's player view model");
    assert.equal(before.hasEngineAvatarRole, false, "Reference avatars depend on a retired engine avatar role");

    const pickerBefore = await controllerPage.evaluate(() => {
      const controls = [...document.querySelectorAll('[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option]')];
      const banner = document.querySelector('[data-controller-layout-element-id="controllerplayerbanner"]');
      const trigger = document.querySelector('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]');
      const visible = (element) => {
        const rect = element?.getBoundingClientRect();
        const style = element ? getComputedStyle(element) : null;
        return Boolean(rect && rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden");
      };
      return {
        bannerVisible: visible(banner),
        bannerName: banner?.querySelector('[data-art-component-id="name-text"]')?.textContent?.trim() || "",
        bannerAvatarVisible: visible(banner?.querySelector('[data-art-component-id="avatar-sprite"]')),
        bannerAvatarAsset: banner?.querySelector('[data-art-component-id="avatar-sprite"]')?.dataset.spriteSource || "",
        triggerExpanded: trigger?.getAttribute("aria-expanded"),
        choicesHidden: controls.every((control) => !visible(control)),
        options: controls.map((control) => control.getAttribute("data-game-plugin-input-option")),
        currentAvatarId: (window.controllerState?.lobby?.gamePlugin?.controllerInteractions || [])
          .find((item) => item.id === "reference.avatarProfile")?.viewModel?.avatarId,
        controlsMatchArt: controls.every((control) => {
          const host = control.closest('[data-controller-layout-element-id]');
          const controlRect = control.getBoundingClientRect();
          const hostRect = host?.getBoundingClientRect();
          return Boolean(hostRect && Math.abs(controlRect.width - hostRect.width) < 1 && Math.abs(controlRect.height - hostRect.height) < 1);
        })
      };
    });
    assert.equal(pickerBefore.bannerVisible, true, "The reference Controller player banner is hidden in the lobby");
    assert.equal(pickerBefore.bannerName, "AVA", "The Controller banner did not bind the authenticated player's name");
    assert.equal(pickerBefore.bannerAvatarVisible, true, "The Controller banner did not render its local avatar Art");
    assert.equal(pickerBefore.triggerExpanded, "false", "The avatar picker must begin closed behind the current avatar banner");
    assert.equal(pickerBefore.choicesHidden, true, "The avatar choices must not replace the lobby UI until the banner is clicked");
    await controllerPage.locator('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]').click();
    try {
      await controllerPage.waitForFunction(() => {
        const controls = [...document.querySelectorAll('[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option]')];
        return controls.length === 6 && controls.every((control) => {
          const optionId = control.getAttribute("data-game-plugin-input-option");
          const sprite = document.querySelector(`[data-controller-layout-element-id="reference-avatar-${CSS.escape(optionId)}-icon"] [data-art-component-id="avatar-sprite"]`);
          const rect = sprite?.getBoundingClientRect();
          return rect?.width > 0 && rect?.height > 0 && getComputedStyle(sprite).display !== "none";
        });
      }, null, { timeout: 5_000 });
    } catch (error) {
      const diagnostic = await controllerPage.evaluate(async () => {
        return ({
        trigger: document.querySelector('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]')?.outerHTML,
        controls: [...document.querySelectorAll('[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option]')].map((control) => {
          const host = control.closest('[data-controller-layout-element-id]');
          const optionId = control.getAttribute("data-game-plugin-input-option");
          const sprite = document.querySelector(`[data-controller-layout-element-id="reference-avatar-${CSS.escape(optionId)}-icon"] [data-art-component-id="avatar-sprite"]`);
          const rect = sprite?.getBoundingClientRect();
          return {
            option: control.getAttribute("data-game-plugin-input-option"),
            hostClass: host?.className,
            hostState: host?.getAttribute("data-art-current-state"),
            spriteClass: sprite?.className,
            spriteState: sprite?.getAttribute("data-art-current-state"),
            spriteRect: rect && { width: rect.width, height: rect.height },
            spriteDisplay: sprite && getComputedStyle(sprite).display,
            spriteScale: sprite && getComputedStyle(sprite).scale,
            html: host?.outerHTML.slice(0, 1200)
          };
        })
      });
      });
      throw new Error(`Avatar picker icons did not become visible: ${JSON.stringify(diagnostic)}`, { cause: error });
    }
    const openPicker = await controllerPage.evaluate(() => {
      const controls = [...document.querySelectorAll('[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option]')];
      return {
        expanded: document.querySelector('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]')?.getAttribute("aria-expanded"),
        assets: controls.map((control) => {
          const optionId = control.getAttribute("data-game-plugin-input-option");
          return document.querySelector(`[data-controller-layout-element-id="reference-avatar-${CSS.escape(optionId)}-icon"] [data-art-component-id="avatar-sprite"]`)?.dataset.spriteSource || "";
        }),
        enabled: controls.every((control) => !control.disabled)
      };
    });
    assert.equal(openPicker.expanded, "true", "Clicking the current avatar did not open the authored picker layer");
    assert.equal(openPicker.enabled, true, "The opened avatar choices are disabled");
    assert.equal(new Set(openPicker.assets).size, 6, "The six avatar choices did not retain their distinct authored icon states");
    assert.deepEqual(pickerBefore.options, ["rex", "stego", "trike", "raptor", "bronto", "cleo"], "The reference avatar picker did not expose all six local choices");
    assert.equal(pickerBefore.controlsMatchArt, true, "Avatar picker native hit bounds do not match the authored widgets");

    const nextAvatarId = pickerBefore.options.find((id) => id !== pickerBefore.currentAvatarId);
    const nextAvatarState = ({ rex: "Rex", stego: "Stego", trike: "Trike", raptor: "Raptor", bronto: "Bronto", cleo: "Cleo" })[nextAvatarId];
    assert.ok(nextAvatarId && nextAvatarState, "The avatar picker did not provide an alternative selection");
    let interactionRequests = 0;
    const countInteraction = (request) => {
      if (request.url().endsWith("/api/game-plugin-controller-interaction") && request.method() === "POST") interactionRequests += 1;
    };
    controllerPage.on("request", countInteraction);
    await controllerPage.locator(
      `[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option="${pickerBefore.currentAvatarId}"]`
    ).click();
    await controllerPage.locator(
      `[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option="${nextAvatarId}"]`
    ).click();
    assert.equal(interactionRequests, 0, "Avatar choices submitted before the authored Done action");
    const avatarResponse = controllerPage.waitForResponse((response) => (
      response.url().endsWith("/api/game-plugin-controller-interaction")
      && response.request().method() === "POST"
    ));
    await controllerPage.locator('[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-binding="saveAvatar"]').click();
    await avatarResponse;
    controllerPage.off("request", countInteraction);
    await controllerPage.waitForFunction(() => (
      document.querySelector('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]')?.getAttribute("aria-expanded") === "false"
    ));
    const avaAvatarAssetBefore = before.itemState.find((item) => item.key === ava.player.id)?.avatarAsset || "";
    await page.waitForFunction(({ playerId, previousAsset, expectedState }) => {
      const item = document.querySelector(
        `[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-item-key="${CSS.escape(playerId)}"]`
      );
      const model = window.currentStageState?.lobby?.gamePlugin?.viewModels?.["reference.players"]
        || window.currentStageState?.gamePlugin?.viewModels?.["reference.players"];
      return model?.players?.find((player) => player.id === playerId)?.avatarState === expectedState
        && item?.querySelector('[data-art-component-id="avatar-sprite"]')?.dataset.spriteSource !== previousAsset;
    }, { playerId: ava.player.id, previousAsset: avaAvatarAssetBefore, expectedState: nextAvatarState }, { timeout: 15_000 });
    await controllerPage.waitForFunction((expectedAvatarId) => (
      (window.controllerState?.lobby?.gamePlugin?.controllerInteractions || [])
        .find((item) => item.id === "reference.avatarProfile")?.viewModel?.avatarId === expectedAvatarId
    ), nextAvatarId, { timeout: 15_000 });
    await controllerPage.waitForFunction((previousAsset) => (
      document.querySelector('[data-controller-layout-element-id="controllerplayerbanner"] [data-art-component-id="avatar-sprite"]')?.dataset.spriteSource !== previousAsset
    ), pickerBefore.bannerAvatarAsset, { timeout: 15_000 });
    const selectedAvatar = await page.evaluate((playerId) => {
      const sprite = document.querySelector(
        `[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-item-key="${CSS.escape(playerId)}"] [data-art-component-id="avatar-sprite"]`
      );
      return {
        asset: sprite?.dataset.spriteSource || "",
        tint: sprite ? getComputedStyle(sprite).getPropertyValue("--component-sprite-tint").trim().toLowerCase() : ""
      };
    }, ava.player.id);
    assert.notEqual(selectedAvatar.asset, avaAvatarAssetBefore, "Changing the lobby picker did not update the Stage avatar Art");
    assert.equal(selectedAvatar.tint, "#e3c6eb", "The reference Stage avatar did not retain its player color tint");

    await controllerPage.locator('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]').click();
    await controllerPage.locator(
      `[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-option="${nextAvatarId}"]`
    ).click();
    const sameAvatarResponse = controllerPage.waitForResponse((response) => (
      response.url().endsWith("/api/game-plugin-controller-interaction")
      && response.request().method() === "POST"
    ));
    await controllerPage.locator('[data-game-plugin-controller-interaction="reference.avatarProfile"][data-game-plugin-input-binding="saveAvatar"]').click();
    await sameAvatarResponse;
    await controllerPage.locator('[data-game-plugin-controller-interaction-trigger="reference.avatarProfile"]').click();
    await controllerPage.waitForFunction(() => (
      [...document.querySelectorAll('[data-game-plugin-controller-interaction="reference.avatarProfile"]')]
        .every((control) => !control.disabled)
    ));

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

    const feedbackRoom = await postJson(baseUrl, "/api/stage/rooms", { stageCode: "FDBK" });
    const feedbackConfigResponse = await fetch(`${baseUrl}/api/stage/FDBK/test-config`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-stage-capability": feedbackRoom.stageCapability
      },
      body: JSON.stringify({ flow: feedbackFixtureFlow() })
    });
    assert.equal(feedbackConfigResponse.status, 200, `Could not install the reference feedback fixture: ${await feedbackConfigResponse.text()}`);
    const feedbackController = await browser.newPage({ viewport: { width: 390, height: 844 } });
    feedbackController.on("pageerror", (error) => browserErrors.push(`feedback controller: ${error.message}`));
    await feedbackController.goto(`${baseUrl}/controller?stage=FDBK&name=QUIZ&join=1`, { waitUntil: "load" });
    await feedbackController.waitForFunction(() => (
      window.controllerState?.player?.isVip === true
      && document.querySelector('[data-option-id="lobby.startGame"]')
    ), null, { timeout: 15_000 });
    const feedbackPlayerId = await feedbackController.evaluate(() => window.controllerState.player.id);
    const feedbackStage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    feedbackStage.on("pageerror", (error) => browserErrors.push(`feedback stage: ${error.message}`));
    await feedbackStage.addInitScript(({ stageCode, stageCapability }) => {
      sessionStorage.setItem(`partyTemplateStageCapability:${stageCode}`, stageCapability);
    }, { stageCode: "FDBK", stageCapability: feedbackRoom.stageCapability });
    await feedbackStage.goto(`${baseUrl}/stage?stage=FDBK`, { waitUntil: "load" });
    await feedbackController.locator('[data-option-id="lobby.startGame"]').click();
    await feedbackStage.waitForFunction(() => window.currentStageState?.action?.id === "intro-action-mqw4c168", null, { timeout: 15_000 });
    await feedbackStage.mouse.click(720, 450);
    await feedbackStage.waitForFunction(() => window.currentStageState?.action?.id === "crafting-game-state-action-mqlafl8m", null, { timeout: 15_000 });
    await feedbackStage.mouse.click(720, 450);
    try {
      await feedbackController.waitForFunction(() => (
        window.controllerState?.lobby?.action?.id === "crafting-game-state-action-mqlrlkp0"
        && document.querySelector('[data-option-id^="choice."]')
      ), null, { timeout: 15_000 });
    } catch (error) {
      const diagnostic = await feedbackController.evaluate(() => ({
        action: window.controllerState?.lobby?.action,
        choiceInput: window.controllerState?.lobby?.choiceInput,
        viewState: window.controllerState?.controllerViewStateId,
        buttons: [...document.querySelectorAll("button")].map((button) => ({ optionId: button.dataset.optionId, text: button.textContent?.trim() })),
        body: document.body.innerText.slice(0, 1000)
      }));
      throw new Error(`Feedback Controller did not receive trivia choices: ${JSON.stringify(diagnostic)}`, { cause: error });
    }
    await feedbackController.locator('[data-option-id^="choice."]').first().click();
    await feedbackStage.waitForFunction((playerId) => {
      const model = window.currentStageState?.lobby?.gamePlugin?.viewModels?.["reference.players"]
        || window.currentStageState?.gamePlugin?.viewModels?.["reference.players"];
      const player = model?.players?.find((item) => item.id === playerId);
      const item = document.querySelector(
        `[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-item-key="${CSS.escape(playerId)}"]`
      );
      const answerText = item?.querySelector('[data-art-component-id="answer-text"]');
      const popup = item?.querySelector('[data-art-component-id="reference-player-point-popup"]');
      const popupRect = popup?.getBoundingClientRect();
      return player?.answerLifecycleState === "Update"
        && ["Correct", "Incorrect"].includes(player?.answerSemanticState)
        && player?.pointPopupState === "Popup"
        && player?.pointLabel === "+200"
        && Boolean(answerText?.textContent?.trim())
        && popupRect?.width > 0
        && popupRect?.height > 0
        && getComputedStyle(popup).display !== "none";
    }, feedbackPlayerId, { timeout: 15_000 });
    const feedbackResult = await feedbackStage.evaluate((playerId) => {
      const model = window.currentStageState?.lobby?.gamePlugin?.viewModels?.["reference.players"]
        || window.currentStageState?.gamePlugin?.viewModels?.["reference.players"];
      const player = model.players.find((item) => item.id === playerId);
      const item = document.querySelector(
        `[data-stage-layout-element-id="gameplayerpresentation"] > [data-game-plugin-renderer-item-key="${CSS.escape(playerId)}"]`
      );
      const popup = item.querySelector('[data-art-component-id="reference-player-point-popup"]');
      return {
        answer: item.querySelector('[data-art-component-id="answer-text"]')?.textContent?.trim() || "",
        answerSemanticState: player.answerSemanticState,
        answerLifecycleState: player.answerLifecycleState,
        pointText: item.querySelector('[data-art-component-id="point-text"]')?.textContent?.trim() || "",
        pointShadow: item.querySelector('[data-art-component-id="point-shadow"]')?.textContent?.trim() || "",
        pointPopupState: player.pointPopupState,
        popupVisible: popup && getComputedStyle(popup).display !== "none" && popup.getBoundingClientRect().width > 0
      };
    }, feedbackPlayerId);
    assert.ok(feedbackResult.answer, "The answer bubble did not receive the submitted answer text");
    assert.match(feedbackResult.answerSemanticState, /^(Correct|Incorrect)$/, "The answer bubble did not receive correctness state");
    assert.equal(feedbackResult.answerLifecycleState, "Update", "The answer bubble did not receive its reveal lifecycle state");
    assert.equal(feedbackResult.pointText, "+200", "The points popup text did not bind the pending award");
    assert.equal(feedbackResult.pointShadow, "+200", "The points popup shadow did not bind the pending award");
    assert.equal(feedbackResult.pointPopupState, "Popup", "The points popup timeline was not requested");
    assert.equal(feedbackResult.popupVisible, true, "The points popup Art remained hidden during its authored animation");
    assert.deepEqual(browserErrors, [], `Reference player presentation emitted browser errors: ${browserErrors.join("; ")}`);
    console.log("Reference-game-owned avatars, Controller picker/banner, answer feedback, and points popup rendered in Chromium.");
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
  console.error(`Reference player presentation check failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
