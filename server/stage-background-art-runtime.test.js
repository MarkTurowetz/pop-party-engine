import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { stageBackgroundOverride } = require("./stage-background-art-runtime");

describe("stage background art persistence", () => {
  it("preserves saved authored background compositions", () => {
    const saved = { components: [{ id: "authored-layer", x: 42 }] };
    expect(stageBackgroundOverride(
      { id: "stage-background-default" },
      { "stage-background-default": saved }
    )).toBe(saved);
  });

  it("does not override unrelated built-in compositions or absent saves", () => {
    expect(stageBackgroundOverride({ id: "stage-background" }, {})).toBe(null);
    expect(stageBackgroundOverride(
      { id: "controller-player-banner" },
      { "controller-player-banner": { components: [] } }
    )).toBe(null);
  });
});
