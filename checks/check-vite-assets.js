"use strict";

const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const manifestFile = path.join(repoRoot, "dist", "client", ".vite", "manifest.json");

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

function request({ port, pathname }) {
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
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
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
      throw new Error(`server.js exited before Vite asset checks could run with code ${child.exitCode}`);
    }
    try {
      const response = await request({ port, pathname: "/api/health" });
      if (response.statusCode === 200) return;
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

function assertIncludes(body, fragment, label) {
  assert(body.includes(fragment), `${label} did not include ${fragment}`);
}

function assertExcludes(body, fragment, label) {
  assert(!body.includes(fragment), `${label} unexpectedly included ${fragment}`);
}

function viteAssetPathFromManifest() {
  assert(fs.existsSync(manifestFile), "Vite manifest is missing; run npm run build:assets first");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const assetFile = Object.values(manifest).find((entry) => typeof entry?.file === "string")?.file || "";
  assert(assetFile.startsWith("assets/"), "Vite manifest did not include an assets/* entry");
  return `/${assetFile}`;
}

function viteEntryPathFromManifest(entryKey) {
  assert(fs.existsSync(manifestFile), "Vite manifest is missing; run npm run build:assets first");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const assetFile = manifest?.[entryKey]?.file || "";
  assert(assetFile.startsWith("assets/"), `Vite manifest did not include ${entryKey}`);
  return `/${assetFile}`;
}

async function withServer(extraEnv, callback) {
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
      ...extraEnv
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
    await callback(port);
  } catch (error) {
    error.serverStdout = stdout.trim();
    error.serverStderr = stderr.trim();
    throw error;
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function main() {
  const assetPath = viteAssetPathFromManifest();
  const stageEntry = viteEntryPathFromManifest("client/app/entries/stage.ts");
  const controllerEntry = viteEntryPathFromManifest("client/app/entries/controller.ts");
  const flowEntry = viteEntryPathFromManifest("client/app/entries/flow-tool.tsx");
  const toolsEntry = viteEntryPathFromManifest("client/app/entries/tools.tsx");

  try {
    await withServer({}, async (port) => {
      const asset = await request({ port, pathname: assetPath });
      assert(asset.statusCode === 200, `${assetPath} returned ${asset.statusCode}`);
      assert(String(asset.headers["content-type"] || "").includes("javascript"), `${assetPath} did not return JavaScript`);

      const traversal = await request({ port, pathname: "/assets/%252e%252e/server.js" });
      assert(traversal.statusCode === 404, "Build asset route allowed path traversal");

      const viteStageShell = await request({ port, pathname: "/stage?vite=1" });
      assert(viteStageShell.statusCode === 200, `/stage?vite=1 returned ${viteStageShell.statusCode}`);
      assert(viteStageShell.body.includes(`type="module" src="${stageEntry}"`), "/stage?vite=1 did not include the built stage entry");
      assert(!viteStageShell.body.includes("<script src=\"/client/stage-runtime.js\"></script>"), "/stage?vite=1 included classic stage scripts in the shell");
      assertIncludes(viteStageShell.body, "id=\"stageScreen\"", "/stage?vite=1");
      assertExcludes(viteStageShell.body, "id=\"controllerScreen\"", "/stage?vite=1");
      assertExcludes(viteStageShell.body, "id=\"flowScreen\"", "/stage?vite=1");
      assertExcludes(viteStageShell.body, "id=\"toolDashboardBar\"", "/stage?vite=1");

      const viteControllerShell = await request({ port, pathname: "/controller?vite=1" });
      assert(viteControllerShell.statusCode === 200, `/controller?vite=1 returned ${viteControllerShell.statusCode}`);
      assert(viteControllerShell.body.includes(`type="module" src="${controllerEntry}"`), "/controller?vite=1 did not include the built controller entry");
      assert(!viteControllerShell.body.includes("<script src=\"/client/controller.js\"></script>"), "/controller?vite=1 included classic controller scripts in the shell");
      assertIncludes(viteControllerShell.body, "id=\"controllerScreen\"", "/controller?vite=1");
      assertExcludes(viteControllerShell.body, "id=\"stageScreen\"", "/controller?vite=1");
      assertExcludes(viteControllerShell.body, "id=\"flowScreen\"", "/controller?vite=1");
      assertExcludes(viteControllerShell.body, "id=\"toolDashboardBar\"", "/controller?vite=1");

      const viteFlowShell = await request({ port, pathname: "/flow?vite=1" });
      assert(viteFlowShell.statusCode === 200, `/flow?vite=1 returned ${viteFlowShell.statusCode}`);
      assert(viteFlowShell.body.includes(`type="module" src="${flowEntry}"`), "/flow?vite=1 did not include the built Flow Tool entry");
      assert(!viteFlowShell.body.includes("<script src=\"/client/flow-tool.js\"></script>"), "/flow?vite=1 included classic Flow Tool scripts in the shell");
      assertIncludes(viteFlowShell.body, "id=\"flowScreen\"", "/flow?vite=1");
      assertExcludes(viteFlowShell.body, "id=\"stageScreen\"", "/flow?vite=1");
      assertExcludes(viteFlowShell.body, "id=\"controllerScreen\"", "/flow?vite=1");
      assertExcludes(viteFlowShell.body, "id=\"toolDashboardBar\"", "/flow?vite=1");

      const viteToolsShell = await request({ port, pathname: "/tools?vite=1" });
      assert(viteToolsShell.statusCode === 200, `/tools?vite=1 returned ${viteToolsShell.statusCode}`);
      assert(viteToolsShell.body.includes(`type="module" src="${toolsEntry}"`), "/tools?vite=1 did not include the built tools entry");
      assert(!viteToolsShell.body.includes("<script src=\"/client/tool-dashboard.js\"></script>"), "/tools?vite=1 included classic dashboard scripts in the shell");
      assertIncludes(viteToolsShell.body, "id=\"toolDashboardBar\"", "/tools?vite=1");
      assertIncludes(viteToolsShell.body, "id=\"unsafeChangesModal\"", "/tools?vite=1");
      assertIncludes(viteToolsShell.body, "id=\"artScreen\"", "/tools?vite=1");
      assertIncludes(viteToolsShell.body, "id=\"flowScreen\"", "/tools?vite=1");
      assertIncludes(viteToolsShell.body, "id=\"constantsScreen\"", "/tools?vite=1");
      assertIncludes(viteToolsShell.body, "id=\"hostAudioScreen\"", "/tools?vite=1");
      assertIncludes(viteToolsShell.body, "id=\"layoutScreen\"", "/tools?vite=1");
      assertExcludes(viteToolsShell.body, "id=\"stageScreen\"", "/tools?vite=1");
      assertExcludes(viteToolsShell.body, "id=\"controllerScreen\"", "/tools?vite=1");

      const legacyStageShell = await request({ port, pathname: "/stage" });
      assert(legacyStageShell.statusCode === 200, `/stage returned ${legacyStageShell.statusCode}`);
      assert(legacyStageShell.body.includes("<script src=\"/client/stage-runtime.js\"></script>"), "/stage did not preserve classic stage scripts by default");
      assertIncludes(legacyStageShell.body, "id=\"stageScreen\"", "/stage");
      assertIncludes(legacyStageShell.body, "id=\"controllerScreen\"", "/stage");
      assertIncludes(legacyStageShell.body, "id=\"flowScreen\"", "/stage");
    });

    await withServer({ PARTY_GAME_USE_VITE_ENTRIES: "1" }, async (port) => {
      const stageShell = await request({ port, pathname: "/stage" });
      assert(stageShell.statusCode === 200, `/stage with PARTY_GAME_USE_VITE_ENTRIES=1 returned ${stageShell.statusCode}`);
      assert(stageShell.body.includes(`type="module" src="${stageEntry}"`), "PARTY_GAME_USE_VITE_ENTRIES=1 did not default /stage to the built entry");
      assert(!stageShell.body.includes("<script src=\"/client/stage-runtime.js\"></script>"), "PARTY_GAME_USE_VITE_ENTRIES=1 included classic stage scripts in the shell");
      assertIncludes(stageShell.body, "id=\"stageScreen\"", "/stage with PARTY_GAME_USE_VITE_ENTRIES=1");
      assertExcludes(stageShell.body, "id=\"controllerScreen\"", "/stage with PARTY_GAME_USE_VITE_ENTRIES=1");
      assertExcludes(stageShell.body, "id=\"flowScreen\"", "/stage with PARTY_GAME_USE_VITE_ENTRIES=1");
    });

    console.log("Vite build asset smoke checks passed.");
  } catch (error) {
    console.error("Vite build asset smoke checks failed:");
    console.error(`- ${error.message}`);
    if (error.serverStdout) console.error(`\nserver stdout:\n${error.serverStdout}`);
    if (error.serverStderr) console.error(`\nserver stderr:\n${error.serverStderr}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Vite build asset smoke checks failed:");
  console.error(`- ${error.message}`);
  process.exit(1);
});
