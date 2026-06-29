import { describe, expect, it } from "vitest";
import { PartyGameQrCode } from "./qrCode";

describe("PartyGameQrCode (ported qr-code)", () => {
  it("produces a 37x37 (version 5) module matrix", () => {
    const modules = PartyGameQrCode.matrixForText("HELLO");
    expect(modules).toHaveLength(37);
    expect(modules[0]).toHaveLength(37);
    expect(modules.every((row) => row.every((cell) => typeof cell === "boolean"))).toBe(true);
  });

  it("is deterministic and content-sensitive", () => {
    const a1 = JSON.stringify(PartyGameQrCode.matrixForText("https://example.com/abc"));
    const a2 = JSON.stringify(PartyGameQrCode.matrixForText("https://example.com/abc"));
    const b = JSON.stringify(PartyGameQrCode.matrixForText("https://example.com/xyz"));
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it("renders the finder pattern corner (top-left dark module)", () => {
    const modules = PartyGameQrCode.matrixForText("X");
    expect(modules[0][0]).toBe(true);
  });

  it("throws when the text exceeds the version-5 capacity", () => {
    expect(() => PartyGameQrCode.matrixForText("x".repeat(120))).toThrow(/too long/);
  });
});
