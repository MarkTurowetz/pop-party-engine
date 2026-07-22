import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { resolveBuildNumber } = require("../build-version");

describe("build version stamping", () => {
  it("uses the next commit count during normal commits", () => {
    expect(resolveBuildNumber({ committedBuildNumber: 1128, existingBuildNumber: 1128, headCount: 1128, useNextCommit: true })).toBe(1129);
  });

  it("stays monotonic after an amend moved the build ahead of commit count", () => {
    expect(resolveBuildNumber({ committedBuildNumber: 1128, existingBuildNumber: 1128, headCount: 1127, useNextCommit: true })).toBe(1129);
  });

  it("is idempotent when the working tree is already stamped for the next commit", () => {
    expect(resolveBuildNumber({ committedBuildNumber: 1128, existingBuildNumber: 1129, headCount: 1127, useNextCommit: true })).toBe(1129);
  });
});
