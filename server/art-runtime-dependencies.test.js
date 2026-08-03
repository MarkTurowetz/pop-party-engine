import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { artRuntimeReferences } = require("./art-runtime-dependencies");

describe("art runtime semantic dependencies", () => {
  it("tracks mapped game objects and no longer protects the legacy voting-card fallback", () => {
    const references = artRuntimeReferences({
      "engine.stage.votingCard": { compositionId: "game-voting-card" },
      "reference.stage.playerDecoration": { compositionId: "game-player-widget" }
    });
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ compositionId: "game-voting-card", sourceId: "semantic-role:engine.stage.votingCard" }),
      expect.objectContaining({ compositionId: "game-player-widget", sourceId: "semantic-role:reference.stage.playerDecoration" })
    ]));
    expect(references.some((reference) => reference.sourceId === "stage-voting-card-fallback")).toBe(false);
  });
});
