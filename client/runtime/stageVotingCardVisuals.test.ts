import { describe, expect, it } from "vitest";
import { PartyGameVotingCardVisuals, votingCardArtTimeline } from "./stageVotingCardVisuals";

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

  it("uses effective timelines for voting card art renderers", () => {
    const timeline = {
      fps: 30,
      frameCount: 2,
      labels: [{ name: "custom", frame: 1 }],
      commands: [{ frame: 1, type: "stop" }],
      tracks: []
    };

    expect(votingCardArtTimeline(timeline).labels).toEqual([expect.objectContaining({ name: "custom", frame: 1 })]);
    expect(votingCardArtTimeline(null).labels.map((label) => label.name)).toEqual(expect.arrayContaining(["appear", "disappear"]));
  });
});
