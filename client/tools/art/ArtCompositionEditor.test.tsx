import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "../../../shared/timeline-model";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import {
  swappableGameObjectOptions,
  timelineActionScriptForFrame,
  timelineActionScriptPlaceholderForFrame,
  timelineLayerDropPlacement,
  timelineLayerSiblingOwnerIds
} from "./ArtCompositionEditor";

describe("ArtCompositionEditor command scripts", () => {
  it("shows animation visibility as placeholder text instead of authored command text", () => {
    const timeline: TimelineDocument = {
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [
        { frame: 12, type: "stop" },
        { frame: 12, type: "setVisible", target: "true" }
      ],
      tracks: [{ targetId: "self", keyframes: [{ frame: 13, props: { visible: true } }] }]
    };

    expect(timelineActionScriptForFrame(timeline, 13, [])).toBe("");
    expect(timelineActionScriptPlaceholderForFrame(timeline, 13)).toBe("visible = true;");
    expect(timelineActionScriptForFrame(timeline, 12, timeline.commands)).toBe("stop();\nvisible = true;");
  });

  it("offers only replacement game objects on the selected reference surface", () => {
    const owner = { id: "owner", name: "Owner", surface: "stage", compositionKind: "prefab", canvas: { width: 560, height: 230 }, components: [] } as ArtComposition;
    const component = { id: "slot", kind: "reference", artCompositionId: "current" } as ArtComponent;
    const options = swappableGameObjectOptions(
      [
        owner,
        { id: "current", name: "Current", surface: "stage", compositionKind: "gameObject", components: [] },
        { id: "z", name: "Zebra", surface: "stage", compositionKind: "gameObject", components: [] },
        { id: "a", name: "Alpha", surface: "stage", compositionKind: "gameObject", components: [] },
        { id: "prefab", name: "Nested Prefab", surface: "stage", compositionKind: "prefab", components: [] },
        { id: "controller", name: "Controller Object", surface: "controller", compositionKind: "gameObject", components: [] }
      ] as ArtComposition[],
      owner,
      component
    );

    expect(options.map((option) => option.id)).toEqual(["a", "z"]);
  });
});

describe("ArtCompositionEditor layer ordering", () => {
  it("chooses a before or after drop without mutating lane order during hover", () => {
    expect(timelineLayerDropPlacement(109, { top: 100, height: 20 })).toBe("before");
    expect(timelineLayerDropPlacement(111, { top: 100, height: 20 })).toBe("after");
  });

  it("identifies sibling groups so layers cannot be dragged across containers", () => {
    const root = {
      id: "root",
      kind: "container",
      children: [
        { id: "card", kind: "reference" },
        { id: "answer", kind: "reference" },
        {
          id: "group",
          kind: "container",
          children: [
            { id: "author", kind: "reference" },
            { id: "votes", kind: "reference" }
          ]
        }
      ]
    } as ArtComponent;

    expect(Object.fromEntries(timelineLayerSiblingOwnerIds(root))).toEqual({
      card: "root",
      answer: "root",
      group: "root",
      author: "group",
      votes: "group"
    });
  });
});
