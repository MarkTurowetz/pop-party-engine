"use strict";

const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

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

function request({ port, pathname, parseJson = false }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host,
      port,
      method: "GET",
      path: pathname,
      timeout: 5000
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (parseJson) {
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body, json: JSON.parse(body) });
          } catch (error) {
            reject(new Error(`${pathname} did not return valid JSON: ${error.message}`));
          }
          return;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`${pathname} timed out`)));
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer(port, child) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 10000) {
    if (child.exitCode !== null) {
      throw new Error(`server.js exited before smoke tests could run with code ${child.exitCode}`);
    }
    try {
      const response = await request({ port, pathname: "/api/health", parseJson: true });
      if (response.statusCode === 200 && response.json?.ok === true) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server.js did not become ready: ${lastError?.message || "unknown error"}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertShell(response, label, expectedText, { expectedScripts = [], forbiddenScripts = [], expectedStyles = [], forbiddenStyles = [] } = {}) {
  assert(response.statusCode === 200, `${label} returned ${response.statusCode}`);
  assert(String(response.headers["content-type"] || "").includes("text/html"), `${label} did not return HTML`);
  assert(response.body.includes(expectedText), `${label} shell did not include ${expectedText}`);
  assert(response.body.includes("/client/app/legacy/app-shell.js"), `${label} shell is missing app shell script`);
  expectedStyles.forEach((stylesheet) => {
    assert(response.body.includes(stylesheet), `${label} shell is missing ${stylesheet}`);
  });
  forbiddenStyles.forEach((stylesheet) => {
    assert(!response.body.includes(stylesheet), `${label} shell should not include ${stylesheet}`);
  });
  expectedScripts.forEach((script) => {
    assert(response.body.includes(script), `${label} shell is missing ${script}`);
  });
  forbiddenScripts.forEach((script) => {
    assert(!response.body.includes(script), `${label} shell should not include ${script}`);
  });
}

function assertJsonOk(response, label) {
  assert(response.statusCode === 200, `${label} returned ${response.statusCode}`);
  assert(response.json?.ok === true, `${label} did not return ok: true`);
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
      GITHUB_TOKEN: "",
      // These assertions validate the classic (non-Vite) role-shell structure, which
      // is now opt-out. check-vite-assets covers the Vite-default shell.
      PARTY_GAME_USE_VITE_ENTRIES: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForServer(port, child);

    const health = await request({ port, pathname: "/api/health", parseJson: true });
    assertJsonOk(health, "/api/health");
    assert(Number.isInteger(health.json.rooms), "/api/health did not include a room count");

    assertShell(await request({ port, pathname: "/stage" }), "/stage", "stageScreen", {
      expectedStyles: ["/client/styles/legacy/base.css", "/client/styles/legacy/stage-runtime.css"],
      forbiddenStyles: ["/client/styles/legacy/controller-runtime.css", "/client/styles/legacy/tools.css"],
      expectedScripts: ["/shared/color-utils.js"],
      forbiddenScripts: ["/client/controller.js", "/client/flow-tool.js", "/client/stage-runtime.js"]
    });
    assertShell(await request({ port, pathname: "/controller" }), "/controller", "controllerScreen", {
      expectedStyles: ["/client/styles/legacy/base.css", "/client/styles/legacy/stage-runtime.css", "/client/styles/legacy/controller-runtime.css"],
      forbiddenStyles: ["/client/styles/legacy/tools.css"],
      expectedScripts: ["/shared/color-utils.js"],
      forbiddenScripts: ["/client/stage-runtime.js", "/client/flow-tool.js", "/client/controller.js", "/client/layout-runtime.js"]
    });
    assertShell(await request({ port, pathname: "/tools" }), "main tool shell", "toolDashboardBar", {
      expectedStyles: ["/client/styles/legacy/base.css", "/client/styles/legacy/stage-runtime.css", "/client/styles/legacy/controller-runtime.css", "/client/styles/legacy/tools.css"],
      expectedScripts: ["/shared/color-utils.js"],
      forbiddenScripts: ["/client/flow-tool.js", "/client/controller.js", "/client/stage-runtime.js"]
    });
    assertShell(await request({ port, pathname: "/flow" }), "Flow Tool shell", "flowScreen", {
      expectedStyles: ["/client/styles/legacy/base.css", "/client/styles/legacy/tools.css"],
      forbiddenStyles: ["/client/styles/legacy/stage-runtime.css", "/client/styles/legacy/controller-runtime.css"],
      expectedScripts: ["/shared/color-utils.js"],
      forbiddenScripts: [
        "/client/stage-runtime.js",
        "/client/controller.js",
        "/client/flow-tool.js",
        "/client/host-audio-tool.js",
        "/client/constants-tool.js"
      ]
    });

    const gameFlow = await request({ port, pathname: "/api/game-flow", parseJson: true });
    assertJsonOk(gameFlow, "/api/game-flow");
    assert(Array.isArray(gameFlow.json.flow?.states), "/api/game-flow did not include flow.states");
    assert(Array.isArray(gameFlow.json.runtimeFlow?.states), "/api/game-flow did not include runtimeFlow.states");

    const stageLayouts = await request({ port, pathname: "/api/stage-layouts", parseJson: true });
    assertJsonOk(stageLayouts, "/api/stage-layouts");
    assert(stageLayouts.json.layouts?.global && Array.isArray(stageLayouts.json.layouts?.states), "/api/stage-layouts did not include layout data");

    const controllerLayouts = await request({ port, pathname: "/api/controller-layouts", parseJson: true });
    assertJsonOk(controllerLayouts, "/api/controller-layouts");
    assert(controllerLayouts.json.layouts?.global && Array.isArray(controllerLayouts.json.layouts?.states), "/api/controller-layouts did not include layout data");

    const artAssets = await request({ port, pathname: "/api/art-assets", parseJson: true });
    assertJsonOk(artAssets, "/api/art-assets");
    assert(Array.isArray(artAssets.json.assets), "/api/art-assets did not include assets");
    assert(Array.isArray(artAssets.json.compositions), "/api/art-assets did not include compositions");

    const constants = await request({ port, pathname: "/api/game-constants", parseJson: true });
    assertJsonOk(constants, "/api/game-constants");
    assert(constants.json.constants && typeof constants.json.constants === "object", "/api/game-constants did not include constants");

    const hostAudios = await request({ port, pathname: "/api/host-audios", parseJson: true });
    assertJsonOk(hostAudios, "/api/host-audios");
    assert(Array.isArray(hostAudios.json.hostAudios?.hostAudios), "/api/host-audios did not include hostAudios");

    console.log("Route and tool-data smoke checks passed.");
  } catch (error) {
    console.error("Route and tool-data smoke checks failed:");
    console.error(`- ${error.message}`);
    if (stdout.trim()) console.error(`\nserver stdout:\n${stdout.trim()}`);
    if (stderr.trim()) console.error(`\nserver stderr:\n${stderr.trim()}`);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

main().catch((error) => {
  console.error("Route and tool-data smoke checks failed:");
  console.error(`- ${error.message}`);
  process.exit(1);
});
