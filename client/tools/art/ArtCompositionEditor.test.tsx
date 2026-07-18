import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "../../../shared/timeline-model";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import {
  artTimelineDockHeightFromPointer,
  isArtCenterSelectionShortcut,
  swappableGameObjectOptions,
  timelineFrameForStepShortcut,
  timelineTargetIdForViewShortcut,
  timelineActionScriptForFrame,
  timelineActionScriptPlaceholderForFrame,
  timelineWithActionScriptAtFrame,
  timelineLayerDropPlacement,
  timelineLayerSiblingOwnerIds
} from "./ArtCompositionEditor";
import { artWorkspaceId, createArtWorkspace } from "./artWorkspaceModel";

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

  it("persists command deletion even when the latest textarea value is committed directly", () => {
    const timeline: TimelineDocument = {
      fps: 30,
      frameCount: 20,
      labels: [],
      commandFrames: [12],
      commands: [
        { frame: 12, type: "stop" },
        { frame: 12, type: "setVisible", target: "false" }
      ],
      tracks: []
    };

    const result = timelineWithActionScriptAtFrame(timeline, 12, "stop();");

    expect(result.error).toBe("");
    expect(result.timeline.commandFrames).toContain(12);
    expect(result.timeline.commands).toEqual([expect.objectContaining({ frame: 12, type: "stop" })]);
  });

  it("offers replacement game objects and prefabs on the selected reference surface", () => {
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

    expect(options.map((option) => option.id)).toEqual(["a", "prefab", "z"]);
  });
});

describe("ArtCompositionEditor timeline frame stepping", () => {
  it("steps backward and forward with comma and period inside frame bounds", () => {
    expect(timelineFrameForStepShortcut(",", 2, 5)).toBe(1);
    expect(timelineFrameForStepShortcut(".", 2, 5)).toBe(3);
    expect(timelineFrameForStepShortcut(",", 0, 5)).toBeNull();
    expect(timelineFrameForStepShortcut(".", 4, 5)).toBeNull();
  });

  it("ignores unrelated keys and timelines with nowhere to move", () => {
    expect(timelineFrameForStepShortcut("/", 2, 5)).toBeNull();
    expect(timelineFrameForStepShortcut(".", 0, 1)).toBeNull();
  });
});

describe("ArtCompositionEditor center shortcut", () => {
  it("uses plain C without overriding copy or typing modifiers", () => {
    const event = (overrides: Partial<KeyboardEvent> = {}) => ({
      altKey: false,
      ctrlKey: false,
      key: "c",
      metaKey: false,
      repeat: false,
      shiftKey: false,
      ...overrides
    } as KeyboardEvent);

    expect(isArtCenterSelectionShortcut(event())).toBe(true);
    expect(isArtCenterSelectionShortcut(event({ metaKey: true }))).toBe(false);
    expect(isArtCenterSelectionShortcut(event({ shiftKey: true }))).toBe(false);
    expect(isArtCenterSelectionShortcut(event({ repeat: true }))).toBe(false);
  });
});

describe("ArtCompositionEditor timeline view shortcut", () => {
  it("resolves only an art-layer frame to its inspector target", () => {
    expect(timelineTargetIdForViewShortcut({ kind: "keyframe", frame: 8, targetId: "joinQrCodeArt" })).toBe("joinQrCodeArt");
    expect(timelineTargetIdForViewShortcut({ kind: "frame", frame: 8 })).toBe("");
    expect(timelineTargetIdForViewShortcut({ kind: "label", frame: 8 })).toBe("");
    expect(timelineTargetIdForViewShortcut({ kind: "command", frame: 8 })).toBe("");
  });
});

describe("ArtCompositionEditor timeline dock sizing", () => {
  it("grows upward, shrinks downward, and respects both bounds", () => {
    expect(artTimelineDockHeightFromPointer(320, 500, 440, 700)).toBe(380);
    expect(artTimelineDockHeightFromPointer(320, 500, 560, 700)).toBe(260);
    expect(artTimelineDockHeightFromPointer(320, 500, 900, 700)).toBe(140);
    expect(artTimelineDockHeightFromPointer(320, 500, 0, 600)).toBe(600);
  });
});

describe("ArtCompositionEditor stage workspace", () => {
  it("uses reserved workspace documents instead of Untitled Prefab compositions", () => {
    expect(createArtWorkspace("stage")).toMatchObject({ id: artWorkspaceId("stage"), name: "Stage", components: [] });
    expect(createArtWorkspace("controller")).toMatchObject({ id: artWorkspaceId("controller"), name: "Controller Stage", components: [] });
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
