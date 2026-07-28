import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createAdminAuthRuntime,
  isSameOriginAuthoringRecovery
} = require("./admin-auth-runtime");

describe("live prototype administrator boundary", () => {
  it("protects the working workspace state from unauthenticated reads", () => {
    const auth = createAdminAuthRuntime({ mode: "legacy-open" });
    expect(auth.isAdminApiRequest(
      { method: "GET" },
      new URL("https://game.test/api/authoring/workspace")
    )).toBe(true);
  });

  it("classifies every workspace mutation as an authenticated administrator API", () => {
    const auth = createAdminAuthRuntime({ mode: "legacy-open" });
    for (const pathname of [
      "/api/authoring/workspace/session",
      "/api/authoring/workspace/heartbeat",
      "/api/authoring/workspace/discard",
      "/api/authoring/workspace/save"
    ]) {
      expect(auth.isAdminApiRequest(
        { method: "POST" },
        new URL(`https://game.test${pathname}`)
      )).toBe(true);
    }
  });

  it("only recognizes stale-CSRF recovery from the same origin with an authoring session", () => {
    const validHeaders = {
      host: "pop-party.onrender.com",
      origin: "https://pop-party.onrender.com",
      "sec-fetch-site": "same-origin",
      "x-csrf-token": "stale-token",
      "x-pop-party-authoring-session": "authoring-session"
    };
    expect(isSameOriginAuthoringRecovery({ headers: validHeaders })).toBe(true);
    expect(isSameOriginAuthoringRecovery({
      headers: { ...validHeaders, origin: "https://attacker.example" }
    })).toBe(false);
    expect(isSameOriginAuthoringRecovery({
      headers: { ...validHeaders, "sec-fetch-site": "cross-site" }
    })).toBe(false);
    expect(isSameOriginAuthoringRecovery({
      headers: { ...validHeaders, "x-pop-party-authoring-session": "" }
    })).toBe(false);
  });
});
