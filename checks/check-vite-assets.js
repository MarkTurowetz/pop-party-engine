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

function viteAssetPathFromManifest() {
  assert(fs.existsSync(manifestFile), "Vite manifest is missing; run npm run build:assets first");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const assetFile = Object.values(manifest).find((entry) => typeof entry?.file === "string")?.file || "";
  assert(assetFile.startsWith("assets/"), "Vite manifest did not include an assets/* entry");
  return `/${assetFile}`;
}

async function main() {
  const assetPath = viteAssetPathFromManifest();
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

    const asset = await request({ port, pathname: assetPath });
    assert(asset.statusCode === 200, `${assetPath} returned ${asset.statusCode}`);
    assert(String(asset.headers["content-type"] || "").includes("javascript"), `${assetPath} did not return JavaScript`);

    const traversal = await request({ port, pathname: "/assets/%252e%252e/server.js" });
    assert(traversal.statusCode === 404, "Build asset route allowed path traversal");

    console.log("Vite build asset smoke checks passed.");
  } catch (error) {
    console.error("Vite build asset smoke checks failed:");
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
  console.error("Vite build asset smoke checks failed:");
  console.error(`- ${error.message}`);
  process.exit(1);
});
