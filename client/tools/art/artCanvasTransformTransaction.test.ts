import { describe, expect, it } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import type { TimelineProperties } from "../../../shared/timeline-model";
import {
  alignedArtCanvasPositions,
  applyArtCanvasTransformKeyframes,
  artCanvasDragSelection,
  artCanvasKeyboardCommand,
  captureArtCanvasTransformTargets,
  centeredArtCanvasPositions,
  rootArtCanvasSelectionIds,
  translatedArtCanvasPositions
} from "./artCanvasTransformTransaction";

function component(id: string, overrides: Partial<ArtComponent> = {}): ArtComponent {
  return { id, name: id, kind: "reference", x: 0, y: 0, width: 20, height: 10, scale: 1, rotation: 0, ...overrides } as ArtComponent;
}

describe("art canvas transform transactions", () => {
  it("maps arrow shortcuts to one-pixel, ten-pixel, and function-align commands", () => {
    expect(artCanvasKeyboardCommand({ key: "ArrowLeft" })).toEqual({ direction: "left", mode: "nudge", step: 1 });
    expect(artCanvasKeyboardCommand({ key: "ArrowDown", shiftKey: true })).toEqual({ direction: "down", mode: "nudge", step: 10 });
    expect(artCanvasKeyboardCommand({ key: "ArrowRight", shiftKey: true, getModifierState: (key) => key === "Fn" }))
      .toEqual({ direction: "right", mode: "align", step: 0 });
    expect(artCanvasKeyboardCommand({ key: "Home", shiftKey: true })).toEqual({ direction: "left", mode: "align", step: 0 });
  });

  it("moves only selection roots when a selected container contains another selected object", () => {
    const child = component("child");
    const parent = component("parent", { kind: "container", children: [child] });
    expect([...rootArtCanvasSelectionIds([parent, component("sibling")], new Set(["parent", "child", "sibling"]))])
      .toEqual(["parent", "sibling"]);
  });

  it("aligns visual edges while preserving differently sized object bounds", () => {
    const targets = captureArtCanvasTransformTargets(
      [component("bubble", { x: 100 }), component("popup", { x: 220 })],
      new Set(["bubble", "popup"]),
      () => ({})
    );
    const bounds = new Map([
      ["bubble", { left: 20, right: 220, top: 30, bottom: 100 }],
      ["popup", { left: 170, right: 270, top: 40, bottom: 80 }]
    ]);
    expect(alignedArtCanvasPositions(targets, bounds, "left", 2)).toEqual({
      bubble: { x: 100, y: 0 },
      popup: { x: 145, y: 0 }
    });
  });

  it("selects an unselected drag anchor immediately and preserves an existing group", () => {
    expect([...artCanvasDragSelection(new Set(["vip"]), "bubble", false)]).toEqual(["bubble"]);
    expect([...artCanvasDragSelection(new Set(["vip"]), "bubble", true)]).toEqual(["vip", "bubble"]);
    expect([...artCanvasDragSelection(new Set(["vip", "bubble"]), "vip", false)]).toEqual(["vip", "bubble"]);
  });

  it("captures every selected unlocked component from one resolved frame snapshot", () => {
    const components = [
      component("vip", { x: 10 }),
      component("bubble", { x: 20 }),
      component("avatar", { x: 30, locked: true })
    ];

    const targets = captureArtCanvasTransformTargets(
      components,
      new Set(["vip", "bubble", "avatar"]),
      (target): TimelineProperties => {
        if (target.id === "bubble") return { x: 25, y: 5 };
        return {};
      }
    );

    expect(targets.map((target) => target.id)).toEqual(["vip", "bubble"]);
    expect(targets.map((target) => [target.originX, target.originY])).toEqual([[10, 0], [25, 5]]);
  });

  it("moves a group by one world-space delta while respecting nested coordinate spaces", () => {
    const child = component("child", { x: 4, y: 6 });
    const parent = component("parent", { kind: "container", scale: 2, rotation: 90, children: [child] });
    const sibling = component("sibling", { x: 10, y: 20 });
    const targets = captureArtCanvasTransformTargets([parent, sibling], new Set(["child", "sibling"]), () => ({}));

    const positions = translatedArtCanvasPositions(targets, 10, 0);

    expect(positions.sibling).toEqual({ x: 20, y: 20 });
    expect(positions.child.x).toBeCloseTo(4);
    expect(positions.child.y).toBeCloseTo(1);
  });

  it("centers every selected object on the largest rendered object", () => {
    const targets = captureArtCanvasTransformTargets(
      [
        component("background", { x: 900, y: 700, width: 500, height: 200 }),
        component("label", { x: 25, y: 30, width: 180, height: 40 }),
        component("icon", { x: 50, y: 60, width: 60, height: 60 })
      ],
      new Set(["background", "label", "icon"]),
      () => ({})
    );

    expect(centeredArtCanvasPositions(targets)).toEqual({
      background: { x: 250, y: 100 },
      label: { x: 250, y: 100 },
      icon: { x: 250, y: 100 }
    });
  });

  it("uses current-frame size and scale when choosing the largest object", () => {
    const targets = captureArtCanvasTransformTargets(
      [component("wide", { width: 500, height: 200 }), component("scaled", { width: 200, height: 100 })],
      new Set(["wide", "scaled"]),
      (target): TimelineProperties => target.id === "scaled" ? { width: 300, height: 120, scale: 2 } : {}
    );

    expect(centeredArtCanvasPositions(targets)).toEqual({
      wide: { x: 150, y: 60 },
      scaled: { x: 150, y: 60 }
    });
  });

  it("creates one complete current-frame keyframe for every transformed component", () => {
    const components = [component("vip", { x: -50 }), component("bubble", { x: 0 })];
    const targets = captureArtCanvasTransformTargets(components, new Set(["vip", "bubble"]), () => ({}));
    const positions = translatedArtCanvasPositions(targets, 15, 10);

    const timeline = applyArtCanvasTransformKeyframes(
      { fps: 30, frameCount: 33, labels: [], commands: [], tracks: [] },
      targets.map((target) => ({ target, patch: positions[target.id] })),
      0
    );

    expect(timeline.tracks.map((track) => track.targetId).sort()).toEqual(["bubble", "vip"]);
    expect(timeline.tracks.every((track) => track.keyframes.length === 1 && track.keyframes[0].frame === 0)).toBe(true);
    expect(timeline.tracks.find((track) => track.targetId === "vip")?.keyframes[0].props).toEqual(
      expect.objectContaining({ x: -35, y: 10, scale: 1, rotation: 0 })
    );
    expect(timeline.tracks.find((track) => track.targetId === "vip")?.keyframes[0].props.width).toBeUndefined();
    expect(timeline.tracks.find((track) => track.targetId === "vip")?.keyframes[0].props.height).toBeUndefined();
    expect(timeline.tracks.find((track) => track.targetId === "bubble")?.keyframes[0].props).toEqual(
      expect.objectContaining({ x: 15, y: 10 })
    );
  });

  it("starts from the displayed keyframe value so the first drag cannot snap back", () => {
    const vip = component("vip", { x: 100, y: 100 });
    const [target] = captureArtCanvasTransformTargets([vip], new Set([vip.id]), () => ({ x: 25, y: 30 }));
    const positions = translatedArtCanvasPositions([target], 10, -5);

    const timeline = applyArtCanvasTransformKeyframes(
      {
        fps: 30,
        frameCount: 33,
        labels: [],
        commands: [],
        tracks: [{ id: "track-vip", targetId: "vip", keyframes: [{ id: "key-vip-0", frame: 0, props: { x: 25, y: 30 }, easing: "hold" }] }]
      },
      [{ target, patch: positions.vip }],
      0
    );

    expect(vip.x).toBe(100);
    expect(timeline.tracks[0].keyframes[0].props).toEqual(expect.objectContaining({ x: 35, y: 25 }));
  });
});
