import { describe, expect, it } from "vitest";
import { PartyGameVotingCardVisuals } from "./stageVotingCardVisuals";

describe("PartyGameVotingCardVisuals (ported voting-card-visuals)", () => {
  it("createRenderer returns the render surface", () => {
    const renderer = PartyGameVotingCardVisuals.createRenderer({});
    expect(renderer.render).toBeTypeOf("function");
    expect(renderer.clear).toBeTypeOf("function");
  });

  it("render is a no-op without a layer", () => {
    const renderer = PartyGameVotingCardVisuals.createRenderer({});
    expect(() => renderer.render([{ id: "c1" }])).not.toThrow();
    expect(renderer.cards.size).toBe(0);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameVotingCardVisuals?: unknown };
    expect(host.PartyGameVotingCardVisuals).toBeTypeOf("object");
  });
});
