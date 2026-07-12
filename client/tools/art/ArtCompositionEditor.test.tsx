import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "../../../shared/timeline-model";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { swappableGameObjectOptions, timelineActionScriptForFrame, timelineActionScriptPlaceholderForFrame } from "./ArtCompositionEditor";

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
