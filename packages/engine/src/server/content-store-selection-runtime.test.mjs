import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { selectApplicationContentStores } = require("./content-store-selection-runtime");

describe("application content store selection", () => {
  it("lets a single-service deployment override a generated game's local seed provider", () => {
    const deployment = { kind: "github" };
    const localSeed = { kind: "local-bundle" };
    expect(selectApplicationContentStores({
      environmentStore: deployment,
      gameStore: localSeed
    })).toEqual({
      authoringStore: deployment,
      roomStore: deployment,
      source: "deployment"
    });
  });

  it("keeps the game-owned provider when no deployment override is configured", () => {
    const localSeed = { kind: "local-bundle" };
    expect(selectApplicationContentStores({ gameStore: localSeed })).toMatchObject({
      authoringStore: localSeed,
      roomStore: localSeed,
      source: "game"
    });
  });
});
