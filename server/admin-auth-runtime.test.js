import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createAdminAuthRuntime, safeReturnTo } = require("./admin-auth-runtime");

function request({ method = "GET", cookie = "", remoteAddress = "127.0.0.1", headers = {} } = {}) {
  return { method, headers: { cookie, ...headers }, socket: { remoteAddress } };
}

function response() {
  let resolveEnd;
  const ended = new Promise((resolve) => { resolveEnd = resolve; });
  return {
    status: 0,
    headers: {},
    body: "",
    ended,
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = String(body || "");
      resolveEnd();
    }
  };
}

function githubRuntime(fetchImpl) {
  return createAdminAuthRuntime({
    mode: "github",
    clientId: "client",
    clientSecret: "secret",
    callbackUrl: "https://game.test/auth/github/callback",
    allowedUserId: "42",
    secureCookies: true,
    fetchImpl
  });
}

describe("admin auth runtime", () => {
  it("sanitizes OAuth return paths to known tool surfaces", () => {
    expect(safeReturnTo("/art?tab=stage")).toBe("/art?tab=stage");
    expect(safeReturnTo("https://evil.test/art")).toBe("/tools");
    expect(safeReturnTo("/stage")).toBe("/tools");
  });

  it("permits the local bypass only from loopback", () => {
    const runtime = createAdminAuthRuntime({ mode: "local", secureCookies: false });
    expect(runtime.requireApi(request({ headers: { "x-csrf-token": "local-development" } }), response(), { mutation: true })).toBe(true);
    const denied = response();
    expect(runtime.requireApi(request({ remoteAddress: "10.0.0.5" }), denied, { mutation: true })).toBe(false);
    expect(denied.status).toBe(401);
  });

  it("fails closed when the local bypass is configured in production", () => {
    expect(() => createAdminAuthRuntime({ mode: "local", isProduction: true })).toThrow(
      "Local administrator authentication cannot run in production"
    );
  });

  it("authenticates the immutable GitHub user id and enforces CSRF", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "oauth-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 42, login: "MarkTurowetz" }) });
    const runtime = githubRuntime(fetchImpl);
    const beginResponse = response();
    runtime.tryHandle(request(), beginResponse, new URL("https://game.test/auth/github?returnTo=%2Fart"));
    const authorizeUrl = new URL(beginResponse.headers.Location);
    expect(authorizeUrl.hostname).toBe("github.com");
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const callbackResponse = response();
    runtime.tryHandle(
      request(),
      callbackResponse,
      new URL(`https://game.test/auth/github/callback?code=code&state=${authorizeUrl.searchParams.get("state")}`)
    );
    await callbackResponse.ended;
    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.Location).toBe("/art");
    const cookie = callbackResponse.headers["Set-Cookie"][0].split(";")[0];

    const sessionResponse = response();
    runtime.tryHandle(request({ cookie }), sessionResponse, new URL("https://game.test/api/admin/session"));
    const session = JSON.parse(sessionResponse.body);
    expect(session.actorId).toBe("github:42");
    expect(session.csrfToken).toBeTruthy();

    const missingCsrf = response();
    expect(runtime.requireApi(request({ method: "POST", cookie }), missingCsrf, { mutation: true })).toBe(false);
    expect(missingCsrf.status).toBe(403);
    expect(runtime.requireApi(request({ method: "POST", cookie, headers: { "x-csrf-token": session.csrfToken } }), response(), { mutation: true })).toBe(true);
  });
});
