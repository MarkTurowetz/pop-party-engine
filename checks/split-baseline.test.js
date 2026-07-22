import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isApprovedStarterContentPath, normalizedLogicalPath, parseArgs, sha256 } = require("./split-baseline");

describe("split baseline tooling", () => {
  it("normalizes portable paths and rejects traversal", () => {
    expect(normalizedLogicalPath("./art\\default/avatar.svg")).toBe("art/default/avatar.svg");
    expect(() => normalizedLogicalPath("art/../private.svg")).toThrow(/Unsafe logical path/);
    expect(() => normalizedLogicalPath("/absolute.json")).toThrow(/Unsafe logical path/);
  });

  it("classifies only the agreed historical starter content paths", () => {
    expect(isApprovedStarterContentPath("game-flow.json")).toBe(true);
    expect(isApprovedStarterContentPath("games/flip-7/game-flow.json")).toBe(false);
  });

  it("resolves explicit immutable-ref arguments", () => {
    expect(parseArgs(["--main-ref", "abc", "--data-ref", "def", "--audit-history"])).toMatchObject({
      mainRef: "abc",
      dataRef: "def",
      auditHistory: true
    });
  });

  it("uses SHA-256 for byte inventories", () => {
    expect(sha256(Buffer.from("pop-party"))).toHaveLength(64);
  });
});
