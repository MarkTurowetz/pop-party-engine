"use strict";

const crypto = require("crypto");

const TOOL_PATHS = new Set([
  "/lab", "/l", "/art", "/a", "/flow", "/f", "/constants", "/const",
  "/host-audio", "/host-audios", "/audio", "/layout", "/layouts",
  "/controller-layout", "/controller-layouts", "/tools", "/tool"
]);
const ADMIN_API_PATHS = new Set([
  "/api/local-draft", "/api/tool-drafts", "/api/game-flow", "/api/game-constants",
  "/api/host-audios", "/api/stage-layouts", "/api/controller-layouts",
  "/api/art-organization", "/api/art-compositions", "/api/art-compositions/cleanup"
]);

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function cookieMap(headerValue) {
  return new Map(String(headerValue || "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [];
    return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
  }));
}

function isLoopback(req) {
  const address = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  return address === "127.0.0.1" || address === "::1";
}

function safeReturnTo(value) {
  const candidate = String(value || "");
  try {
    const url = new URL(candidate, "http://local.invalid");
    return url.origin === "http://local.invalid" && TOOL_PATHS.has(url.pathname.toLowerCase())
      ? `${url.pathname}${url.search}`
      : "/tools";
  } catch (error) {
    return "/tools";
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}

function redirect(res, location, cookies = []) {
  const headers = { Location: location, "Cache-Control": "no-store" };
  if (cookies.length) headers["Set-Cookie"] = cookies;
  res.writeHead(302, headers);
  res.end();
}

function createAdminAuthRuntime(options = {}) {
  const mode = String(options.mode || "legacy-open").toLowerCase();
  if (!["legacy-open", "local", "github"].includes(mode)) throw new Error(`Unsupported admin auth mode: ${mode}`);
  if (mode === "local" && options.isProduction === true) {
    throw new Error("Local administrator authentication cannot run in production");
  }
  const secureCookies = options.secureCookies !== false;
  const sessionCookieName = options.sessionCookieName || "pop_party_admin";
  const sessionMaxAgeMs = Number(options.sessionMaxAgeMs || 8 * 60 * 60 * 1000);
  const pendingMaxAgeMs = Number(options.pendingMaxAgeMs || 10 * 60 * 1000);
  const sessions = new Map();
  const pendingStates = new Map();
  const fetchImpl = options.fetchImpl || fetch;
  const audit = typeof options.audit === "function" ? options.audit : () => {};
  if (mode === "github") {
    for (const key of ["clientId", "clientSecret", "callbackUrl", "allowedUserId"]) {
      if (!String(options[key] || "").trim()) throw new Error(`GitHub admin auth requires ${key}`);
    }
  }

  function sessionCookie(value, maxAgeSeconds) {
    const secure = secureCookies ? "; Secure" : "";
    return `${sessionCookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  }

  function activeSession(req) {
    if (mode === "legacy-open") return { actorId: "legacy-open", csrfToken: "" };
    if (mode === "local" && isLoopback(req)) return { actorId: "local-development", csrfToken: "local-development" };
    const token = cookieMap(req.headers.cookie).get(sessionCookieName);
    const session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return null;
    }
    return session;
  }

  function requirePage(req, res, url) {
    if (activeSession(req)) return true;
    redirect(res, `/auth/github?returnTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
    return false;
  }

  function requireApi(req, res, { mutation = false } = {}) {
    const session = activeSession(req);
    if (!session) {
      audit(req, { operation: "admin-authorize", outcome: "denied", errorCode: "ADMIN_AUTH_REQUIRED" });
      sendJson(res, 401, { ok: false, error: "Administrator authentication required", code: "ADMIN_AUTH_REQUIRED" });
      return false;
    }
    if (mutation && mode !== "legacy-open") {
      const supplied = String(req.headers["x-csrf-token"] || "");
      const expected = String(session.csrfToken || "");
      const matches = supplied.length === expected.length && supplied.length > 0 && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
      if (!matches) {
        audit(req, { actorId: session.actorId, operation: "admin-authorize", outcome: "denied", errorCode: "ADMIN_CSRF_INVALID" });
        sendJson(res, 403, { ok: false, error: "CSRF token is missing or invalid", code: "ADMIN_CSRF_INVALID" });
        return false;
      }
    }
    req.adminActor = Object.freeze({ id: session.actorId });
    if (mutation) audit(req, { actorId: session.actorId, operation: "admin-mutation-authorized", outcome: "allowed" });
    return true;
  }

  function isToolPath(url) {
    const role = String(url.searchParams.get("role") || "").toLowerCase();
    return TOOL_PATHS.has(url.pathname.toLowerCase()) || (url.pathname === "/" && role && role !== "stage" && role !== "controller");
  }

  function isAdminApiRequest(req, url) {
    if (url.pathname === "/api/admin/session") return false;
    if (ADMIN_API_PATHS.has(url.pathname)) return req.method !== "GET" || url.pathname === "/api/local-draft" || url.pathname === "/api/tool-drafts";
    if (/^\/api\/art-(?:assets|compositions)\/[a-z0-9-]+$/i.test(url.pathname)) return req.method === "POST" || req.method === "DELETE";
    if (url.pathname.startsWith("/api/content/")) return true;
    return false;
  }

  function beginGithub(req, res, url) {
    if (mode !== "github") {
      redirect(res, safeReturnTo(url.searchParams.get("returnTo")));
      return;
    }
    const state = randomToken();
    const verifier = randomToken(48);
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    pendingStates.set(state, { verifier, returnTo: safeReturnTo(url.searchParams.get("returnTo")), expiresAt: Date.now() + pendingMaxAgeMs });
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", options.clientId);
    authorizeUrl.searchParams.set("redirect_uri", options.callbackUrl);
    authorizeUrl.searchParams.set("scope", "read:user");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    redirect(res, authorizeUrl.toString());
  }

  async function finishGithub(req, res, url) {
    if (mode !== "github") {
      sendJson(res, 404, { ok: false, error: "GitHub authentication is not configured" });
      return;
    }
    const state = String(url.searchParams.get("state") || "");
    const pending = pendingStates.get(state);
    pendingStates.delete(state);
    if (!pending || pending.expiresAt <= Date.now()) {
      sendJson(res, 400, { ok: false, error: "OAuth state is invalid or expired", code: "OAUTH_STATE_INVALID" });
      return;
    }
    const tokenResponse = await fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code: String(url.searchParams.get("code") || ""),
        redirect_uri: options.callbackUrl,
        code_verifier: pending.verifier
      })
    });
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error("GitHub token exchange failed");
    const userResponse = await fetchImpl("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tokenPayload.access_token}`, "User-Agent": "pop-party-engine" }
    });
    const user = await userResponse.json();
    if (!userResponse.ok || String(user.id) !== String(options.allowedUserId)) {
      audit(req, { operation: "admin-login", outcome: "denied", errorCode: "ADMIN_NOT_ALLOWED" });
      sendJson(res, 403, { ok: false, error: "This GitHub account is not authorized", code: "ADMIN_NOT_ALLOWED" });
      return;
    }
    const sessionToken = randomToken();
    sessions.set(sessionToken, {
      actorId: `github:${user.id}`,
      login: String(user.login || ""),
      csrfToken: randomToken(),
      expiresAt: Date.now() + sessionMaxAgeMs
    });
    audit(req, { actorId: `github:${user.id}`, operation: "admin-login", outcome: "success" });
    redirect(res, pending.returnTo, [sessionCookie(sessionToken, Math.floor(sessionMaxAgeMs / 1000))]);
  }

  function logout(req, res) {
    const token = cookieMap(req.headers.cookie).get(sessionCookieName);
    const session = token ? sessions.get(token) : null;
    if (token) sessions.delete(token);
    audit(req, { actorId: session?.actorId || "anonymous", operation: "admin-logout", outcome: "success" });
    redirect(res, "/tools", [sessionCookie("", 0)]);
  }

  function tryHandle(req, res, url) {
    if (req.method === "GET" && url.pathname === "/auth/github") {
      beginGithub(req, res, url);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/auth/github/callback") {
      finishGithub(req, res, url).catch((error) => sendJson(res, 502, { ok: false, error: error.message, code: "OAUTH_FAILED" }));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/auth/logout") {
      if (requireApi(req, res, { mutation: true })) logout(req, res);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/admin/session") {
      const session = activeSession(req);
      sendJson(res, session ? 200 : 401, session
        ? { ok: true, mode, actorId: session.actorId, csrfToken: session.csrfToken }
        : { ok: false, mode, error: "Administrator authentication required", code: "ADMIN_AUTH_REQUIRED" });
      return true;
    }
    return false;
  }

  function publicStatus() {
    return Object.freeze({ mode, protected: mode !== "legacy-open" });
  }

  return Object.freeze({ isAdminApiRequest, isToolPath, publicStatus, requireApi, requirePage, tryHandle });
}

module.exports = { ADMIN_API_PATHS, TOOL_PATHS, cookieMap, createAdminAuthRuntime, isLoopback, safeReturnTo };
