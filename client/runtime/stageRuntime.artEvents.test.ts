import { describe, expect, it } from "vitest";
import { stageArtAssetsChangedRevision } from "./stageRuntime";

describe("Stage Art event revisions", () => {
  it("reads the room content revision from an SSE event", () => {
    expect(stageArtAssetsChangedRevision({
      data: JSON.stringify({ type: "art-draft", contentRevision: "working-art-two" })
    } as MessageEvent)).toBe("working-art-two");
  });

  it("accepts local custom-event details and ignores malformed transport data", () => {
    expect(stageArtAssetsChangedRevision({
      detail: { contentRevision: "local-art-three" }
    } as CustomEvent)).toBe("local-art-three");
    expect(stageArtAssetsChangedRevision({ data: "not-json" } as MessageEvent)).toBe("");
  });
});
