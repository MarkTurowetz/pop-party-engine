import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { PartyGameQrCode } = require("./qr-code-runtime");

describe("engine QR code runtime", () => {
  it("produces deterministic, content-sensitive version-5 matrices", () => {
    const first = PartyGameQrCode.matrixForText("https://example.com/abc");
    const repeated = PartyGameQrCode.matrixForText("https://example.com/abc");
    const different = PartyGameQrCode.matrixForText("https://example.com/xyz");
    expect(first).toHaveLength(37);
    expect(first[0]).toHaveLength(37);
    expect(first[0][0]).toBe(true);
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(different);
  });

  it("fails instead of truncating data beyond the fixed symbol capacity", () => {
    expect(() => PartyGameQrCode.matrixForText("x".repeat(120))).toThrow(/too long/);
  });
});
