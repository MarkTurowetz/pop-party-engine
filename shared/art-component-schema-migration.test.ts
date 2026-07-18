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

  it("folds a legacy reference viewport into uniform parent scale and removes dimension keyframes", () => {
    const source = {
      artComponentSchemaVersion: 4,
      compositions: {
        child: {
          canvas: { width: 300, height: 180 },
          components: [{ id: "art", kind: "shape", x: 150, y: 90, width: 300, height: 180 }]
        },
        parent: {
          canvas: { width: 600, height: 400 },
          components: [{
            id: "child-ref",
            kind: "reference",
            artCompositionId: "child",
            x: 300,
            y: 200,
            width: 220,
            height: 130.664,
            scale: 1
          }],
          timeline: {
            tracks: [{
              targetId: "child-ref",
              keyframes: [
                { frame: 0, props: { x: 300, y: 200, width: 220, height: 130.664, scale: 1 } },
                { frame: 10, props: { x: 310, y: 205, width: 150, height: 90, scale: 1.2 } }
              ]
            }]
          }
        }
      }
    };

    const { manifest, report } = migrateLegacyArtManifestSchema(source);
    const reference = manifest.compositions.parent.components[0];

    expect(reference).toMatchObject({
      x: 300,
      y: 200,
      scale: 0.733333,
      referenceSizeMode: "intrinsic"
    });
    expect(reference.width).toBeUndefined();
    expect(reference.height).toBeUndefined();
    expect(manifest.compositions.parent.timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 300, y: 200, scale: 0.733333 } },
      { frame: 10, props: { x: 310, y: 205, scale: 0.6 } }
    ]);
    expect(manifest.compositions.child).toEqual(source.compositions.child);
    expect(report).toMatchObject({ intrinsicReferenceCount: 1 });
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
    expect(manifest.compositions.wrapper.components[0]).toMatchObject({ x: 26, y: 14, scale: 1, referenceSizeMode: "intrinsic" });
    expect(manifest.compositions.wrapper.components[0].width).toBeUndefined();
    expect(manifest.compositions.wrapper.components[0].height).toBeUndefined();
    expect(manifest.compositions.wrapper.timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 26, y: 14, scale: 1 } },
      { frame: 5, props: { x: 31, y: 12, scale: 1.2 } }
    ]);
    expect(manifest.compositions.player.components).toEqual([
      expect.objectContaining({ id: "background", x: 50, y: 50 }),
      expect.objectContaining({ id: "avatar", x: 50, y: 50 })
    ]);
    expect(manifest.compositions.stage.components[0]).toMatchObject({ x: 150, y: 234 });
    expect(report).toMatchObject({ centeredComponentCount: 3, resizedCompositionCount: 1 });
    expect(report.compositionIds).toEqual(expect.arrayContaining(["wrapper", "player", "stage"]));
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
      scale: 1,
      referenceSizeMode: "intrinsic"
    });
    expect(manifest.compositions["answer-wrapper"].timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 260, y: 75, scale: 1 } },
      { frame: 5, props: { x: 270, y: 80, scale: 1.1 } }
    ]);
    expect(manifest.compositions.widget.components[0]).toMatchObject({
      x: 280,
      y: 115,
      scale: 1,
      referenceSizeMode: "intrinsic"
    });
    expect(report.compositionIds).toEqual(expect.arrayContaining(["answer-text", "answer-wrapper", "widget"]));
  });

  it("converts a stale reference resize into parent scale without rewriting either canvas", () => {
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

    expect(manifest.compositions.base.canvas).toEqual({ width: 560, height: 230 });
    expect(manifest.compositions.wrapper.canvas).toEqual({ width: 560, height: 230 });
    expect(manifest.compositions.wrapper.components[0]).toMatchObject({
      x: 280,
      y: 115,
      scale: 1,
      referenceSizeMode: "intrinsic"
    });
    expect(manifest.compositions.wrapper.components[0].width).toBeUndefined();
    expect(manifest.compositions.wrapper.components[0].height).toBeUndefined();
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
    expect(manifest.compositions.authorWrapper.components[0]).toMatchObject({ x: 170, y: 16, scale: 1, referenceSizeMode: "intrinsic" });
    expect(manifest.compositions.authorWrapper.timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 170, y: 16, scale: 1 } },
      { frame: 8, props: { x: 175, y: 14, scale: 1 } }
    ]);
    expect(manifest.compositions.compound.components).toEqual([
      expect.objectContaining({ id: "author-slot", x: 280, y: 43, scale: 1, referenceSizeMode: "intrinsic" }),
      expect.objectContaining({ id: "voters-slot", x: 278, y: 188, scale: 1, referenceSizeMode: "intrinsic" })
    ]);
    expect(manifest.compositions.vipBase.canvas).toEqual({ width: 44, height: 22 });
    expect(manifest.compositions.vipWrapper.canvas).toEqual({ width: 44, height: 22 });
    expect(manifest.compositions.vipWrapper.components[0]).toMatchObject({ x: 22, y: 11, scale: 1, referenceSizeMode: "intrinsic" });
    expect(manifest.compositions.player.components[0]).toMatchObject({ x: 150, y: 345, scale: 1, referenceSizeMode: "intrinsic" });
    expect(report.compositionIds).toEqual(expect.arrayContaining([
      "authorBase",
      "authorWrapper",
      "compound",
      "vipBase",
      "vipWrapper"
    ]));
  });

  it("tightens the Player Answer Bubble canvas while preserving its Player Widget placement", () => {
    const source = {
      artComponentSchemaVersion: 5,
      compositions: {
        bubble: {
          name: "Player Answer Bubble",
          compositionKind: "gameObject",
          canvas: { width: 300, height: 180 },
          components: [
            { id: "answer-text", kind: "text", x: 150, y: 92, width: 200, height: 78, scale: 1, rotation: 0 },
            { id: "answer-bubble-card", kind: "shape", x: 150, y: 92, width: 220, height: 105, scale: 1, rotation: 0 },
            { id: "answer-bubble-tail", kind: "shape", x: 150, y: 153.193, width: 24, height: 24, scale: 1, rotation: 45 }
          ],
          timeline: {
            tracks: [
              { targetId: "answer-text", keyframes: [{ frame: 0, props: { x: 150, y: 92, width: 200, height: 78 } }] },
              { targetId: "answer-bubble-card", keyframes: [{ frame: 0, props: { x: 150, y: 92, width: 220, height: 105 } }] },
              { targetId: "answer-bubble-tail", keyframes: [{ frame: 0, props: { x: 150, y: 153.193, width: 24, height: 24, rotation: 45 } }] }
            ]
          }
        },
        bubbleWrapper: {
          name: "Player Answer Bubble MC",
          compositionKind: "prefab",
          canvas: { width: 300, height: 180 },
          components: [{
            id: "bubble-ref",
            kind: "reference",
            artCompositionId: "bubble",
            x: 150,
            y: 90,
            scale: 1,
            referenceSizeMode: "intrinsic",
            transformOrigin: "bottom"
          }],
          timeline: {
            tracks: [{
              targetId: "bubble-ref",
              keyframes: [
                { frame: 0, props: { x: 150, y: 90, scale: 1 } },
                { frame: 9, props: { x: 150, y: 90, scale: 1.2 } }
              ]
            }]
          }
        },
        playerWidget: {
          name: "Player Widget MC",
          compositionKind: "prefab",
          canvas: { width: 300, height: 370 },
          components: [{
            id: "player-answer-bubble-mc",
            kind: "reference",
            artCompositionId: "bubbleWrapper",
            x: 150,
            y: 96,
            scale: 0.733333,
            referenceSizeMode: "intrinsic",
            transformOrigin: "bottom"
          }]
        }
      }
    };

    const { manifest, report } = migrateLegacyArtManifestSchema(source);
    const bubble = manifest.compositions.bubble;
    const wrapper = manifest.compositions.bubbleWrapper;
    const placed = manifest.compositions.playerWidget.components[0];

    expect(bubble.canvas).toEqual({ width: 220, height: 130.664 });
    expect(bubble.components).toEqual([
      expect.objectContaining({ id: "answer-text", x: 110, y: 52.5 }),
      expect.objectContaining({ id: "answer-bubble-card", x: 110, y: 52.5 }),
      expect.objectContaining({ id: "answer-bubble-tail", x: 110, y: 113.693 })
    ]);
    expect(bubble.timeline.tracks.map((track) => track.keyframes[0].props)).toEqual([
      expect.objectContaining({ x: 110, y: 52.5 }),
      expect.objectContaining({ x: 110, y: 52.5 }),
      expect.objectContaining({ x: 110, y: 113.693 })
    ]);
    expect(wrapper.canvas).toEqual({ width: 220, height: 130.664 });
    expect(wrapper.components[0]).toMatchObject({
      x: 110,
      y: 65.332,
      scale: 1,
      referenceSizeMode: "intrinsic",
      transformOrigin: "bottom"
    });
    expect(wrapper.timeline.tracks[0].keyframes).toEqual([
      { frame: 0, props: { x: 110, y: 65.332, scale: 1 } },
      { frame: 9, props: { x: 110, y: 65.332, scale: 1.2 } }
    ]);
    expect(placed).toMatchObject({
      x: 150,
      y: 96,
      scale: 1,
      referenceSizeMode: "intrinsic",
      transformOrigin: "bottom"
    });
    expect(placed.width).toBeUndefined();
    expect(placed.height).toBeUndefined();
    expect(report.compositionIds).toEqual(expect.arrayContaining(["bubble", "bubbleWrapper", "playerWidget"]));

    const legacySource = JSON.parse(JSON.stringify(source));
    legacySource.artComponentSchemaVersion = 4;
    const legacyPlaced = legacySource.compositions.playerWidget.components[0];
    legacyPlaced.width = 220;
    legacyPlaced.height = 130.664;
    legacyPlaced.scale = 1;
    delete legacyPlaced.referenceSizeMode;
    const legacyResult = migrateLegacyArtManifestSchema(legacySource).manifest;
    expect(legacyResult.compositions.bubble.canvas).toEqual({ width: 220, height: 130.664 });
    expect(legacyResult.compositions.bubbleWrapper.canvas).toEqual({ width: 220, height: 130.664 });
    expect(legacyResult.compositions.playerWidget.components[0]).toMatchObject({
      x: 150,
      y: 96,
      scale: 1,
      referenceSizeMode: "intrinsic",
      transformOrigin: "bottom"
    });
  });
});
