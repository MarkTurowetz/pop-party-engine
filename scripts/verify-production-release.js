"use strict";

function parseArguments(argv) {
  const result = {
    baseUrl: "",
    engineVersion: "",
    releaseRevision: "",
    appVersion: "",
    timeoutMs: 12 * 60 * 1000,
    intervalMs: 10 * 1000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") result.baseUrl = String(argv[++index] || "");
    else if (argument === "--engine-version") result.engineVersion = String(argv[++index] || "");
    else if (argument === "--release-revision") result.releaseRevision = String(argv[++index] || "");
    else if (argument === "--app-version") result.appVersion = String(argv[++index] || "");
    else if (argument === "--timeout-ms") result.timeoutMs = Number(argv[++index] || 0);
    else if (argument === "--interval-ms") result.intervalMs = Number(argv[++index] || 0);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  const url = new URL(result.baseUrl);
  if (url.protocol !== "https:") throw new Error("Production verification requires an HTTPS base URL");
  result.baseUrl = url.toString().replace(/\/$/, "");
  for (const key of ["engineVersion", "releaseRevision", "appVersion"]) {
    if (!result[key]) throw new Error(`Missing required --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 1000) throw new Error("Invalid --timeout-ms");
  if (!Number.isFinite(result.intervalMs) || result.intervalMs < 1) throw new Error("Invalid --interval-ms");
  return result;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readResponse(response, label) {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response;
}

async function probeProduction(options) {
  const fetchImpl = options.fetchImpl || fetch;
  const nonce = options.nonce || Date.now();
  const healthResponse = await readResponse(
    await fetchImpl(`${options.baseUrl}/api/health?releaseProbe=${nonce}`, {
      headers: { "Cache-Control": "no-cache" }
    }),
    "Production health"
  );
  const health = await healthResponse.json();
  const stageResponse = await readResponse(
    await fetchImpl(`${options.baseUrl}/stage?releaseProbe=${nonce}`, {
      headers: { "Cache-Control": "no-cache" }
    }),
    "Production stage"
  );
  const stage = await stageResponse.text();
  const checks = {
    healthy: health?.ok === true,
    gameEngine: health?.game?.engineCompatibility === options.engineVersion,
    runtimeEngine: health?.engine?.version === options.engineVersion,
    browserWorkspaceCheckpoints:
      health?.engine?.capabilities?.browserWorkspaceCheckpoints === true,
    releaseEngine: health?.release?.engineVersion === options.engineVersion,
    releaseRevision: health?.release?.releaseRevision === options.releaseRevision,
    appVersion: stage.includes(`v${options.appVersion}`)
  };
  return Object.freeze({
    ok: Object.values(checks).every(Boolean),
    checks,
    health
  });
}

async function verifyProductionRelease(options) {
  const now = options.now || Date.now;
  const wait = options.wait || sleep;
  const deadline = now() + options.timeoutMs;
  let lastProbe = null;
  let lastError = null;
  while (now() <= deadline) {
    try {
      lastProbe = await probeProduction(options);
      lastError = null;
      if (lastProbe.ok) return lastProbe;
    } catch (error) {
      lastError = error;
    }
    if (now() + options.intervalMs > deadline) break;
    await wait(options.intervalMs);
  }
  const details = lastError
    ? lastError.message
    : JSON.stringify(lastProbe?.checks || {});
  throw new Error(`Production did not reach the coordinated release before timeout: ${details}`);
}

async function main() {
  try {
    const argumentsValue = parseArguments(process.argv.slice(2));
    const result = await verifyProductionRelease(argumentsValue);
    console.log(JSON.stringify({
      ok: true,
      engineVersion: result.health.game.engineCompatibility,
      runtimeEngineVersion: result.health.engine.version,
      releaseRevision: result.health.release.releaseRevision,
      contentRevision: result.health.release.contentRevision
    }, null, 2));
  } catch (error) {
    console.error(`Production release verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseArguments, probeProduction, verifyProductionRelease };
