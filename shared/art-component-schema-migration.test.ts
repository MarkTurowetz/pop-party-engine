import { describe, expect, it } from "vitest";
import {
  ART_COMPONENT_SCHEMA_VERSION,
  migrateLegacyArtManifestSchema,
  normalizeCurrentArtManifestGeometry
} from "./art-component-schema-migration";

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

  it("repairs the voting answer viewport chain without moving its compound-widget placement", () => {
    const source = {
      artComponentSchemaVersion: 2,
      compositions: {
        "answer-text": {
          name: "Voting Card Answer Text",
          compositionKind: "prefab",
          canvas: { width: 560, height: 230 },
          components: [
            { id: "text", kind: "text", x: 260, y: 75, width: 420, height: 78 },
            { id: "surface", kind: "shape", x: 260, y: 75, width: 520, height: 150 }
          ]
        },
        "answer-wrapper": {
          name: "Voting Card Answer",
          compositionKind: "prefab",
          canvas: { width: 560, height: 230 },
          components: [
            { id: "answer", kind: "reference", artCompositionId: "answer-text", x: 280, y: 115, width: 560, height: 230 }
          ],
          timeline: {
            tracks: [{
              targetId: "answer",
              keyframes: [
                { frame: 0, props: { x: 280, y: 115, width: 560, height: 230, scale: 1 } },
                { frame: 5, props: { x: 290, y: 120, width: 560, height: 230, scale: 1.1 } }
              ]
            }]
          }
        },
        widget: {
          name: "Voting Card Widget MC",
          compositionKind: "prefab",
          canvas: { width: 560, height: 230 },
          components: [
            { id: "answer-slot", kind: "reference", artCompositionId: "answer-wrapper", x: 280, y: 115, width: 520, height: 150 }
          ]
        }
      }
    };

    const { manifest, report } = migrateLegacyArtManifestSchema(source);

    expect(manifest.compositions["answer-text"].canvas).toEqual({ width: 520, height: 150 });
    expect(manifest.compositions["answer-text"].components).toEqual([
      expect.objectContaining({ id: "text", x: 260, y: 75, width: 420, height: 78 }),
      expect.objectContaining({ id: "surface", x: 260, y: 75, width: 520, height: 150 })
    ]);
    expect(manifest.compositions["answer-wrapper"].canvas).toEqual({ width: 520, height: 150 });
    expect(manifest.compositions["answer-wrapper"].components[0]).toMatchObject({
      x: 260,
      y: 75,
      width: 520,
      height: 150
    });
    expect(manifest.compositions["answer-wrapper"].timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 260, y: 75, width: 520, height: 150, scale: 1 } },
      { frame: 5, props: { x: 270, y: 80, width: 520, height: 150, scale: 1.1 } }
    ]);
    expect(manifest.compositions.widget.components[0]).toMatchObject({
      x: 280,
      y: 115,
      width: 520,
      height: 150
    });
    expect(report.compositionIds).toEqual(["answer-text", "answer-wrapper"]);
  });

  it("reapplies voting answer geometry when a stale open editor saves into a current manifest", () => {
    const current = {
      artComponentSchemaVersion: ART_COMPONENT_SCHEMA_VERSION,
      compositions: {
        base: {
          name: "Voting Card Answer Text",
          canvas: { width: 560, height: 230 },
          components: [{ id: "surface", kind: "shape", x: 260, y: 75, width: 520, height: 150 }]
        },
        wrapper: {
          name: "Voting Card Answer",
          canvas: { width: 560, height: 230 },
          components: [{ id: "answer", kind: "reference", artCompositionId: "base", x: 280, y: 115, width: 560, height: 230 }]
        }
      }
    };

    const { manifest, report } = normalizeCurrentArtManifestGeometry(current);

    expect(manifest.compositions.base.canvas).toEqual({ width: 520, height: 150 });
    expect(manifest.compositions.wrapper.canvas).toEqual({ width: 520, height: 150 });
    expect(manifest.compositions.wrapper.components[0]).toMatchObject({ x: 260, y: 75, width: 520, height: 150 });
    expect(report.changed).toBe(true);
  });

  it("repairs author, voter collection, and VIP source canvases without moving compound placements", () => {
    const current = {
      artComponentSchemaVersion: 3,
      compositions: {
        authorBase: {
          name: "Voting Card Author Text",
          canvas: { width: 340, height: 28 },
          components: [
            { id: "author-text", kind: "text", x: 170, y: 14, width: 340, height: 28 },
            { id: "author-card", kind: "shape", x: 170, y: 14, width: 340, height: 32 }
          ]
        },
        authorWrapper: {
          name: "Voting Card Author MC",
          canvas: { width: 340, height: 28 },
          components: [
            { id: "author", kind: "reference", artCompositionId: "authorBase", x: 170, y: 14, width: 340, height: 32 }
          ],
          timeline: {
            tracks: [{
              targetId: "author",
              keyframes: [
                { frame: 0, props: { x: 170, y: 14, width: 340, height: 32 } },
                { frame: 8, props: { x: 175, y: 12, width: 340, height: 32 } }
              ]
            }]
          }
        },
        voterBase: {
          name: "Voting Card Voter",
          canvas: { width: 112, height: 32 },
          components: [{ id: "voter-card", kind: "shape", x: 56, y: 16, width: 112, height: 32 }]
        },
        voterWrapper: {
          name: "Voting Card Voter MC",
          canvas: { width: 112, height: 32 },
          components: [{ id: "voter", kind: "reference", artCompositionId: "voterBase", x: 56, y: 16, width: 112, height: 32 }]
        },
        voters: {
          name: "Voting Card Voters MC",
          canvas: { width: 500, height: 48 },
          components: [{ id: "container", kind: "container", x: 250, y: 24, width: 500, height: 48 }]
        },
        vipBase: {
          name: "Player VIP Widget",
          canvas: { width: 52, height: 28 },
          components: [
            { id: "vip-text", kind: "text", x: 22, y: 11, width: 34, height: 12 },
            { id: "vip-card", kind: "shape", x: 22, y: 11, width: 44, height: 22 }
          ]
        },
        vipWrapper: {
          name: "VIP MC",
          canvas: { width: 52, height: 28 },
          components: [{ id: "vip", kind: "reference", artCompositionId: "vipBase", x: 26, y: 14, width: 52, height: 28 }]
        },
        compound: {
          name: "Voting Card Widget MC",
          canvas: { width: 560, height: 230 },
          components: [
            { id: "author-slot", kind: "reference", artCompositionId: "authorWrapper", x: 280, y: 43, width: 340, height: 32 },
            { id: "voters-slot", kind: "reference", artCompositionId: "voters", x: 278, y: 188, width: 112, height: 32 }
          ]
        },
        player: {
          name: "Player Widget MC",
          canvas: { width: 300, height: 370 },
          components: [{ id: "vip-slot", kind: "reference", artCompositionId: "vipWrapper", x: 150, y: 345, width: 44, height: 22 }]
        }
      }
    };

    const { manifest, report } = migrateLegacyArtManifestSchema(current);

    expect(manifest.artComponentSchemaVersion).toBe(ART_COMPONENT_SCHEMA_VERSION);
    expect(manifest.compositions.authorBase.canvas).toEqual({ width: 340, height: 32 });
    expect(manifest.compositions.authorBase.components).toEqual([
      expect.objectContaining({ id: "author-text", x: 170, y: 16, width: 340, height: 28 }),
      expect.objectContaining({ id: "author-card", x: 170, y: 16, width: 340, height: 32 })
    ]);
    expect(manifest.compositions.authorWrapper.canvas).toEqual({ width: 340, height: 32 });
    expect(manifest.compositions.authorWrapper.components[0]).toMatchObject({ x: 170, y: 16, width: 340, height: 32 });
    expect(manifest.compositions.authorWrapper.timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 170, y: 16, width: 340, height: 32 } },
      { frame: 8, props: { x: 175, y: 14, width: 340, height: 32 } }
    ]);
    expect(manifest.compositions.compound.components).toEqual([
      expect.objectContaining({ id: "author-slot", x: 280, y: 43, width: 340, height: 32 }),
      expect.objectContaining({ id: "voters-slot", x: 278, y: 188, width: 500, height: 48 })
    ]);
    expect(manifest.compositions.vipBase.canvas).toEqual({ width: 44, height: 22 });
    expect(manifest.compositions.vipWrapper.canvas).toEqual({ width: 44, height: 22 });
    expect(manifest.compositions.vipWrapper.components[0]).toMatchObject({ x: 22, y: 11, width: 44, height: 22 });
    expect(manifest.compositions.player.components[0]).toMatchObject({ x: 150, y: 345, width: 44, height: 22 });
    expect(report.compositionIds).toEqual(expect.arrayContaining([
      "authorBase",
      "authorWrapper",
      "compound",
      "vipBase",
      "vipWrapper"
    ]));
  });
});
