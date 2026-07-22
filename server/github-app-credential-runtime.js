"use strict";

const crypto = require("crypto");

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createGithubAppCredentialRuntime(options = {}) {
  const appId = String(options.appId || "").trim();
  const installationId = String(options.installationId || "").trim();
  const privateKey = String(options.privateKey || "").replace(/\\n/g, "\n").trim();
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  if (!/^\d+$/.test(appId)) throw new Error("GitHub App id is required");
  if (!/^\d+$/.test(installationId)) throw new Error("GitHub App installation id is required");
  if (!privateKey.includes("PRIVATE KEY")) throw new Error("GitHub App private key is required");
  let cached = null;
  let inFlight = null;

  function appJwt() {
    const nowSeconds = Math.floor(now() / 1000);
    const encodedHeader = base64UrlJson({ alg: "RS256", typ: "JWT" });
    const encodedPayload = base64UrlJson({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId });
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
    return `${signingInput}.${signature}`;
  }

  async function requestInstallationToken() {
    const response = await fetchImpl(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt()}`,
        "User-Agent": "pop-party-engine",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      throw new Error(`GitHub App token response was invalid JSON (${response.status})`);
    }
    if (!response.ok || !payload.token || !payload.expires_at) {
      const error = new Error(payload.message || `GitHub App token request failed with ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const expiresAt = Date.parse(payload.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) throw new Error("GitHub App returned an expired installation token");
    cached = { token: String(payload.token), expiresAt };
    return cached.token;
  }

  async function credential() {
    if (cached && cached.expiresAt - now() > 60_000) return cached.token;
    if (!inFlight) {
      inFlight = requestInstallationToken().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  function clear() {
    cached = null;
  }

  return Object.freeze({ appJwt, clear, credential });
}

module.exports = { base64UrlJson, createGithubAppCredentialRuntime };
