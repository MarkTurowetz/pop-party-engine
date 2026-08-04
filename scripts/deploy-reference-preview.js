"use strict";

const { triggerRenderDeploy } = require("./trigger-render-deploy");

function httpsBaseUrl(value, label) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error(`${label} requires an HTTPS URL`);
  return url.toString().replace(/\/$/, "");
}

function exactCommit(value) {
  const commit = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("Preview deployment requires an exact 40-character commit SHA");
  }
  return commit;
}

function exactEngineVersion(value) {
  const version = String(value || "").trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Preview deployment requires an exact engine version");
  }
  return version;
}

function positiveNumber(value, label, minimum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) throw new Error(`Invalid ${label}`);
  return number;
}

function parseArguments(argv) {
  const result = {
    baseUrl: "",
    releaseAuthorityUrl: "",
    engineVersion: "",
    commit: "",
    releaseRevision: "",
    timeoutMs: 8 * 60 * 1000,
    authorityTimeoutMs: 2 * 60 * 1000,
    intervalMs: 5 * 1000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") result.baseUrl = String(argv[++index] || "");
    else if (argument === "--release-authority-url") result.releaseAuthorityUrl = String(argv[++index] || "");
    else if (argument === "--engine-version") result.engineVersion = String(argv[++index] || "");
    else if (argument === "--commit") result.commit = String(argv[++index] || "");
    else if (argument === "--release-revision") result.releaseRevision = String(argv[++index] || "");
    else if (argument === "--timeout-ms") result.timeoutMs = Number(argv[++index] || 0);
    else if (argument === "--authority-timeout-ms") result.authorityTimeoutMs = Number(argv[++index] || 0);
    else if (argument === "--interval-ms") result.intervalMs = Number(argv[++index] || 0);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  result.baseUrl = httpsBaseUrl(result.baseUrl, "Preview deployment");
  result.releaseAuthorityUrl = httpsBaseUrl(result.releaseAuthorityUrl, "Release authority");
  result.engineVersion = exactEngineVersion(result.engineVersion);
  result.commit = exactCommit(result.commit);
  if (result.releaseRevision && !/^[0-9a-f]{64}$/i.test(result.releaseRevision)) {
    throw new Error("Preview deployment requires an exact release revision");
  }
  result.timeoutMs = positiveNumber(result.timeoutMs, "--timeout-ms", 1000);
  result.authorityTimeoutMs = positiveNumber(result.authorityTimeoutMs, "--authority-timeout-ms", 1000);
  result.intervalMs = positiveNumber(result.intervalMs, "--interval-ms", 1);
  return result;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchHealth(baseUrl, fetchImpl, nonce) {
  const response = await fetchImpl(`${baseUrl}/api/health?previewProbe=${nonce}`, {
    headers: { "Cache-Control": "no-cache" }
  });
  if (!response.ok) throw new Error(`Health probe returned HTTP ${response.status}`);
  const health = await response.json();
  if (!health || typeof health !== "object") throw new Error("Health probe did not return JSON");
  return health;
}

async function waitForHealth(options) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const wait = options.wait || sleep;
  const deadline = now() + options.timeoutMs;
  let lastError = null;
  while (now() <= deadline) {
    try {
      return await fetchHealth(options.baseUrl, fetchImpl, now());
    } catch (error) {
      lastError = error;
    }
    if (now() + options.intervalMs > deadline) break;
    await wait(options.intervalMs);
  }
  throw new Error(`Health authority did not become available: ${lastError?.message || "unknown error"}`);
}

function previewChecks(health, options) {
  const servedCommit = String(health?.application?.commit || "").toLowerCase();
  const checks = {
    healthy: health?.ok === true,
    channel: health?.application?.channel === "preview",
    commit: servedCommit.length >= 7 && options.commit.startsWith(servedCommit),
    gameEngine: health?.game?.engineCompatibility === options.engineVersion,
    runtimeEngine: health?.engine?.version === options.engineVersion,
    releaseEngine: health?.release?.engineVersion === options.engineVersion
  };
  if (options.releaseRevision) {
    checks.releaseRevision = health?.release?.releaseRevision === options.releaseRevision;
  }
  return Object.freeze(checks);
}

async function verifyPreviewDeployment(options) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const wait = options.wait || sleep;
  const deadline = now() + options.timeoutMs;
  let lastChecks = null;
  let lastError = null;
  while (now() <= deadline) {
    try {
      const health = await fetchHealth(options.baseUrl, fetchImpl, now());
      lastChecks = previewChecks(health, options);
      lastError = null;
      if (Object.values(lastChecks).every(Boolean)) {
        return Object.freeze({ ok: true, checks: lastChecks, health });
      }
    } catch (error) {
      lastError = error;
    }
    if (now() + options.intervalMs > deadline) break;
    await wait(options.intervalMs);
  }
  const details = lastError ? lastError.message : JSON.stringify(lastChecks || {});
  throw new Error(`Preview did not reach the requested commit before timeout: ${details}`);
}

async function deployReferencePreview(options) {
  const fetchImpl = options.fetchImpl || fetch;
  if (!options.releaseRevision) {
    const authority = await waitForHealth({
      baseUrl: options.releaseAuthorityUrl,
      timeoutMs: options.authorityTimeoutMs,
      intervalMs: options.intervalMs,
      fetchImpl,
      now: options.now,
      wait: options.wait
    });
    const activeEngineVersion = String(authority?.release?.engineVersion || "");
    if (activeEngineVersion !== options.engineVersion) {
      return Object.freeze({
        ok: true,
        deployed: false,
        reason: "release-coordinate-pending",
        activeEngineVersion,
        requestedEngineVersion: options.engineVersion
      });
    }
  }
  const trigger = await triggerRenderDeploy({
    hookUrl: options.hookUrl,
    commit: options.commit,
    fetchImpl
  });
  const verification = await verifyPreviewDeployment({
    baseUrl: options.baseUrl,
    engineVersion: options.engineVersion,
    commit: options.commit,
    releaseRevision: options.releaseRevision,
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs,
    fetchImpl,
    now: options.now,
    wait: options.wait
  });
  return Object.freeze({
    ok: true,
    deployed: true,
    deployId: trigger.deployId,
    application: verification.health.application,
    release: verification.health.release
  });
}

async function main() {
  try {
    const argumentsValue = parseArguments(process.argv.slice(2));
    const result = await deployReferencePreview({
      ...argumentsValue,
      hookUrl: process.env.RENDER_PREVIEW_DEPLOY_HOOK_URL
    });
    if (result.deployed) {
      console.log(
        `Preview ${result.application.commit} is live at ${argumentsValue.baseUrl}`
      );
    } else {
      console.log(
        `Preview deployment deferred until release coordinates move from `
        + `${result.activeEngineVersion || "unknown"} to ${result.requestedEngineVersion}.`
      );
    }
  } catch (error) {
    console.error(`Preview deployment failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  deployReferencePreview,
  exactCommit,
  exactEngineVersion,
  fetchHealth,
  parseArguments,
  previewChecks,
  verifyPreviewDeployment,
  waitForHealth
};
