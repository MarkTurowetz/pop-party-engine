import { describe, expect, it } from "vitest";
import { PartyGamePlayerRoster } from "./stagePlayerRoster";

describe("PartyGamePlayerRoster (ported player-roster-renderer)", () => {
  it("createRenderer returns the roster surface", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    expect(roster.render).toBeTypeOf("function");
    expect(roster.setShown).toBeTypeOf("function");
    expect(roster.renderPointPopups).toBeTypeOf("function");
  });

  it("setShown returns 0 without a host", () => {
    expect(PartyGamePlayerRoster.createRenderer({}).setShown(true)).toBe(0);
  });

  it("playerSignature is stable for equal players", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const a = roster.playerSignature({ name: "Ava", avatar: { shape: "rex" }, isVip: true });
    const b = roster.playerSignature({ name: "Ava", avatar: { shape: "rex" }, isVip: true });
    expect(a).toBe(b);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGamePlayerRoster?: unknown };
    expect(host.PartyGamePlayerRoster).toBeTypeOf("object");
  });
});
