import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { blockingArtArchitectureIssues } = require("./art-validation-runtime");

function invalidComposition(id) {
  return {
    id,
    components: [
      { id: "duplicate", kind: "shape" },
      { id: "duplicate", kind: "shape" }
    ]
  };
}

describe("Art architecture save validation", () => {
  it("does not block an unrelated save because of a pre-existing issue", () => {
    const before = [invalidComposition("legacy")];
    const after = JSON.parse(JSON.stringify(before));

    expect(blockingArtArchitectureIssues(before, after)).toEqual([]);
  });

  it("blocks every issue on a composition explicitly touched by the save", () => {
    const before = [invalidComposition("legacy")];
    const after = JSON.parse(JSON.stringify(before));

    expect(blockingArtArchitectureIssues(before, after, ["legacy"])).toEqual([
      expect.objectContaining({ compositionId: "legacy", code: "duplicate-component-id" })
    ]);
  });

  it("blocks newly introduced issues on otherwise unrelated compositions", () => {
    const before = [invalidComposition("legacy")];
    const after = [...before, invalidComposition("new-art")];

    expect(blockingArtArchitectureIssues(before, after)).toEqual([
      expect.objectContaining({ compositionId: "new-art", code: "duplicate-component-id" })
    ]);
  });
});
