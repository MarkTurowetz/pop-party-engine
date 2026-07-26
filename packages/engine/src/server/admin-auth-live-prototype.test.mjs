import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createAdminAuthRuntime } = require("./admin-auth-runtime");

describe("live prototype administrator boundary", () => {
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
});
