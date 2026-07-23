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
      window.artComposition?.("crafting-timer-widget") &&
      window.artComposition?.("wipe-widget-mc")
    ));

    const result = await page.evaluate(async () => {
      const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
      const waitFor = async (condition, message, timeout = 750) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
          if (condition()) return;
          await sleep(16);
        }
        throw new Error(message);
      };
      // Match the saved Player Answer Bubble contract: its static text component
      // remains manual-size while each semantic state opts into auto-fit.
      const authoredBubble = window.artComposition("player-answer-bubble");
      const authoredAnswerTrack = authoredBubble?.timeline?.tracks?.find((track) => track.targetId === "answer-text");
      for (const keyframe of authoredAnswerTrack?.keyframes || []) keyframe.props.autoFitText = true;
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
        displayedAnswer: { text: "SUPERLONGANSWER", nonce: "answer-1", hidden, correct }
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
      const correctnessBackground = () => {
        const card = hostElement.querySelector("[data-art-component-id='answer-bubble-card']");
        return card ? getComputedStyle(card).backgroundColor : "";
      };
      const componentState = (componentId) => hostElement
        .querySelector(`[data-art-component-id='${componentId}']`)
        ?.dataset.visualState;
      const answerTextMetrics = () => {
        const component = hostElement.querySelector("[data-art-component-id='answer-text']");
        const label = component?.querySelector(".art-runtime-object-label");
        const style = label ? getComputedStyle(label) : null;
        const semanticView = tree.viewForComponentId("playerAnswerBubble");
        const semanticVisual = semanticView?.createVisual?.();
        const answerTrack = semanticVisual?.timelinePlayer?.timeline?.tracks?.find((track) => track.targetId === "answer-text");
        return {
          autoFitText: answerTrack?.keyframes?.[0]?.props?.autoFitText,
          clientHeight: label?.clientHeight || 0,
          clientWidth: label?.clientWidth || 0,
          fontSize: Number.parseFloat(style?.fontSize || "0"),
          scrollHeight: label?.scrollHeight || 0,
          scrollWidth: label?.scrollWidth || 0,
          text: label?.textContent || ""
        };
      };
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
      const appearStartedAt = performance.now();
      const appearCompletion = new Promise((resolve) => {
        roster.setAnswerBubblesShown(true, { instant: false, complete: resolve });
      });
      const appearToken = token();
      const appearStartFrame = frame();
      await waitFor(
        () => frame() > appearStartFrame,
        "Appear did not reach an authored frame before reconciliation"
      );
      roster.render([player], { instant: false });
      const appearTokenAfterReconcile = token();
      const appearMidFrame = frame();
      const appearMidToken = token();
      await Promise.race([
        appearCompletion,
        sleep(1500).then(() => { throw new Error("Appear completion timed out"); })
      ]);
      const appearDuration = performance.now() - appearStartedAt;
      const appearFinalState = lifecycle();
      const fittedAnswerText = answerTextMetrics();

      player = makePlayer(false, true);
      roster.render([player], { instant: false });
      const correctnessStartedAt = performance.now();
      await Promise.race([
        new Promise((resolve) => roster.revealAnswerCorrectness({
          answerCorrectness: { correctPlayerIds: [], incorrectPlayerIds: [] },
          complete: resolve
        })),
        sleep(500).then(() => { throw new Error("Correctness target callback timed out"); })
      ]);
      const correctnessDuration = performance.now() - correctnessStartedAt;
      const correctFill = correctnessFill();
      const correctBackground = correctnessBackground();
      roster.render([player], { instant: false });
      const reconciledCorrectFill = correctnessFill();
      const reconciledCorrectBackground = correctnessBackground();

      player = makePlayer(false, false);
      roster.render([player], { instant: false });
      await Promise.race([
        new Promise((resolve) => roster.revealAnswerCorrectness({
          answerCorrectness: { correctPlayerIds: [], incorrectPlayerIds: [] },
          complete: resolve
        })),
        sleep(500).then(() => { throw new Error("Incorrectness target callback timed out"); })
      ]);
      const incorrectFill = correctnessFill();
      const incorrectBackground = correctnessBackground();
      roster.render([player], { instant: false });
      const reconciledIncorrectBackground = correctnessBackground();

      player = makePlayer(true, false);
      roster.render([player], { instant: false });
      const disappearStartedAt = performance.now();
      const disappearCompletion = new Promise((resolve) => {
        roster.setAnswerBubblesShown(false, { instant: false, complete: resolve });
      });
      const disappearToken = token();
      await waitFor(
        () => frame() > 17,
        "Disappear did not reach an authored frame before reconciliation"
      );
      roster.render([player], { instant: false });
      const disappearMidToken = token();
      const disappearMidFrame = frame();
      await Promise.race([
        disappearCompletion,
        sleep(1500).then(() => { throw new Error("Disappear completion timed out"); })
      ]);

      return {
        appearFinalState,
        fittedAnswerText,
        appearDuration,
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
        correctBackground,
        correctFill,
        correctnessDuration,
        disappearDuration: performance.now() - disappearStartedAt,
        disappearFinalState: lifecycle(),
        disappearMidFrame,
        disappearMidToken,
        disappearToken,
        nameSpawnFinalState,
        nameSpawnStartState,
        incorrectBackground,
        incorrectFill,
        reconciledCorrectBackground,
        reconciledCorrectFill,
        reconciledIncorrectBackground,
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
    assert(result.appearToken && result.appearToken === result.appearTokenAfterReconcile, "reconciliation interrupted Appear");
    assert(result.appearToken === result.appearMidToken, "reconciliation restarted Appear");
    assert(result.appearMidFrame > result.appearStartFrame, "Appear did not advance through authored frames");
    assert(result.appearDuration >= 300, `Appear completed too early (${Math.round(result.appearDuration)}ms)`);
    assert(result.appearFinalState === "shown", `Appear ended in ${result.appearFinalState}`);
    assert(result.fittedAnswerText.autoFitText === true, "answer bubble semantic frame did not enable auto-fit");
    assert(result.fittedAnswerText.text === "SUPERLONGANSWER", `answer bubble rendered ${result.fittedAnswerText.text || "no text"}`);
    assert(
      result.fittedAnswerText.fontSize > 0 && result.fittedAnswerText.fontSize < 28,
      `long answer did not shrink from 28px (${JSON.stringify(result.fittedAnswerText)})`
    );
    assert(result.fittedAnswerText.scrollWidth <= result.fittedAnswerText.clientWidth + 1, `answer text overflowed horizontally (${result.fittedAnswerText.scrollWidth}px > ${result.fittedAnswerText.clientWidth}px)`);
    assert(result.fittedAnswerText.scrollHeight <= result.fittedAnswerText.clientHeight + 1, `answer text overflowed vertically (${result.fittedAnswerText.scrollHeight}px > ${result.fittedAnswerText.clientHeight}px)`);
    assert(result.correctFill === "#8dff5f", `Correct state used ${result.correctFill || "no fill"}`);
    assert(result.correctBackground === "rgb(141, 255, 95)", `Correct state rendered ${result.correctBackground || "no background"}`);
    assert(result.correctnessDuration < 250, `Correctness used a legacy delay (${Math.round(result.correctnessDuration)}ms)`);
    assert(result.reconciledCorrectFill === "#8dff5f", `reconciliation reset Correct to ${result.reconciledCorrectFill || "no fill"}`);
    assert(result.reconciledCorrectBackground === "rgb(141, 255, 95)", `reconciliation rendered Correct as ${result.reconciledCorrectBackground || "no background"}`);
    assert(result.incorrectFill === "#ff5c45", `Incorrect state used ${result.incorrectFill || "no fill"}`);
    assert(result.incorrectBackground === "rgb(255, 92, 69)", `Incorrect state rendered ${result.incorrectBackground || "no background"}`);
    assert(result.reconciledIncorrectBackground === "rgb(255, 92, 69)", `reconciliation rendered Incorrect as ${result.reconciledIncorrectBackground || "no background"}`);
    assert(
      result.disappearToken && result.disappearToken === result.disappearMidToken,
      `reconciliation restarted Disappear (${result.disappearToken || "none"} -> ${result.disappearMidToken || "none"})`
    );
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
      const firstStripLeft = () => {
        const strip = element.querySelector("[data-art-component-id='wipe-strip-1']");
        if (!strip) return Number.NaN;
        const hostBounds = element.getBoundingClientRect();
        const stripBounds = strip.getBoundingClientRect();
        if (!hostBounds.width) return Number.NaN;
        return ((stripBounds.left + stripBounds.width / 2 - hostBounds.left) / hostBounds.width) * 100;
      };
      const wipeArtFrame = () => controller.timelineRenderer
        ?.viewForComponentId?.("wipe-art-reference")
        ?.createVisual?.()
        ?.timelinePlayer
        ?.currentFrame;
      const authoredWipeReference = window.artComposition("wipe-widget-mc")
        ?.components
        ?.find((component) => component.id === "wipe-art-reference");
      const authoredReferenceOpacity = String(authoredWipeReference?.opacity ?? 1);
      const authoredReferenceScale = String(authoredWipeReference?.scale ?? 1);
      const wipeAppearSample = (elapsed) => {
        const reference = element.querySelector("[data-art-component-id='wipe-art-reference']");
        const layer = element.querySelector(".stage-widget-art-layer");
        const strips = Array.from(element.querySelectorAll("[data-art-component-id^='wipe-strip-']"));
        const referenceStyle = reference ? getComputedStyle(reference) : null;
        return {
          elapsed,
          artFrame: wipeArtFrame(),
          firstStripLeft: firstStripLeft(),
          hostOpacity: getComputedStyle(element).opacity,
          layerOpacity: layer ? getComputedStyle(layer).opacity : "missing",
          referenceOpacity: referenceStyle?.opacity,
          referenceScale: referenceStyle?.scale,
          referenceTransitionDuration: referenceStyle?.transitionDuration,
          stripOpacities: strips.map((strip) => getComputedStyle(strip).opacity),
          stripScales: strips.map((strip) => getComputedStyle(strip).scale)
        };
      };

      const appearStartedAt = performance.now();
      const appearCompletion = new Promise((resolve) => controller.setShown(true, { complete: resolve }));
      const appearSamples = [];
      let previousSampleTime = 0;
      for (const sampleTime of [0, 50, 100, 250, 500]) {
        await sleep(sampleTime - previousSampleTime);
        appearSamples.push(wipeAppearSample(sampleTime));
        previousSampleTime = sampleTime;
      }
      const appearMidLeft = appearSamples.find((sample) => sample.elapsed === 250)?.firstStripLeft;
      await Promise.race([
        appearCompletion,
        sleep(1500).then(() => { throw new Error("Wipe Appear callback timed out"); })
      ]);
      appearSamples.push(wipeAppearSample("callback"));
      const appearDuration = performance.now() - appearStartedAt;
      const appearFrame = wipeArtFrame();
      const appearWidgetFrame = controller.timelineRenderer?.rootTimelinePlayer?.currentFrame;
      const appearFinalLeft = firstStripLeft();

      const disappearStartedAt = performance.now();
      const disappearCompletion = new Promise((resolve) => controller.setShown(false, { complete: resolve }));
      await sleep(250);
      const disappearMidLeft = firstStripLeft();
      const wipeArtReference = element.querySelector("[data-art-component-id='wipe-art-reference']");
      const wipeArtMidStyle = wipeArtReference ? getComputedStyle(wipeArtReference) : null;
      const disappearUsedLegacyExitClass = wipeArtReference?.classList.contains("art-runtime-object-exiting") === true;
      const disappearMidOpacity = wipeArtMidStyle?.opacity;
      const disappearMidScale = wipeArtMidStyle?.scale;
      await Promise.race([
        disappearCompletion,
        sleep(1500).then(() => { throw new Error("Wipe Disappear callback timed out"); })
      ]);
      const wipeArtFinalStyle = wipeArtReference ? getComputedStyle(wipeArtReference) : null;
      const disappearFinalInstantClass = wipeArtReference?.classList.contains("art-runtime-object-instant") === true;
      const disappearFinalOpacity = wipeArtFinalStyle?.opacity;
      const disappearFinalScale = wipeArtFinalStyle?.scale;
      const disappearFinalTransitionDuration = wipeArtFinalStyle?.transitionDuration;
      await sleep(100);
      const wipeArtPostCallbackStyle = wipeArtReference ? getComputedStyle(wipeArtReference) : null;
      return {
        appearDuration,
        appearFinalLeft,
        appearFrame,
        appearMidLeft,
        appearSamples,
        appearWidgetFrame,
        authoredReferenceOpacity,
        authoredReferenceScale,
        disappearDuration: performance.now() - disappearStartedAt,
        disappearFrame: wipeArtFrame(),
        disappearWidgetFrame: controller.timelineRenderer?.rootTimelinePlayer?.currentFrame,
        disappearMidLeft,
        disappearMidOpacity,
        disappearMidScale,
        disappearUsedLegacyExitClass,
        disappearFinalInstantClass,
        disappearFinalOpacity,
        disappearFinalScale,
        disappearFinalTransitionDuration,
        disappearPostCallbackOpacity: wipeArtPostCallbackStyle?.opacity,
        disappearPostCallbackScale: wipeArtPostCallbackStyle?.scale,
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
    for (const sample of wipeResult.appearSamples) {
      const sampleLabel = `${sample.elapsed}ms/frame ${sample.artFrame}`;
      assert(sample.hostOpacity === "1", `Wipe host opacity changed to ${sample.hostOpacity} at ${sampleLabel}`);
      assert(sample.layerOpacity === "1", `Wipe art layer opacity changed to ${sample.layerOpacity} at ${sampleLabel}`);
      assert(
        sample.referenceOpacity === wipeResult.authoredReferenceOpacity,
        `Wipe Art MC opacity changed from authored ${wipeResult.authoredReferenceOpacity} to ${sample.referenceOpacity} at ${sampleLabel}`
      );
      assert(
        sample.referenceScale === wipeResult.authoredReferenceScale,
        `Wipe Art MC scale changed from authored ${wipeResult.authoredReferenceScale} to ${sample.referenceScale} at ${sampleLabel}`
      );
      assert(
        String(sample.referenceTransitionDuration || "")
          .split(",")
          .every((duration) => Number.parseFloat(duration) === 0),
        `Wipe Art MC retained CSS transitions at ${sampleLabel}: ${sample.referenceTransitionDuration}`
      );
      assert(sample.stripOpacities.every((opacity) => opacity === "1"), `A wipe strip changed opacity at ${sampleLabel}: ${sample.stripOpacities.join(", ")}`);
      assert(sample.stripScales.every((scale) => scale === "1"), `A wipe strip changed scale at ${sampleLabel}: ${sample.stripScales.join(", ")}`);
    }
    assert(wipeResult.appearMidLeft > -60 && wipeResult.appearMidLeft < 50, "Wipe Appear did not advance through authored motion");
    assert(Math.abs(wipeResult.appearFinalLeft - 50) < 0.1, `Wipe Appear ended at ${wipeResult.appearFinalLeft}%`);
    assert(wipeResult.appearDuration >= 550, `Wipe Appear callback fired too early (${Math.round(wipeResult.appearDuration)}ms)`);
    assert(wipeResult.appearFrame === 22, `Wipe Appear callback fired at art frame ${wipeResult.appearFrame}`);
    assert(wipeResult.appearWidgetFrame === 1, `Wipe Widget MC left On frame ${wipeResult.appearWidgetFrame}`);
    assert(wipeResult.disappearMidLeft > 50, "Wipe Disappear did not advance through authored motion");
    assert(wipeResult.disappearDuration >= 550, `Wipe Disappear callback fired too early (${Math.round(wipeResult.disappearDuration)}ms)`);
    assert(wipeResult.disappearFrame === 45, `Wipe Disappear callback fired at art frame ${wipeResult.disappearFrame}`);
    assert(wipeResult.disappearWidgetFrame === 0, `Wipe Widget MC did not finish Off (${wipeResult.disappearWidgetFrame})`);
    assert(wipeResult.disappearUsedLegacyExitClass === false, "Wipe Art MC received the legacy CSS exit class");
    assert(
      wipeResult.disappearMidOpacity === wipeResult.authoredReferenceOpacity,
      `Wipe Art MC opacity was programmatically tweened from authored ${wipeResult.authoredReferenceOpacity} to ${wipeResult.disappearMidOpacity}`
    );
    assert(
      wipeResult.disappearMidScale === wipeResult.authoredReferenceScale,
      `Wipe Art MC scale was programmatically tweened from authored ${wipeResult.authoredReferenceScale} to ${wipeResult.disappearMidScale}`
    );
    assert(wipeResult.disappearFinalInstantClass === true, "Wipe Art MC final visibility command was not marked instant");
    assert(wipeResult.disappearFinalOpacity === "0", `Wipe Art MC final opacity remained in transition at ${wipeResult.disappearFinalOpacity}`);
    assert(wipeResult.disappearFinalScale === "0", `Wipe Art MC final scale remained in transition at ${wipeResult.disappearFinalScale}`);
    assert(
      String(wipeResult.disappearFinalTransitionDuration || "")
        .split(",")
        .every((duration) => Number.parseFloat(duration) === 0),
      `Wipe Art MC retained CSS transition durations: ${wipeResult.disappearFinalTransitionDuration}`
    );
    assert(wipeResult.disappearPostCallbackOpacity === "0", `Wipe Art MC opacity animated after callback to ${wipeResult.disappearPostCallbackOpacity}`);
    assert(wipeResult.disappearPostCallbackScale === "0", `Wipe Art MC scale animated after callback to ${wipeResult.disappearPostCallbackScale}`);
    assert(wipeResult.visibleAfterDisappear === false, "Wipe remained visible after Disappear callback");

    const timerResult = await page.evaluate(async () => {
      const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
      const element = document.createElement("div");
      element.className = "crafting-timer stage-layout-target stage-layout-visual-hidden";
      element.dataset.visualVisible = "false";
      element.style.width = "180px";
      element.style.height = "180px";
      document.body.appendChild(element);
      const widgetArt = window.PartyGameStageWidgetArt.createRenderer({
        document,
        visualAnimation: window.visualAnimation,
        getComposition: (id) => window.artComposition(id)
      });
      const timer = { shown: false, running: false, durationMs: 30000, remainingMs: 30000 };
      let renderResult = null;
      const controller = window.PartyGameStageVisualControllers.createCraftingTimerController({
        element,
        getRenderedActionKey: () => "timer-action",
        getCurrentStageState: () => ({ craftingTimer: timer }),
        renderArt: (context) => {
          renderResult = widgetArt.renderBound(element, {
            compositionId: "crafting-timer-widget",
            textOverrides: () => ({ "timer-value": context.label })
          }, context);
          return renderResult;
        }
      });

      controller.prepareShownForAction({ isShown: true }, { actionKey: "timer-action" });
      const renderer = renderResult?.renderer;
      const gameObject = window.PartyGameGameObject.create({
        id: "crafting-timer-contract-probe",
        target: element,
        isArt: true,
        defaultAnimationState: "Off",
        artRenderer: renderer,
        syncArtRendererOnShow: true,
        visualOptions: {
          hiddenClasses: ["stage-layout-visual-hidden"],
          motionHiddenClasses: ["stage-layout-visual-hidden"],
          exitingClass: "",
          updateClass: "",
          instantClass: "stage-layout-visual-instant",
          layoutHiddenClasses: ["stage-layout-visual-hidden"]
        }
      });
      const appearStartedAt = performance.now();
      const appearCompletion = new Promise((resolve) => gameObject.playVisibility(true, { complete: resolve }));
      await sleep(120);
      const appearMidFrame = renderer?.rootTimelinePlayer?.currentFrame;
      controller.render({ shown: true, running: false, durationMs: 30000, remainingMs: 30000 });
      const appearFrameAfterReconcile = renderer?.rootTimelinePlayer?.currentFrame;
      await Promise.race([
        appearCompletion,
        sleep(1000).then(() => { throw new Error("Timer Appear callback timed out"); })
      ]);
      const appearDuration = performance.now() - appearStartedAt;
      const appearFrame = renderer?.rootTimelinePlayer?.currentFrame;
      const renderedValue = element.querySelector("[data-art-component-id='timer-value']")?.textContent?.trim();

      controller.prepareShownForAction({ isShown: false }, { actionKey: "timer-action" });
      const disappearStartedAt = performance.now();
      const disappearCompletion = new Promise((resolve) => gameObject.playVisibility(false, { complete: resolve }));
      await sleep(120);
      const disappearMidFrame = renderer?.rootTimelinePlayer?.currentFrame;
      controller.render({ shown: false, running: false, durationMs: 30000, remainingMs: 30000 });
      const disappearFrameAfterReconcile = renderer?.rootTimelinePlayer?.currentFrame;
      const disappearCompleted = await Promise.race([
        disappearCompletion.then(() => true),
        sleep(1200).then(() => false)
      ]);

      return {
        appearDuration,
        appearFrame,
        appearFrameAfterReconcile,
        appearMidFrame,
        disappearDuration: performance.now() - disappearStartedAt,
        disappearCompleted,
        disappearFrame: renderer?.rootTimelinePlayer?.currentFrame,
        disappearFrameAfterReconcile,
        disappearMidFrame,
        hostHiddenAfterDisappear: element.classList.contains("stage-layout-visual-hidden"),
        usedLegacyHiddenClass: element.classList.contains("hidden"),
        renderedValue
      };
    });

    assert(timerResult.appearMidFrame > 2 && timerResult.appearMidFrame < 12, `Timer Appear was not mid-animation at frame ${timerResult.appearMidFrame}`);
    assert(timerResult.appearFrameAfterReconcile >= timerResult.appearMidFrame, `timer reconciliation restarted Appear (${JSON.stringify(timerResult)})`);
    assert(timerResult.appearDuration >= 250, `Timer Appear callback fired too early (${Math.round(timerResult.appearDuration)}ms)`);
    assert(timerResult.appearFrame === 12, `Timer Appear callback fired at parent frame ${timerResult.appearFrame}`);
    assert(timerResult.renderedValue === "30", `Timer nested value rendered as ${timerResult.renderedValue || "blank"}`);
    assert(timerResult.disappearMidFrame > 17 && timerResult.disappearMidFrame < 32, `Timer Disappear was not mid-animation at frame ${timerResult.disappearMidFrame}`);
    assert(timerResult.disappearFrameAfterReconcile >= timerResult.disappearMidFrame, "timer reconciliation restarted Disappear");
    assert(timerResult.disappearCompleted, `Timer Disappear callback timed out (${JSON.stringify(timerResult)})`);
    assert(timerResult.disappearDuration >= 400, `Timer Disappear callback fired too early (${Math.round(timerResult.disappearDuration)}ms)`);
    assert(timerResult.disappearFrame === 32, `Timer Disappear callback fired at parent frame ${timerResult.disappearFrame}`);
    assert(timerResult.hostHiddenAfterDisappear, "Timer placed layout host did not finish hidden after authored Disappear");
    assert(timerResult.usedLegacyHiddenClass === false, "Timer lifecycle fell back to the legacy hidden class");
    console.log("Player, answer bubble, crafting timer, and Wipe Widget MC authored lifecycle browser check passed.");
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
