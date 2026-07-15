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
    const page = await browser.newPage();
    await page.goto(`http://${host}:${port}/stage`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(
      window.PartyGamePlayerRoster &&
      window.PartyGameArtObject &&
      window.artComposition?.("prefab-player-widget-mc") &&
      window.artComposition?.("wipe-widget-mc")
    ));

    const result = await page.evaluate(async () => {
      const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
      const hostElement = document.createElement("section");
      hostElement.style.width = "900px";
      hostElement.style.height = "400px";
      document.body.appendChild(hostElement);
      const roster = window.PartyGamePlayerRoster.createRenderer({
        host: hostElement,
        document,
        gameObjectApi: window.PartyGameGameObject,
        getComposition: (id) => window.artComposition(id)
      });
      const makePlayer = (hidden, correct = null) => ({
        id: "p1",
        name: "Player",
        active: true,
        isVip: true,
        avatar: { shape: "rex", color: "#22d3ee" },
        displayedAnswer: { text: "TUESDAY", nonce: "answer-1", hidden, correct }
      });
      let player = makePlayer(true);
      roster.render([player], { instant: true });
      const tile = hostElement.querySelector(".player-tile[data-player-id='p1']");
      const tree = roster.tileRenderers.get(tile);
      const bubbleView = () => tree.viewForComponentId("player-answer-bubble-mc");
      const bubbleVisual = () => bubbleView().createVisual();
      const lifecycle = () => bubbleView().lifecycleState();
      const token = () => bubbleView().element.dataset.visualAnimationToken;
      const frame = () => bubbleVisual().timelinePlayer.currentFrame;
      const correctnessFill = () => hostElement
        .querySelector("[data-art-component-id='answer-bubble-card']")
        ?.style.getPropertyValue("--component-fill-color");
      const componentState = (componentId) => hostElement
        .querySelector(`[data-art-component-id='${componentId}']`)
        ?.dataset.visualState;
      const avatarBaseVisibleAtSpawn = hostElement
        .querySelector("[data-art-component-id='player-avatar']")
        ?.dataset.visualVisible;
      const avatarSpawnStartState = componentState("player-avatar-mc");
      const nameSpawnStartState = componentState("player-name-mc");
      const vipSpawnStartState = componentState("vip-mc");
      await sleep(400);
      const avatarBaseVisibleAfterSpawn = hostElement
        .querySelector("[data-art-component-id='player-avatar']")
        ?.dataset.visualVisible;
      const avatarSpawnFinalState = componentState("player-avatar-mc");
      const nameSpawnFinalState = componentState("player-name-mc");
      const vipSpawnFinalState = componentState("vip-mc");
      roster.render([player], { instant: false });
      await sleep(50);
      const avatarBaseVisibleAfterHeartbeat = hostElement
        .querySelector("[data-art-component-id='player-avatar']")
        ?.dataset.visualVisible;

      player = makePlayer(false);
      roster.render([player], { instant: false });
      const appearToken = token();
      const appearStartFrame = frame();
      roster.setAnswerBubblesShown(true, { instant: true });
      const appearTokenAfterReconcile = token();
      await sleep(100);
      roster.render([player], { instant: false });
      roster.setAnswerBubblesShown(true, { instant: false });
      const appearMidFrame = frame();
      const appearMidToken = token();
      await sleep(500);
      const appearFinalState = lifecycle();

      player = makePlayer(false, true);
      roster.render([player], { instant: false });
      const correctnessStartedAt = performance.now();
      await Promise.race([
        new Promise((resolve) => roster.revealAnswerCorrectness({
          answerCorrectness: { correctPlayerIds: ["p1"], incorrectPlayerIds: [] },
          complete: resolve
        })),
        sleep(500).then(() => { throw new Error("Correctness target callback timed out"); })
      ]);
      const correctnessDuration = performance.now() - correctnessStartedAt;
      const correctFill = correctnessFill();
      roster.render([player], { instant: false });
      const reconciledCorrectFill = correctnessFill();

      player = makePlayer(true, true);
      roster.render([player], { instant: false });
      const disappearToken = token();
      const disappearStartedAt = performance.now();
      const disappearCompletion = new Promise((resolve) => {
        roster.setAnswerBubblesShown(false, { instant: false, complete: resolve });
      });
      await sleep(100);
      roster.render([player], { instant: false });
      roster.setAnswerBubblesShown(false, { instant: false });
      const disappearMidToken = token();
      const disappearMidFrame = frame();
      await Promise.race([
        disappearCompletion,
        sleep(1500).then(() => { throw new Error("Disappear completion timed out"); })
      ]);

      return {
        appearFinalState,
        appearMidFrame,
        appearMidToken,
        appearStartFrame,
        appearToken,
        appearTokenAfterReconcile,
        avatarBaseVisibleAfterHeartbeat,
        avatarBaseVisibleAfterSpawn,
        avatarBaseVisibleAtSpawn,
        avatarSpawnFinalState,
        avatarSpawnStartState,
        correctFill,
        correctnessDuration,
        disappearDuration: performance.now() - disappearStartedAt,
        disappearFinalState: lifecycle(),
        disappearMidFrame,
        disappearMidToken,
        disappearToken,
        nameSpawnFinalState,
        nameSpawnStartState,
        reconciledCorrectFill,
        vipSpawnFinalState,
        vipSpawnStartState
      };
    });

    assert(result.avatarBaseVisibleAtSpawn === "true", "spawned avatar base remained parked");
    assert(result.avatarBaseVisibleAfterSpawn === "true", "avatar base was re-parked when Appear completed");
    assert(result.avatarBaseVisibleAfterHeartbeat === "true", "avatar base was re-parked by lobby reconciliation");
    assert(result.avatarSpawnStartState === "appearing", `avatar spawn started in ${result.avatarSpawnStartState}`);
    assert(result.nameSpawnStartState === "appearing", `name spawn started in ${result.nameSpawnStartState}`);
    assert(result.vipSpawnStartState === "appearing", `VIP spawn started in ${result.vipSpawnStartState}`);
    assert(result.avatarSpawnFinalState === "shown", `avatar spawn ended in ${result.avatarSpawnFinalState}`);
    assert(result.nameSpawnFinalState === "shown", `name spawn ended in ${result.nameSpawnFinalState}`);
    assert(result.vipSpawnFinalState === "shown", `VIP spawn ended in ${result.vipSpawnFinalState}`);
    assert(result.appearToken && result.appearToken === result.appearTokenAfterReconcile, "instant reconciliation interrupted Appear");
    assert(result.appearToken === result.appearMidToken, "repeated payload restarted Appear");
    assert(result.appearMidFrame > result.appearStartFrame, "Appear did not advance through authored frames");
    assert(result.appearFinalState === "shown", `Appear ended in ${result.appearFinalState}`);
    assert(result.correctFill === "#8dff5f", `Correct state used ${result.correctFill || "no fill"}`);
    assert(result.correctnessDuration < 250, `Correctness used a legacy delay (${Math.round(result.correctnessDuration)}ms)`);
    assert(result.reconciledCorrectFill === "#8dff5f", `reconciliation reset Correct to ${result.reconciledCorrectFill || "no fill"}`);
    assert(result.disappearToken && result.disappearToken === result.disappearMidToken, "repeated payload restarted Disappear");
    assert(result.disappearMidFrame > 17, "Disappear did not advance through authored frames");
    assert(result.disappearDuration >= 350, `Disappear completed too early (${Math.round(result.disappearDuration)}ms)`);
    assert(result.disappearFinalState === "hidden", `Disappear ended in ${result.disappearFinalState}`);

    const wipeResult = await page.evaluate(async () => {
      const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
      const element = document.createElement("div");
      element.className = "stage-wipe hidden";
      element.style.width = "1920px";
      element.style.height = "1080px";
      document.body.appendChild(element);
      const widgetArt = window.PartyGameStageWidgetArt.createRenderer({
        document,
        visualAnimation: window.visualAnimation,
        getComposition: (id) => window.artComposition(id)
      });
      let renderResult = null;
      const controller = window.PartyGameStageWipe.createController({
        element,
        renderArt: () => {
          renderResult = widgetArt.renderBound(element, { compositionId: "wipe-widget-mc" }, {});
          return renderResult;
        }
      });
      const firstStripLeft = () => Number.parseFloat(
        element.querySelector("[data-art-component-id='wipe-strip-1']")?.style.left || "NaN"
      );

      const appearStartedAt = performance.now();
      const appearCompletion = new Promise((resolve) => controller.setShown(true, { complete: resolve }));
      await sleep(250);
      const appearMidLeft = firstStripLeft();
      await Promise.race([
        appearCompletion,
        sleep(1500).then(() => { throw new Error("Wipe Appear callback timed out"); })
      ]);
      const appearDuration = performance.now() - appearStartedAt;
      const appearFrame = controller.timelineRenderer?.rootTimelinePlayer?.currentFrame;
      const appearFinalLeft = firstStripLeft();

      const disappearStartedAt = performance.now();
      const disappearCompletion = new Promise((resolve) => controller.setShown(false, { complete: resolve }));
      await sleep(250);
      const disappearMidLeft = firstStripLeft();
      await Promise.race([
        disappearCompletion,
        sleep(1500).then(() => { throw new Error("Wipe Disappear callback timed out"); })
      ]);
      return {
        appearDuration,
        appearFinalLeft,
        appearFrame,
        appearMidLeft,
        disappearDuration: performance.now() - disappearStartedAt,
        disappearFrame: controller.timelineRenderer?.rootTimelinePlayer?.currentFrame,
        disappearMidLeft,
        componentIds: Array.from(element.querySelectorAll("[data-art-component-id]"), (node) => node.dataset.artComponentId),
        compositionComponentCount: window.artComposition("wipe-widget-mc")?.components?.length || 0,
        renderResultPresent: Boolean(renderResult?.renderer),
        legacyLineCount: document.querySelectorAll("#stageWipe .wipe-line").length,
        stripCount: element.querySelectorAll("[data-art-component-id^='wipe-strip-']").length,
        visibleAfterDisappear: controller.isVisuallyPresent()
      };
    });

    assert(
      wipeResult.stripCount === 7,
      `Wipe rendered ${wipeResult.stripCount} authored strips (${wipeResult.componentIds.join(", ") || "no components"}; source ${wipeResult.compositionComponentCount}; renderer ${wipeResult.renderResultPresent})`
    );
    assert(wipeResult.legacyLineCount === 0, "legacy CSS wipe lines are still mounted");
    assert(wipeResult.appearMidLeft > -60 && wipeResult.appearMidLeft < 50, "Wipe Appear did not advance through authored motion");
    assert(Math.abs(wipeResult.appearFinalLeft - 50) < 0.1, `Wipe Appear ended at ${wipeResult.appearFinalLeft}%`);
    assert(wipeResult.appearDuration >= 550, `Wipe Appear callback fired too early (${Math.round(wipeResult.appearDuration)}ms)`);
    assert(wipeResult.appearFrame === 22, `Wipe Appear callback fired at parent frame ${wipeResult.appearFrame}`);
    assert(wipeResult.disappearMidLeft > 50, "Wipe Disappear did not advance through authored motion");
    assert(wipeResult.disappearDuration >= 550, `Wipe Disappear callback fired too early (${Math.round(wipeResult.disappearDuration)}ms)`);
    assert(wipeResult.disappearFrame === 45, `Wipe Disappear callback fired at parent frame ${wipeResult.disappearFrame}`);
    assert(wipeResult.visibleAfterDisappear === false, "Wipe remained visible after Disappear callback");
    console.log("Player, answer bubble, and Wipe Widget MC authored lifecycle browser check passed.");
  } finally {
    await browser?.close();
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

main().catch((error) => {
  console.error("Answer bubble authored lifecycle browser check failed:");
  console.error(`- ${error.message}`);
  process.exitCode = 1;
});
