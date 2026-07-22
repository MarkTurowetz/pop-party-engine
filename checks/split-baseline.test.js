import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  isApprovedStarterContentPath,
  isSensitiveCredentialPath,
  normalizedLogicalPath,
  parseArgs,
  secretContentFindingCodes,
  sha256
} = require("./split-baseline");

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

  it("blocks credential data without misclassifying credential runtime source", () => {
    expect(isSensitiveCredentialPath(".env.production")).toBe(true);
    expect(isSensitiveCredentialPath("ops/github-credentials.json")).toBe(true);
    expect(isSensitiveCredentialPath("ops/admin-private-key.pem")).toBe(true);
    expect(isSensitiveCredentialPath("packages/engine/src/server/github-app-credential-runtime.js")).toBe(false);
    expect(isSensitiveCredentialPath("server/github-app-credential-runtime.test.js")).toBe(false);
  });

  it("continues past known dummy literals and still catches a later credential", () => {
    expect(secretContentFindingCodes('const token = "installation-token";')).toEqual([]);
    expect(secretContentFindingCodes('const token = "installation-token";\nconst password = "D3finite1y-N0t-A-Fixture";'))
      .toContain("GENERIC_SECRET_ASSIGNMENT");
    expect(secretContentFindingCodes('{"client_secret":"D3finite1y-N0t-A-Fixture"}'))
      .toContain("GENERIC_SECRET_ASSIGNMENT");
    expect(secretContentFindingCodes("-----BEGIN ENCRYPTED PRIVATE KEY-----"))
      .toContain("PRIVATE_KEY");
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
