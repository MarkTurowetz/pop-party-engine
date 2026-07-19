"use strict";

const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function requestHealth(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host, port, path: "/api/health", timeout: 2000 }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("timeout", () => request.destroy(new Error("health request timed out")));
    request.on("error", reject);
  });
}

async function waitForServer(port, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      if (await requestHealth(port) === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("local server did not become ready");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const port = await findOpenPort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      GAME_FLOW_STORAGE: "local",
      GAME_FLOW_GITHUB_TOKEN: "",
      GITHUB_TOKEN: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let browser;
  try {
    await waitForServer(port, child);
    browser = await chromium.launch({ headless: true });

    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    await staticPage.goto(`http://${host}:${port}/controller`, { waitUntil: "domcontentloaded" });
    const staticState = await staticPage.evaluate(() => ({
      stageCodeDisplay: getComputedStyle(document.querySelector("#stageCodeField")).display,
      playerNameDisplay: getComputedStyle(document.querySelector("#playerNameField")).display,
      joinContainerDisplay: getComputedStyle(document.querySelector("#controllerJoinButtonContainer")).display,
      hasJoinButton: Boolean(document.querySelector("#joinButton")),
      hasIntroState: Boolean(document.querySelector("#controllerIntroState")),
      hasPresentHiText: document.body.textContent.includes("Present HI THERE")
    }));
    await staticContext.close();

    assert(staticState.stageCodeDisplay === "none", "native stage-code control can flash before layout mount");
    assert(staticState.playerNameDisplay === "none", "native player-name control can flash before layout mount");
    assert(staticState.joinContainerDisplay === "none", "Join button container can flash before layout mount");
    assert(!staticState.hasJoinButton, "Join button must be spawned by the active controller layout");
    assert(!staticState.hasIntroState, "legacy controller intro state still exists");
    assert(!staticState.hasPresentHiText, "legacy Present HI THERE art still exists");

    const page = await browser.newPage();
    await page.goto(`http://${host}:${port}/controller`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#stageCodeField")?.classList.contains("controller-widget-art-host"));
    const mountedState = await page.evaluate(async () => ({
      stageCodeHidden: document.querySelector("#stageCodeField").classList.contains("controller-layout-hidden"),
      stageCodeHasArt: Boolean(document.querySelector("#stageCodeField > .controller-widget-art-layer")),
      stageCodeInputOverlay: document.querySelector("#stageCodeInput").classList.contains("controller-widget-art-overlay"),
      playerNameInputOverlay: document.querySelector("#playerNameInput").classList.contains("controller-widget-art-overlay"),
      stageCodeInputPosition: getComputedStyle(document.querySelector("#stageCodeInput")).position,
      playerNameInputPosition: getComputedStyle(document.querySelector("#playerNameInput")).position,
      joinContainerHidden: document.querySelector("#controllerJoinButtonContainer").classList.contains("controller-layout-hidden"),
      joinContainerOverflow: getComputedStyle(document.querySelector("#controllerJoinButtonContainer")).overflow,
      joinButtonCount: document.querySelectorAll("#controllerJoinButtonContainer > #joinButton").length,
      joinButtonHasArt: document.querySelector("#joinButton").classList.contains("has-controller-widget-art"),
      joinButtonOverflow: getComputedStyle(document.querySelector("#joinButton")).overflow,
      joinButtonArtRoots: document.querySelectorAll("#joinButton > .controller-widget-art-layer > .art-runtime-object").length,
      presentHiStatus: (await fetch("/api/present-hi", { method: "POST" })).status
    }));

    assert(!mountedState.stageCodeHidden, "authored Join layout did not activate the stage-code host");
    assert(mountedState.stageCodeHasArt, "authored Join layout did not mount stage-code art");
    assert(mountedState.stageCodeInputOverlay, "Join stage-code input is not painted above its authored field art");
    assert(mountedState.playerNameInputOverlay, "Join player-name input is not painted above its authored field art");
    assert(mountedState.stageCodeInputPosition === "absolute", "Join stage-code input does not fill its authored field host");
    assert(mountedState.playerNameInputPosition === "absolute", "Join player-name input does not fill its authored field host");
    assert(!mountedState.joinContainerHidden, "authored Join layout did not activate its dynamic-button container");
    assert(mountedState.joinContainerOverflow === "visible", "Join button container clips authored animation bounds");
    assert(mountedState.joinButtonCount === 1, `Join layout spawned ${mountedState.joinButtonCount} Join buttons`);
    assert(mountedState.joinButtonHasArt, "authored Join layout did not mount Join-button art");
    assert(mountedState.joinButtonOverflow === "visible", "dynamic Join button clips authored animation bounds");
    assert(mountedState.joinButtonArtRoots === 1, `Join button has ${mountedState.joinButtonArtRoots} competing art renderers`);
    assert(mountedState.presentHiStatus === 405, `removed /api/present-hi endpoint returned ${mountedState.presentHiStatus}`);

    await page.locator("#stageCodeInput").fill("ABCD");
    await page.locator("#playerNameInput").fill("BEN");
    const joinInputState = await page.evaluate(() => {
      const stageInput = document.querySelector("#stageCodeInput");
      const nameInput = document.querySelector("#playerNameInput");
      const stageRect = stageInput.getBoundingClientRect();
      const nameRect = nameInput.getBoundingClientRect();
      return {
        stageValue: stageInput.value,
        nameValue: nameInput.value,
        stageHitTarget: document.elementFromPoint(stageRect.left + stageRect.width / 2, stageRect.top + stageRect.height / 2)?.id || "",
        nameHitTarget: document.elementFromPoint(nameRect.left + nameRect.width / 2, nameRect.top + nameRect.height / 2)?.id || "",
        stageTextColor: getComputedStyle(stageInput).color,
        nameTextColor: getComputedStyle(nameInput).color
      };
    });
    assert(joinInputState.stageValue === "ABCD", "Join stage-code input rejected typed text");
    assert(joinInputState.nameValue === "BEN", "Join player-name input rejected typed text");
    assert(joinInputState.stageHitTarget === "stageCodeInput", `Join stage-code input is covered by ${joinInputState.stageHitTarget || "an unknown element"}`);
    assert(joinInputState.nameHitTarget === "playerNameInput", `Join player-name input is covered by ${joinInputState.nameHitTarget || "an unknown element"}`);
    assert(joinInputState.stageTextColor !== "rgba(0, 0, 0, 0)", "Join stage-code value text is transparent");
    assert(joinInputState.nameTextColor !== "rgba(0, 0, 0, 0)", "Join player-name value text is transparent");

    const textInputPage = await browser.newPage();
    await textInputPage.goto(`http://${host}:${port}/controller`, { waitUntil: "domcontentloaded" });
    await textInputPage.waitForFunction(() => document.querySelector("#stageCodeField")?.classList.contains("controller-widget-art-host"));
    await textInputPage.evaluate(() => {
      document.querySelectorAll("[data-controller-view]").forEach((view) => view.classList.add("hidden"));
      document.querySelector("#controllerTextState")?.classList.remove("hidden");
      window.controllerState = {
        phase: "controller-text-input",
        lobby: { controllerLayoutId: "controller-text-input" }
      };
      window.applyControllerLayoutForPhase("controller-text-input");
    });
    await textInputPage.waitForFunction(() => Boolean(document.querySelector("#controllerTextInput")?.closest("[data-controller-art-selector-host-for]")));
    const textInputState = await textInputPage.evaluate(() => {
      const input = document.querySelector("#controllerTextInput");
      const rect = input?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : 0;
      const centerY = rect ? rect.top + rect.height / 2 : 0;
      return {
        isWrapped: Boolean(input?.closest("[data-controller-art-selector-host-for]")),
        isLayoutHidden: input?.classList.contains("controller-layout-hidden") === true,
        display: input ? getComputedStyle(input).display : "missing",
        width: rect?.width || 0,
        height: rect?.height || 0,
        hitTargetId: document.elementFromPoint(centerX, centerY)?.id || ""
      };
    });
    assert(textInputState.isWrapped, "Writing Moment textarea was not mounted in its authored widget host");
    assert(!textInputState.isLayoutHidden, "Writing Moment textarea retained stale layout-hidden state inside its visible widget host");
    assert(textInputState.display !== "none", "Writing Moment textarea is not displayed");
    assert(textInputState.width > 0 && textInputState.height > 0, "Writing Moment textarea has no interactive hit box");
    assert(textInputState.hitTargetId === "controllerTextInput", `Writing Moment textarea is covered by ${textInputState.hitTargetId || "an unknown element"}`);
    await textInputPage.locator("#controllerTextInput").fill("Interactive writing answer");
    assert(
      (await textInputPage.locator("#controllerTextInput").evaluate((input) => input.value)) === "Interactive writing answer",
      "Writing Moment textarea rejected typed input"
    );
    await textInputPage.close();

    const stagePage = await browser.newPage();
    await stagePage.goto(`http://${host}:${port}/stage`, { waitUntil: "domcontentloaded" });
    await stagePage.waitForFunction(() => Boolean(document.querySelector("#stageCodeText")?.dataset.stageCodeValue));
    const stageCode = await stagePage.locator("#stageCodeText").getAttribute("data-stage-code-value");
    assert(stageCode, "stage did not publish a room code");

    await page.locator("#stageCodeInput").fill(stageCode);
    await page.locator("#playerNameInput").fill("BEN");
    await page.locator("#joinButton").click();
    await page.waitForFunction(() => Boolean(document.querySelector("#controllerLobbyButtonContainer > #startGameButton")));

    const startState = await page.evaluate(() => {
      const container = document.querySelector("#controllerLobbyButtonContainer");
      const button = container?.querySelector(":scope > #startGameButton");
      return {
        buttonCount: document.querySelectorAll("#startGameButton").length,
        containerOverflow: container ? getComputedStyle(container).overflow : "missing",
        buttonOverflow: button ? getComputedStyle(button).overflow : "missing",
        artLayerCount: button?.querySelectorAll(":scope > .controller-widget-art-layer").length || 0,
        artRootCount: button?.querySelectorAll(":scope > .controller-widget-art-layer > .art-runtime-object").length || 0,
        text: button?.textContent.trim() || ""
      };
    });
    assert(startState.buttonCount === 1, `Lobby rendered ${startState.buttonCount} Start buttons`);
    assert(startState.containerOverflow === "visible", "Lobby button container clips authored animation bounds");
    assert(startState.buttonOverflow === "visible", "dynamic Start button clips authored animation bounds");
    assert(startState.artLayerCount === 1, `Start button has ${startState.artLayerCount} art layers`);
    assert(startState.artRootCount === 1, `Start button has ${startState.artRootCount} competing art renderers`);
    assert(startState.text === "START GAME", `unexpected Start button text: ${startState.text}`);

    await page.locator("#startGameButton").click();
    await page.waitForFunction(() => document.querySelector("#startGameButton")?.dataset.optionId === "lobby.cancelStart");
    const cancelState = await page.evaluate(() => {
      const button = document.querySelector("#startGameButton");
      return {
        buttonCount: document.querySelectorAll("#startGameButton").length,
        artRootCount: button?.querySelectorAll(":scope > .controller-widget-art-layer > .art-runtime-object").length || 0,
        text: button?.textContent.trim() || ""
      };
    });
    assert(cancelState.buttonCount === 1, `Start-to-Cancel rendered ${cancelState.buttonCount} buttons`);
    assert(cancelState.artRootCount === 1, `Cancel button has ${cancelState.artRootCount} competing art renderers`);
    assert(cancelState.text === "CANCEL", `Start art remained under Cancel: ${cancelState.text}`);

    await stagePage.evaluate(async (roomCode) => {
      await fetch("/api/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageCode: roomCode, isPaused: true })
      });
      await fetch("/api/quit-to-lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageCode: roomCode })
      });
    }, stageCode);
    await page.waitForFunction(() => Boolean(document.querySelector("#controllerJoinButtonContainer > #joinButton")));
    const returnedState = await page.evaluate(() => ({
      joinButtonCount: document.querySelectorAll("#joinButton").length,
      joinArtRootCount: document.querySelectorAll("#joinButton > .controller-widget-art-layer > .art-runtime-object").length,
      staleStartButtonCount: document.querySelectorAll("#startGameButton").length,
      lobbyContainerChildren: document.querySelector("#controllerLobbyButtonContainer")?.childElementCount || 0,
      hasIntroState: Boolean(document.querySelector("#controllerIntroState")),
      hasLegacyJoinCopy: /present hi there/i.test(document.body.textContent || "")
    }));
    assert(returnedState.joinButtonCount === 1, `return to Join rendered ${returnedState.joinButtonCount} Join buttons`);
    assert(returnedState.joinArtRootCount === 1, `returned Join button has ${returnedState.joinArtRootCount} competing art renderers`);
    assert(returnedState.staleStartButtonCount === 0, "Start/Cancel button survived Pause and Quit");
    assert(returnedState.lobbyContainerChildren === 0, "Lobby button container retained stale children after Quit");
    assert(!returnedState.hasIntroState, "legacy controller intro state returned after Quit");
    assert(!returnedState.hasLegacyJoinCopy, "legacy join/presentation copy returned after Quit");

    console.log("Controller layout authority check passed.");
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
