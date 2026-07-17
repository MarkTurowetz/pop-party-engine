import { describe, expect, it } from "vitest";
import { ART_COMPONENT_SCHEMA_VERSION, migrateLegacyArtManifestSchema } from "./art-component-schema-migration";

describe("art component schema migration", () => {
  it("migrates image-backed shapes to sprites and avatar frames to native shapes", () => {
    const source = {
      compositions: {
        avatar: {
          components: [
            { id: "dino", kind: "shape", imageAssetId: "avatar-rex", imageTint: "currentColor", fillColor: "currentColor" },
            { id: "frame", kind: "shape", imageAssetId: "avatar-frame", fillColor: "transparent" }
          ],
          timeline: { tracks: [{ targetId: "dino", keyframes: [{ frame: 0, props: { imageAssetId: "avatar-rex", fillColor: "currentColor" } }] }] }
        }
      }
    };
    const { manifest, report } = migrateLegacyArtManifestSchema(source);
    const [dino, frame] = manifest.compositions.avatar.components;
    expect(manifest.artComponentSchemaVersion).toBe(ART_COMPONENT_SCHEMA_VERSION);
    expect(dino).toMatchObject({ kind: "sprite", spriteRenderMode: "tinted", imageObjectFit: "contain" });
    expect(dino.fillColor).toBeUndefined();
    expect(frame).toMatchObject({ kind: "shape", fillColor: "#fff6d8", borderColor: "#17131f", borderWidth: 6, borderRadius: 13 });
    expect(frame.imageAssetId).toBeUndefined();
    expect(manifest.compositions.avatar.timeline.tracks[0].keyframes[0].props).toMatchObject({
      imageAssetId: "avatar-rex",
      spriteRenderMode: "tinted"
    });
    expect(report).toMatchObject({ spriteCount: 1, avatarFrameShapeCount: 1, compositionIds: ["avatar"] });
  });

  it("is idempotent once the manifest version is current", () => {
    const first = migrateLegacyArtManifestSchema({ compositions: { icon: { components: [{ id: "icon", kind: "shape", imageAssetId: "cursor" }] } } });
    const second = migrateLegacyArtManifestSchema(first.manifest);
    expect(second.manifest).toEqual(first.manifest);
    expect(second.report.changed).toBe(false);
  });

  it("recenters legacy zero-origin prefab children without moving their placed parent references", () => {
    const source = {
      artComponentSchemaVersion: 1,
      compositions: {
        "visual-base": {
          compositionKind: "gameObject",
          canvas: { width: 52, height: 28 },
          components: []
        },
        wrapper: {
          compositionKind: "prefab",
          canvas: { width: 560, height: 230 },
          components: [{
            id: "visual",
            kind: "reference",
            x: 0,
            y: 0,
            width: 44,
            height: 22,
            artCompositionId: "visual-base"
          }],
          timeline: {
            tracks: [{
              targetId: "visual",
              keyframes: [
                { frame: 0, props: { x: 0, y: 0, width: 44, height: 22, scale: 1 } },
                { frame: 5, props: { x: 5, y: -2, width: 44, height: 22, scale: 1.2 } }
              ]
            }]
          }
        },
        player: {
          compositionKind: "gameObject",
          canvas: { width: 100, height: 100 },
          components: [
            { id: "background", kind: "shape", x: 0, y: 0, width: 100, height: 100 },
            { id: "avatar", kind: "reference", x: 0, y: 0, width: 70, height: 70, artCompositionId: "avatars" }
          ]
        },
        stage: {
          compositionKind: "gameObject",
          canvas: { width: 600, height: 400 },
          components: [{ id: "placed-player", kind: "reference", x: 150, y: 234, width: 100, height: 100, artCompositionId: "player" }]
        }
      }
    };

    const { manifest, report } = migrateLegacyArtManifestSchema(source);

    expect(manifest.compositions.wrapper.canvas).toEqual({ width: 52, height: 28 });
    expect(manifest.compositions.wrapper.components[0]).toMatchObject({ x: 26, y: 14, width: 52, height: 28 });
    expect(manifest.compositions.wrapper.timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 26, y: 14, width: 52, height: 28, scale: 1 } },
      { frame: 5, props: { x: 31, y: 12, width: 52, height: 28, scale: 1.2 } }
    ]);
    expect(manifest.compositions.player.components).toEqual([
      expect.objectContaining({ id: "background", x: 50, y: 50 }),
      expect.objectContaining({ id: "avatar", x: 50, y: 50 })
    ]);
    expect(manifest.compositions.stage.components[0]).toMatchObject({ x: 150, y: 234 });
    expect(report).toMatchObject({ centeredComponentCount: 3, resizedCompositionCount: 1 });
    expect(report.compositionIds).toEqual(["wrapper", "player"]);
  });
});
