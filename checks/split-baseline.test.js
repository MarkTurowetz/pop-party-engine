import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  isApprovedStarterContentPath,
  isSensitiveCredentialPath,
  normalizedLogicalPath,
  parseArgs,
  applyHistoryAuditExceptions,
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
    expect(isApprovedStarterContentPath("apps/reference/authoring/art-manifest.json")).toBe(true);
    expect(isApprovedStarterContentPath("apps/reference/content/audio/host-audios.json")).toBe(true);
    expect(isApprovedStarterContentPath("packages/create-game/starter/content/audio/host-audios.json")).toBe(true);
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
    const fakeCredential = ["D3finite1y", "N0t", "A", "Fixture"].join("-");
    const privateKeyMarker = ["-----BEGIN ENCRYPTED", "PRIVATE KEY-----"].join(" ");
    const passwordAssignment = ["const pass", "word = ", JSON.stringify(fakeCredential), ";"].join("");
    expect(secretContentFindingCodes('const token = "installation-token";')).toEqual([]);
    expect(secretContentFindingCodes(`const token = "installation-token";\n${passwordAssignment}`))
      .toContain("GENERIC_SECRET_ASSIGNMENT");
    expect(secretContentFindingCodes(JSON.stringify({ client_secret: fakeCredential })))
      .toContain("GENERIC_SECRET_ASSIGNMENT");
    expect(secretContentFindingCodes(privateKeyMarker))
      .toContain("PRIVATE_KEY");
  });

  it("permits only exact, fully consumed historical audit exceptions", () => {
    const finding = { objectId: "a".repeat(40), path: "checks/example.test.js", code: "PRIVATE_KEY" };
    const exception = { ...finding, codes: [finding.code], reason: "Deliberate fixture" };
    delete exception.code;
    expect(applyHistoryAuditExceptions([finding], [exception])).toEqual([]);
    expect(() => applyHistoryAuditExceptions([], [exception])).toThrow(/Unused/);
    expect(() => applyHistoryAuditExceptions([{ ...finding, objectId: "b".repeat(40) }], [exception])).toThrow(/Unused/);
  });

  it("resolves explicit immutable-ref arguments", () => {
    expect(parseArgs(["--main-ref", "abc", "--data-ref", "def", "--audit-history", "--audit-history-only"])).toMatchObject({
      mainRef: "abc",
      dataRef: "def",
      auditHistory: true,
      auditHistoryOnly: true
    });
  });

  it("uses SHA-256 for byte inventories", () => {
    expect(sha256(Buffer.from("pop-party"))).toHaveLength(64);
  });
});
