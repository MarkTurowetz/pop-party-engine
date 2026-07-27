import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  EXPECTED,
  recoverReferenceContent
} = require("./recover-reference-content-after-legacy-migration");

describe("reference content rollback", () => {
  it("preserves the complete background-capable Tool state", () => {
    const result = recoverReferenceContent();

    expect(result.snapshot.revision).toBe(EXPECTED.laterToolStateRevision);
    expect(result.summary).toEqual({
      sourceContentCommit: EXPECTED.laterToolStateCommit,
      restoredContentRevision: EXPECTED.laterToolStateRevision,
      fileCount: 17,
      stateCount: 10,
      startMomentCount: 1,
      endMomentCount: 10,
      routeNodeCount: 5,
      stageLayoutCount: 10,
      controllerLayoutCount: 18,
      artCompositionCount: 72,
      backgroundCompositionCount: 10,
      artAssetCount: 8
    });
  });
});
