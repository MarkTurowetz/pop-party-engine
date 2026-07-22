"use strict";

const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function assertLegacyBackgroundRemoved() {
  for (const relativePath of [
    "client/styles/legacy-shell.css",
    "client/styles/legacy/base.css",
    "client/styles/legacy/tools.css",
    "client/styles/legacy/stage-runtime.css"
  ]) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert(!source.includes(".stage-board::before"), `${relativePath} still creates the left legacy fan`);
    assert(!source.includes(".stage-board::after"), `${relativePath} still creates the right legacy fan`);
    assert(!source.includes("@keyframes spin"), `${relativePath} still owns legacy background rotation`);
    assert(!source.includes("radial-gradient(circle at 15% 18%"), `${relativePath} still paints the legacy background circles`);
    assert(!source.includes("linear-gradient(135deg, #24115f"), `${relativePath} still paints the legacy gradient plane`);
  }
}

async function main() {
  assertLegacyBackgroundRemoved();
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
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    await waitForServer(port, child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://${host}:${port}/stage`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const hostElement = document.querySelector("[data-stage-layout-art-composition-id='stage-background']");
      return Boolean(
        hostElement?.querySelector("[data-art-component-path$='/fan-left/fan-art'][data-art-intrinsic-dimensions='true']")
        && hostElement?.querySelector("[data-art-component-path$='/fan-right/fan-art'][data-art-intrinsic-dimensions='true']")
        && hostElement?.querySelector("[data-art-component-id='gradient-plane']")
      );
    });

    const initial = await page.evaluate(() => {
      const board = document.querySelector(".stage-board");
      const background = document.querySelector("[data-stage-layout-art-composition-id='stage-background']");
      const left = background.querySelector("[data-art-component-path$='/fan-left/fan-art'][data-art-intrinsic-dimensions='true']");
      const right = background.querySelector("[data-art-component-path$='/fan-right/fan-art'][data-art-intrinsic-dimensions='true']");
      const rotation = (element) => Number.parseFloat(element.style.getPropertyValue("--component-rotation")) || 0;
      return {
        backgroundImage: getComputedStyle(board).backgroundImage,
        beforeAnimation: getComputedStyle(board, "::before").animationName,
        afterAnimation: getComputedStyle(board, "::after").animationName,
        backgroundZIndex: getComputedStyle(background).zIndex,
        backgroundPointerEvents: getComputedStyle(background).pointerEvents,
        backgroundClasses: background.className,
        gradientCount: background.querySelectorAll("[data-art-component-id='gradient-plane']").length,
        yellowCount: background.querySelectorAll("[data-art-component-id='yellow-orb']").length,
        cyanCount: background.querySelectorAll("[data-art-component-id='cyan-orb']").length,
        pinkCount: background.querySelectorAll("[data-art-component-id='pink-orb']").length,
        leftRotation: rotation(left),
        rightRotation: rotation(right)
      };
    });
    await page.waitForTimeout(300);
    const later = await page.evaluate(() => {
      const background = document.querySelector("[data-stage-layout-art-composition-id='stage-background']");
      const left = background.querySelector("[data-art-component-path$='/fan-left/fan-art'][data-art-intrinsic-dimensions='true']");
      const right = background.querySelector("[data-art-component-path$='/fan-right/fan-art'][data-art-intrinsic-dimensions='true']");
      const rotation = (element) => Number.parseFloat(element.style.getPropertyValue("--component-rotation")) || 0;
      return { leftRotation: rotation(left), rightRotation: rotation(right) };
    });

    assert(initial.backgroundImage === "none", `stage board still paints ${initial.backgroundImage}`);
    assert(initial.beforeAnimation === "none" && initial.afterAnimation === "none", "stage board pseudo-elements still animate legacy fans");
    assert(initial.backgroundZIndex === "-1", `background layer z-index is ${initial.backgroundZIndex}`);
    assert(initial.backgroundPointerEvents === "none", "background layer can intercept stage input");
    assert(initial.backgroundClasses.includes("stage-background-layout-target"), "background host lacks the authored background layer marker");
    assert(initial.gradientCount >= 2, "nested background gradient plane did not render");
    assert(
      initial.yellowCount >= 1 && initial.cyanCount >= 1 && initial.pinkCount >= 1,
      `nested background circles did not render (yellow ${initial.yellowCount}, cyan ${initial.cyanCount}, pink ${initial.pinkCount})`
    );
    assert(later.leftRotation > initial.leftRotation, `left fan did not rotate clockwise (${initial.leftRotation} -> ${later.leftRotation})`);
    assert(later.rightRotation < initial.rightRotation, `right fan did not rotate counterclockwise (${initial.rightRotation} -> ${later.rightRotation})`);
    await page.screenshot({ path: "/tmp/party-game-stage-background.png", fullPage: true });
    console.log("Stage background authority checks passed.");
  } finally {
    await browser?.close();
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

main().catch((error) => {
  console.error("Stage background authority checks failed:");
  console.error(`- ${error.message}`);
  process.exitCode = 1;
});
