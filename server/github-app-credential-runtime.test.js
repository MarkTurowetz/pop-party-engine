import crypto from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGithubAppCredentialRuntime } = require("./github-app-credential-runtime");

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function privateKey() {
  return crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("GitHub App installation credentials", () => {
  it("signs a short-lived app JWT and caches the installation token", async () => {
    let currentTime = Date.parse("2026-07-22T18:00:00Z");
    const fetchImpl = vi.fn(async () => response(201, {
      token: "installation-token",
      expires_at: "2026-07-22T19:00:00Z"
    }));
    const runtime = createGithubAppCredentialRuntime({
      appId: "123",
      installationId: "456",
      privateKey: privateKey(),
      fetchImpl,
      now: () => currentTime
    });

    await expect(Promise.all([runtime.credential(), runtime.credential()])).resolves.toEqual(["installation-token", "installation-token"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const authorization = fetchImpl.mock.calls[0][1].headers.Authorization;
    const [, payload] = authorization.replace("Bearer ", "").split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({ iss: "123" });

    currentTime += 30 * 60 * 1000;
    await runtime.credential();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refreshes near expiry and fails closed on token errors", async () => {
    let currentTime = Date.parse("2026-07-22T18:00:00Z");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(201, { token: "first", expires_at: "2026-07-22T18:02:00Z" }))
      .mockResolvedValueOnce(response(403, { message: "installation denied" }));
    const runtime = createGithubAppCredentialRuntime({ appId: "123", installationId: "456", privateKey: privateKey(), fetchImpl, now: () => currentTime });
    await expect(runtime.credential()).resolves.toBe("first");
    currentTime += 90_000;
    await expect(runtime.credential()).rejects.toMatchObject({ status: 403, message: "installation denied" });
  });
});
