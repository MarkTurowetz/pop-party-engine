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
});
