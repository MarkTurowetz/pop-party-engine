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
      joinButtonDisplay: getComputedStyle(document.querySelector("#joinButton")).display,
      hasIntroState: Boolean(document.querySelector("#controllerIntroState")),
      hasPresentHiText: document.body.textContent.includes("Present HI THERE")
    }));
    await staticContext.close();

    assert(staticState.stageCodeDisplay === "none", "native stage-code control can flash before layout mount");
    assert(staticState.playerNameDisplay === "none", "native player-name control can flash before layout mount");
    assert(staticState.joinButtonDisplay === "none", "native Join button can flash before layout mount");
    assert(!staticState.hasIntroState, "legacy controller intro state still exists");
    assert(!staticState.hasPresentHiText, "legacy Present HI THERE art still exists");

    const page = await browser.newPage();
    await page.goto(`http://${host}:${port}/controller`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#stageCodeField")?.classList.contains("controller-widget-art-host"));
    const mountedState = await page.evaluate(async () => ({
      stageCodeHidden: document.querySelector("#stageCodeField").classList.contains("controller-layout-hidden"),
      stageCodeHasArt: Boolean(document.querySelector("#stageCodeField > .controller-widget-art-layer")),
      joinButtonHasArt: document.querySelector("#joinButton").classList.contains("has-controller-widget-art"),
      presentHiStatus: (await fetch("/api/present-hi", { method: "POST" })).status
    }));

    assert(!mountedState.stageCodeHidden, "authored Join layout did not activate the stage-code host");
    assert(mountedState.stageCodeHasArt, "authored Join layout did not mount stage-code art");
    assert(mountedState.joinButtonHasArt, "authored Join layout did not mount Join-button art");
    assert(mountedState.presentHiStatus === 405, `removed /api/present-hi endpoint returned ${mountedState.presentHiStatus}`);

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
