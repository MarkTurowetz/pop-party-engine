import { describe, expect, it, vi } from "vitest";
import {
  AVATARS_COMPOSITION_ID,
  PLAYER_AVATAR_MC_COMPOSITION_ID,
  avatarTimelineLabelForSpecies,
  playerAvatarCompositionArt,
  type PlayerAvatarArtComposition
} from "./playerAvatarCompositionArt";

function authoredAvatarCompositions(): PlayerAvatarArtComposition[] {
  return [
    {
      id: PLAYER_AVATAR_MC_COMPOSITION_ID,
      canvas: { width: 100, height: 100 },
      components: [
        {
          id: "avatar",
          kind: "reference",
          artCompositionId: AVATARS_COMPOSITION_ID,
          defaultAnimationState: "Rex",
          x: 50,
          y: 50,
          width: 70,
          height: 70,
          scale: 1
        },
        {
          id: "avatar-background",
          kind: "shape",
          shapeStyle: "circle",
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          scale: 1,
          fillColor: "#fff6d8",
          borderColor: "#17131f",
          borderWidth: 6
        }
      ]
    },
    {
      id: AVATARS_COMPOSITION_ID,
      canvas: { width: 70, height: 70 },
      components: [{
        id: "avatar",
        kind: "sprite",
        x: 35,
        y: 35,
        width: 70,
        height: 70,
        scale: 1,
        imageAssetId: "avatar-rex",
        imageTint: "currentColor",
        spriteRenderMode: "tinted"
      }],
      timeline: {
        labels: [{ name: "Rex", frame: 0 }, { name: "Cleo", frame: 5 }],
        tracks: [{
          targetId: "avatar",
          keyframes: [
            { frame: 0, props: { imageAssetId: "avatar-rex" } },
            { frame: 5, props: { imageAssetId: "avatar-ankylo" } }
          ]
        }]
      }
    }
  ];
}

describe("playerAvatarCompositionArt", () => {
  it("maps gameplay species to the authored Avatars frame labels", () => {
    expect(avatarTimelineLabelForSpecies("rex")).toBe("Rex");
    expect(avatarTimelineLabelForSpecies("raptor")).toBe("Raptor");
    expect(avatarTimelineLabelForSpecies("ankylo")).toBe("Cleo");
    expect(avatarTimelineLabelForSpecies("unknown")).toBe("Rex");
  });

  it("renders the Player Avatar MC hierarchy at the selected Avatars frame", () => {
    const compositions = authoredAvatarCompositions();
    const getComposition = vi.fn((id: string) => compositions.find((composition) => composition.id === id) || null);

    const markup = playerAvatarCompositionArt({
      shape: "ankylo",
      getComposition,
      assetUrl: (assetId) => `/art/${assetId}.svg`
    });

    expect(markup).toContain(`data-player-avatar-source="${PLAYER_AVATAR_MC_COMPOSITION_ID}"`);
    expect(markup).toContain("/art/avatar-ankylo.svg");
    expect(markup).not.toContain("/art/avatar-rex.svg");
    expect(markup).toContain("is-style-circle");
    expect(markup).toContain("left:50%");
    expect(markup).toContain("top:50%");
    expect(getComposition.mock.calls.map(([id]) => id)).toEqual([
      PLAYER_AVATAR_MC_COMPOSITION_ID,
      AVATARS_COMPOSITION_ID
    ]);
  });

  it("returns null when the authored Player Avatar MC is unavailable", () => {
    expect(playerAvatarCompositionArt({
      shape: "rex",
      getComposition: () => null,
      assetUrl: () => ""
    })).toBeNull();
  });

  it("does not compensate for a zero-origin child in a top-left canvas", () => {
    const compositions = authoredAvatarCompositions();
    compositions[0].components![0].x = 0;
    compositions[0].components![0].y = 0;
    const markup = playerAvatarCompositionArt({
      shape: "rex",
      getComposition: (id) => compositions.find((composition) => composition.id === id) || null,
      assetUrl: (assetId) => `/art/${assetId}.svg`
    });

    expect(markup).toContain("left:0%");
    expect(markup).toContain("top:0%");
  });
});
