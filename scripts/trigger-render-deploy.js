"use strict";

function exactCommit(value) {
  const commit = String(value || "").trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("Render deployment requires an exact 40-character commit SHA");
  return commit;
}

function deployHookUrl(value, commit) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.hostname !== "api.render.com") {
    throw new Error("RENDER_DEPLOY_HOOK_URL must be an HTTPS api.render.com deploy hook");
  }
  if (!url.searchParams.get("key")) throw new Error("Render deploy hook is missing its secret key");
  url.searchParams.set("ref", exactCommit(commit));
  return url;
}

async function triggerRenderDeploy(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const url = deployHookUrl(options.hookUrl, options.commit);
  const response = await fetchImpl(url, { method: "POST", redirect: "error" });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.message || `Render deploy hook failed with status ${response.status}`);
  }
  return Object.freeze({
    accepted: true,
    status: response.status,
    deployId: String(payload?.deploy?.id || payload?.id || "")
  });
}

async function main() {
  try {
    const result = await triggerRenderDeploy({
      hookUrl: process.env.RENDER_DEPLOY_HOOK_URL,
      commit: process.env.GITHUB_SHA
    });
    console.log(`Render accepted deployment${result.deployId ? ` ${result.deployId}` : ""}.`);
  } catch (error) {
    console.error(`Render deployment trigger failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { deployHookUrl, exactCommit, triggerRenderDeploy };
