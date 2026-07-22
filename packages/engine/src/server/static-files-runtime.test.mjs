import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { runtimeConfigScript } = require("./static-files-runtime");

describe("static runtime configuration", () => {
  it("injects game-owned semantic roles for browser runtime resolution", () => {
    const script = runtimeConfigScript({
      gameId: "fixture-game",
      version: "0.1.0",
      semanticRoles: { "engine.stage.votingCard": { compositionId: "fixture-voting-card" } }
    });
    const json = script.match(/>(.*)<\/script>/)?.[1] || "";
    expect(JSON.parse(json)).toEqual({
      game: { id: "fixture-game", version: "0.1.0" },
      semanticRoles: { "engine.stage.votingCard": { compositionId: "fixture-voting-card" } }
    });
  });

  it("escapes markup so game metadata cannot terminate the JSON script", () => {
    const script = runtimeConfigScript({ gameId: "</script><script>alert(1)</script>" });
    expect(script).not.toContain("</script><script>");
    expect(script).toContain("\\u003c/script\\u003e");
  });
});
