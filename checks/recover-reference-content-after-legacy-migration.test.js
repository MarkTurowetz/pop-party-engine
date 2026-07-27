import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  EXPECTED,
  recoverReferenceContent
} = require("./recover-reference-content-after-legacy-migration");

describe("reference content rollback", () => {
  it("restores the complete last user-saved bundle without merging later sources", () => {
    const result = recoverReferenceContent();

    expect(result.snapshot.revision).toBe(EXPECTED.lastUserSavedContentRevision);
    expect(result.summary).toEqual({
      sourceContentCommit: EXPECTED.lastUserSavedContentCommit,
      restoredContentRevision: EXPECTED.lastUserSavedContentRevision,
      fileCount: 17,
      stateCount: 10,
      startMomentCount: 1,
      endMomentCount: 1,
      stageLayoutCount: 10,
      controllerLayoutCount: 18,
      artCompositionCount: 72,
      artAssetCount: 8
    });
  });
});
