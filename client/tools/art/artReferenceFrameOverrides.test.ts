import { describe, expect, it } from "vitest";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { artReferenceFrameZeroOverrides } from "./artReferenceFrameOverrides";

describe("artReferenceFrameZeroOverrides", () => {
  it("scopes a referenced composition's frame-zero text into its placed instance", () => {
    const child = {
      id: "voting-card-answer",
      name: "Voting Card Answer",
      surface: "stage",
      compositionKind: "prefab",
      canvas: { width: 200, height: 60 },
      components: [{ id: "answer-text", kind: "text", defaultText: "Text" }],
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [],
        commands: [],
        tracks: [{ targetId: "answer-text", keyframes: [{ frame: 0, props: { defaultText: "Answer Text Answer Text" } }] }]
      }
    } as ArtComposition;
    const placed = { id: "answer", kind: "reference", artCompositionId: child.id } as ArtComponent;

    expect(artReferenceFrameZeroOverrides([placed], new Map([[child.id, child]]))).toEqual({
      "answer/answer-text": { defaultText: "Answer Text Answer Text" }
    });
  });

  it("keeps nested reference frame-zero values scoped to the full instance path", () => {
    const background = {
      id: "voting-card-bg",
      name: "Voting Card Bg",
      surface: "stage",
      canvas: { width: 200, height: 100 },
      components: [{ id: "shape", kind: "shape", fillColor: "white" }],
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [],
        commands: [],
        tracks: [{ targetId: "shape", keyframes: [{ frame: 0, props: { fillColor: "#fff6d8" } }] }]
      }
    } as ArtComposition;
    const card = {
      id: "card",
      name: "Card",
      surface: "stage",
      canvas: { width: 200, height: 100 },
      components: [{ id: "background", kind: "reference", artCompositionId: background.id }]
    } as ArtComposition;
    const placed = { id: "card-instance", kind: "reference", artCompositionId: card.id } as ArtComponent;

    expect(artReferenceFrameZeroOverrides([placed], new Map([[card.id, card], [background.id, background]]))).toEqual({
      "card-instance/background/shape": { fillColor: "#fff6d8" }
    });
  });
});
