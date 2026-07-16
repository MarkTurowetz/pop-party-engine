import { describe, expect, it, vi } from "vitest";
import { createArtCompositionsController } from "./artCompositionsController";
import type { ArtApi } from "../../api/artApi";
import { ApiError } from "../../api/http";
import type { ArtComposition, ArtCompositionSaveResponse } from "../../types/game-data";
import {
  applyArtCanvasTransformKeyframes,
  captureArtCanvasTransformTargets,
  translatedArtCanvasPositions
} from "./artCanvasTransformTransaction";

function composition(id: string): ArtComposition {
  return { id, name: id, surface: "stage", timelineArchitectureVersion: 2, canvas: { width: 560, height: 230 }, components: [] };
}

function fakeApi(overrides: Partial<ArtApi> = {}): ArtApi {
  return {
    loadArtAssets: vi.fn(),
    saveArtComposition: vi.fn(
      async (_id: string, comp: ArtComposition) => ({ ok: true, composition: comp }) as unknown as ArtCompositionSaveResponse
    ),
    saveArtOrganization: vi.fn(),
    deleteArtComposition: vi.fn(),
    cleanupArtCompositions: vi.fn(async () => ({
      ok: true,
      compositions: [],
      dependencies: {},
      compositionRevisions: {}
    })),
    replaceArtAsset: vi.fn(),
    ...overrides
  } as ArtApi;
}

describe("createArtCompositionsController", () => {
  it("starts clean with first composition selected", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a"), composition("b")], api: fakeApi() });
    const state = controller.getState();
    expect(state.dirty).toBe(false);
    expect(state.selectedCompositionId).toBe("a");
  });

  it("keeps reserved workspaces outside the library and persists workspace edits", () => {
    const values = new Map<string, string>();
    const workspaceStorage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    };
    const controller = createArtCompositionsController({ initialCompositions: [composition("library")], api: fakeApi(), workspaceStorage });

    controller.selectWorkspace("stage");
    controller.addComponent("shape");

    const state = controller.getState();
    expect(state.selectedCompositionId).toBe("art-workspace-stage");
    expect(state.workspaces.stage.components).toHaveLength(1);
    expect(state.compositions.map((item) => item.id)).toEqual(["library"]);
    expect(state.dirty).toBe(false);
    expect(values.size).toBe(2);
  });

  it("only cleans empty unreferenced assets still named Untitled Prefab", () => {
    const renamed = composition("prefab-untitled-prefab");
    renamed.name = "Voting Card Answer Text";
    const referencedEmpty = composition("referenced-empty");
    referencedEmpty.name = "Untitled Prefab";
    const abandoned = composition("abandoned");
    abandoned.name = "Untitled Prefab";
    const owner = composition("owner");
    owner.components = [{ id: "slot", name: "Slot", kind: "reference", artCompositionId: referencedEmpty.id }] as never;

    const controller = createArtCompositionsController({
      initialCompositions: [renamed, referencedEmpty, abandoned, owner],
      api: fakeApi(),
      workspaceStorage: null
    });

    expect(controller.getState().compositions.map((item) => item.id)).toEqual([renamed.id, referencedEmpty.id, owner.id]);
    expect(controller.getState().dirty).toBe(true);
  });

  it("atomically replaces contiguous workspace layers with an exact-bounds prefab reference", () => {
    const controller = createArtCompositionsController({ initialCompositions: [], api: fakeApi(), workspaceStorage: null });
    controller.selectWorkspace("stage");
    controller.updateComposition("art-workspace-stage", {
      components: [
        { id: "card", name: "Card", instanceLabel: "card", kind: "shape", x: 50, y: 50, width: 20, height: 20 },
        { id: "label", name: "Label", instanceLabel: "label", kind: "text", x: 80, y: 50, width: 20, height: 20 },
        { id: "other", name: "Other", instanceLabel: "other", kind: "shape", x: 120, y: 50, width: 20, height: 20 }
      ] as never,
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [{ name: "Build", frame: 0 }],
        commands: [{ frame: 0, type: "emit", event: "safe" }],
        tracks: [
          { targetId: "card", keyframes: [{ frame: 0, props: { x: 50 } }] },
          { targetId: "label", keyframes: [{ frame: 0, props: { x: 80 } }] },
          { targetId: "other", keyframes: [{ frame: 0, props: { x: 120 } }] }
        ]
      }
    });
    controller.selectComponents(["card", "label"]);

    const result = controller.convertSelectedComponentsToComposition({ name: "Card MC" });

    expect(result?.composition).toMatchObject({ name: "Card MC", compositionKind: "prefab", canvas: { width: 50, height: 20 } });
    const state = controller.getState();
    expect(state.selectedCompositionId).toBe("art-workspace-stage");
    expect(state.workspaces.stage.components.map((item) => item.id)).toEqual([result?.reference.id, "other"]);
    expect(result?.reference).toMatchObject({ artCompositionId: result?.composition.id, x: 65, y: 50, width: 50, height: 20 });
    expect(result?.composition.components.map((item) => item.x)).toEqual([10, 40]);
    expect(state.workspaces.stage.timeline?.tracks.map((track) => track.targetId)).toEqual(["other"]);
    expect(state.workspaces.stage.timeline?.labels).toEqual([{ name: "Build", frame: 0 }]);
    expect(state.workspaces.stage.timeline?.commands).toEqual([{ frame: 0, type: "emit", event: "safe" }]);

    controller.undo();
    expect(controller.getState().compositions).toEqual([]);
    expect(controller.getState().workspaces.stage.components.map((item) => item.id)).toEqual(["card", "label", "other"]);
  });

  it("blocks conversion when a command targets the selection", () => {
    const controller = createArtCompositionsController({ initialCompositions: [], api: fakeApi(), workspaceStorage: null });
    controller.selectWorkspace("stage");
    controller.updateComposition("art-workspace-stage", {
      components: [{ id: "bubble", name: "Bubble", instanceLabel: "answerBubble", kind: "shape", x: 10, y: 10, width: 20, height: 20 }] as never,
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [],
        commands: [{ frame: 0, type: "playComponent", target: "answerBubble", event: "Appear" }],
        tracks: []
      }
    });
    controller.selectComponent("bubble");

    expect(controller.convertSelectedComponentsToComposition({ name: "Bubble MC" })).toBeNull();
    expect(controller.getState().error).toContain("command targets");
    expect(controller.getState().compositions).toEqual([]);
  });

  it("requires contiguous siblings and protects auto-distribution containers", () => {
    const controller = createArtCompositionsController({ initialCompositions: [], api: fakeApi(), workspaceStorage: null });
    controller.selectWorkspace("stage");
    controller.updateComposition("art-workspace-stage", {
      components: [
        { id: "a", name: "A", kind: "shape" },
        { id: "middle", name: "Middle", kind: "shape" },
        { id: "b", name: "B", kind: "shape" },
        {
          id: "row",
          name: "Row",
          kind: "container",
          childDistribution: "horizontal",
          children: [
            { id: "row-a", name: "Row A", kind: "shape" },
            { id: "row-b", name: "Row B", kind: "shape" }
          ]
        }
      ] as never
    });

    controller.selectComponents(["a", "b"]);
    expect(controller.convertSelectedComponentsToComposition({ name: "Gap" })).toBeNull();
    expect(controller.getState().error).toContain("contiguous");

    controller.selectComponents(["row-a", "row-b"]);
    expect(controller.convertSelectedComponentsToComposition({ name: "Distributed" })).toBeNull();
    expect(controller.getState().error).toContain("auto-distribution");
  });

  it("bakes current-frame geometry while preserving nested source compositions", () => {
    const nested = composition("nested-source");
    nested.timeline = {
      fps: 30,
      frameCount: 5,
      labels: [{ name: "Appear", frame: 1 }],
      commands: [{ frame: 1, type: "stop" }],
      tracks: []
    };
    const controller = createArtCompositionsController({ initialCompositions: [nested], api: fakeApi(), workspaceStorage: null });
    controller.selectWorkspace("stage");
    controller.updateComposition("art-workspace-stage", {
      components: [{
        id: "nested-instance",
        name: "Nested",
        instanceLabel: "nested",
        kind: "reference",
        artCompositionId: nested.id,
        x: 50,
        y: 40,
        width: 20,
        height: 10
      }] as never
    });
    controller.selectComponent("nested-instance");

    const result = controller.convertSelectedComponentsToComposition({
      name: "Outer",
      frameOverrides: { "nested-instance": { x: 90, y: 70, scale: 2 } }
    });

    expect(result?.reference).toMatchObject({ x: 90, y: 70, width: 40, height: 20 });
    expect(result?.composition.components[0]).toMatchObject({ artCompositionId: nested.id, x: 20, y: 10, scale: 2 });
    expect(controller.getState().compositions.find((item) => item.id === nested.id)?.timeline).toMatchObject({
      labels: nested.timeline.labels,
      commands: nested.timeline.commands,
      tracks: nested.timeline.tracks
    });
  });

  it("projects the one-time legacy reset as a dirty migration without component timelines", () => {
    const initial = composition("legacy");
    delete initial.timelineArchitectureVersion;
    initial.components = [
      {
        id: "legacy-text",
        name: "Legacy Text",
        kind: "text",
        children: [{ id: "legacy-child", name: "Legacy Child", kind: "shape" }]
      }
    ] as never;

    const controller = createArtCompositionsController({ initialCompositions: [initial], api: fakeApi() });
    const hydrated = controller.getState().compositions[0];

    expect(controller.getState().dirty).toBe(true);
    expect(controller.getState().migrationSummary?.compositionCount).toBe(1);
    expect(hydrated.timeline?.labels.map((label) => label.name)).toEqual(expect.arrayContaining(["Park", "On", "Appear", "Update", "Disappear"]));
    expect(hydrated.components[0].timeline).toBeUndefined();
    expect(hydrated.components[0].children?.[0].timeline).toBeUndefined();
  });

  it("allows reversible Trash staging while a timeline migration is pending", () => {
    const initial = composition("legacy");
    delete initial.timelineArchitectureVersion;
    const controller = createArtCompositionsController({
      initialCompositions: [initial],
      api: fakeApi(),
      workspaceStorage: null,
      trashStorage: null
    });

    expect(controller.getState().migrationSummary).not.toBeNull();
    controller.trashCompositions(["legacy"]);
    expect([...controller.getState().trashedCompositionIds]).toEqual(["legacy"]);

    controller.restoreTrashedComposition("legacy");
    expect([...controller.getState().trashedCompositionIds]).toEqual([]);
    expect(controller.getState().migrationSummary).not.toBeNull();
  });

  it("creates a top-level prefab composition as an undoable local edit", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });

    const created = controller.createComposition("prefab", "stage", "Answer Bubble");

    expect(created.id).toBe("prefab-answer-bubble");
    expect(created.compositionKind).toBe("prefab");
    expect(created.timeline?.labels.map((label) => label.name)).toEqual(expect.arrayContaining(["Park", "On", "Appear", "Update", "Disappear"]));
    expect(controller.getState().selectedCompositionId).toBe(created.id);
    expect(controller.getState().dirtyCompositionIds.has(created.id)).toBe(true);

    controller.undo();

    expect(controller.getState().compositions.some((item) => item.id === created.id)).toBe(false);
    expect(controller.getState().selectedCompositionId).toBe("a");
  });

  it("duplicates a composition as an independent adjacent prefab while preserving child references", () => {
    const source = composition("vip-mc");
    source.name = "VIP MC";
    source.compositionKind = "prefab";
    source.components = [{
      id: "vip-slot",
      name: "VIP Slot",
      instanceLabel: "vipSlot",
      kind: "reference",
      artCompositionId: "vip-widget",
      x: 22,
      y: 11,
      width: 44,
      height: 22
    }] as never;
    source.timeline = {
      fps: 30,
      frameCount: 10,
      labels: [{ name: "On", frame: 1 }],
      commands: [{ frame: 1, type: "playComponent", target: "vip-slot", event: "On" }],
      tracks: [{ targetId: "vip-slot", keyframes: [{ frame: 1, props: { scale: 1.2 } }] }]
    };
    const child = composition("vip-widget");
    const controller = createArtCompositionsController({ initialCompositions: [source, child], api: fakeApi() });

    const duplicate = controller.duplicateComposition(source.id);

    expect(duplicate).toEqual(expect.objectContaining({ name: "VIP MC 1", compositionKind: "prefab" }));
    const state = controller.getState();
    expect(state.compositions.map((item) => item.id).slice(0, 2)).toEqual([source.id, duplicate?.id]);
    const originalSlot = state.compositions[0].components[0];
    const duplicateSlot = state.compositions[1].components[0];
    expect(duplicateSlot.id).not.toBe(originalSlot.id);
    expect(duplicateSlot.artCompositionId).toBe("vip-widget");
    expect(state.compositions[1].timeline?.tracks[0].targetId).toBe(duplicateSlot.id);
    expect(state.compositions[1].timeline?.commands[0].target).toBe(duplicateSlot.id);
    expect(state.selectedCompositionId).toBe(duplicate?.id);

    controller.updateComponent(duplicateSlot.id, { name: "Changed Copy" });
    expect(controller.getState().compositions[0].components[0].name).toBe("VIP Slot");
    expect(controller.getState().compositions[1].components[0].name).toBe("Changed Copy");

    expect(controller.duplicateComposition(source.id)?.name).toBe("VIP MC 2");
  });

  it("adds a component to the root, marks dirty, undoes", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    controller.addComponent("shape");
    expect(controller.getState().compositions[0].components).toHaveLength(1);
    expect(controller.getState().compositions[0].components[0].timeline).toBeUndefined();
    expect(controller.getState().dirty).toBe(true);
    expect(controller.getState().dirtyCompositionIds.has("a")).toBe(true);
    controller.undo();
    expect(controller.getState().compositions[0].components).toHaveLength(0);
    expect(controller.getState().dirty).toBe(false);
  });

  it("creates new shapes with visible Party Game defaults", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });

    controller.addComponent("shape");

    expect(controller.getState().compositions[0].components[0]).toMatchObject({
      shapeStyle: "rounded",
      fillColor: "#fff8d6",
      borderColor: "#17131f",
      borderWidth: 5,
      borderRadius: 16
    });
  });

  it("nests a component into a selected container", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    controller.addComponent("container");
    const containerId = controller.getState().compositions[0].components[0].id;
    controller.selectComponent(containerId);
    controller.addComponent("text");
    const container = controller.getState().compositions[0].components[0];
    expect(container.children).toHaveLength(1);
    expect(container.children?.[0].kind).toBe("text");
    expect(container.children?.[0].timeline).toBeUndefined();
  });

  it("keeps consecutively added composition references as independent sibling layers", () => {
    const host = composition("host");
    const vip = composition("vip-mc");
    vip.name = "VIP MC";
    vip.compositionKind = "prefab";
    const bubble = composition("answer-bubble-mc");
    bubble.name = "Player Answer Bubble MC";
    bubble.compositionKind = "prefab";
    const avatar = composition("stego-avatar");
    avatar.name = "Stego Avatar";
    avatar.compositionKind = "gameObject";
    const controller = createArtCompositionsController({ initialCompositions: [host, vip, bubble, avatar], api: fakeApi() });

    const vipInstance = controller.addComponent("reference", { referencedCompositionId: vip.id, x: -50, y: 0 });
    const bubbleInstance = controller.addComponent("reference", { referencedCompositionId: bubble.id, x: 0, y: 0 });
    const avatarInstance = controller.addComponent("reference", { referencedCompositionId: avatar.id, x: 50, y: 0 });

    const components = controller.getState().compositions[0].components;
    expect(components).toHaveLength(3);
    expect(components.map((component) => component.artCompositionId)).toEqual([vip.id, bubble.id, avatar.id]);
    expect(components.every((component) => component.children?.length === 0)).toBe(true);

    controller.updateComponent(vipInstance?.id || "", { x: -75 });
    controller.updateComponent(bubbleInstance?.id || "", { x: -50 });

    const updated = controller.getState().compositions[0].components;
    expect(updated.find((component) => component.id === vipInstance?.id)?.x).toBe(-75);
    expect(updated.find((component) => component.id === bubbleInstance?.id)?.x).toBe(-50);
    expect(updated.find((component) => component.id === avatarInstance?.id)?.x).toBe(50);
  });

  it("commits a group transform as one undoable composition update", () => {
    const host = composition("host");
    host.components = [
      { id: "vip", name: "VIP", kind: "reference", x: -50, y: 0, width: 44, height: 22 },
      { id: "bubble", name: "Bubble", kind: "reference", x: 0, y: 0, width: 300, height: 180 }
    ] as never;
    const controller = createArtCompositionsController({ initialCompositions: [host], api: fakeApi() });
    const targets = captureArtCanvasTransformTargets(host.components, new Set(["vip", "bubble"]), () => ({}));
    const positions = translatedArtCanvasPositions(targets, 20, 10);
    const timeline = applyArtCanvasTransformKeyframes(
      host.timeline,
      targets.map((target) => ({ target, patch: positions[target.id] })),
      0
    );

    controller.updateComposition(host.id, { timeline });

    expect(controller.getState().compositions[0].timeline?.tracks).toHaveLength(2);
    expect(controller.getState().canUndo).toBe(true);
    controller.undo();
    expect(controller.getState().compositions[0].timeline?.tracks).toEqual([]);
  });

  it("adds a prefab reference component with the referenced composition dimensions", () => {
    const prefab = composition("answer-bubble");
    prefab.name = "Answer Bubble";
    prefab.compositionKind = "prefab";
    prefab.canvas = { width: 300, height: 180 };
    const host = composition("host");
    const controller = createArtCompositionsController({ initialCompositions: [host, prefab], api: fakeApi() });

    controller.addComponent("reference");

    const reference = controller.getState().compositions[0].components[0];
    expect(reference.kind).toBe("reference");
    expect(reference.artCompositionId).toBe("answer-bubble");
    expect(reference.name).toBe("Answer Bubble");
    expect(reference.width).toBe(300);
    expect(reference.height).toBe(180);
    expect(reference.timeline).toBeUndefined();
  });

  it("sizes a dropped prefab reference from its visible frame-zero values", () => {
    const prefab = composition("voting-card-answer");
    prefab.name = "Voting Card Answer";
    prefab.compositionKind = "prefab";
    prefab.components = [
      { id: "answer", name: "Answer", kind: "text", x: 110, y: 30, width: 220, height: 60 }
    ] as never;
    prefab.timeline = {
      fps: 30,
      frameCount: 2,
      labels: [],
      commands: [],
      tracks: [{ targetId: "answer", keyframes: [{ frame: 0, props: { x: 210, y: 39, width: 420, height: 78 } }] }]
    };
    const host = composition("host");
    const controller = createArtCompositionsController({ initialCompositions: [host, prefab], api: fakeApi() });

    controller.addComponent("reference", { referencedCompositionId: prefab.id });

    const reference = controller.getState().compositions[0].components[0];
    expect(reference.artCompositionId).toBe(prefab.id);
    expect(reference.width).toBe(420);
    expect(reference.height).toBe(78);
  });

  it("refreshes inherited reference bounds and matching keyframes when the source changes", () => {
    const source = composition("voting-card-answer-text");
    source.components = [{ id: "text", name: "Text", kind: "text", x: 110, y: 30, width: 220, height: 60 }] as never;
    const parent = composition("voting-card-answer");
    parent.components = [
      { id: "answer-text", name: "Answer Text", kind: "reference", artCompositionId: source.id, x: 0, y: 0, width: 220, height: 60 }
    ] as never;
    parent.timeline = {
      fps: 30,
      frameCount: 2,
      labels: [],
      commands: [],
      tracks: [{ targetId: "answer-text", keyframes: [{ frame: 0, props: { width: 220, height: 60, scale: 1 } }] }]
    };
    const grandparent = composition("voting-card");
    grandparent.components = [
      { id: "answer", name: "Answer", kind: "reference", artCompositionId: parent.id, x: 0, y: 0, width: 220, height: 60 }
    ] as never;
    const controller = createArtCompositionsController({ initialCompositions: [parent, source, grandparent], api: fakeApi() });

    controller.selectComposition(source.id);
    controller.updateComposition(source.id, {
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [],
        commands: [],
        tracks: [{ targetId: "text", keyframes: [{ frame: 0, props: { x: 210, y: 39, width: 420, height: 78 } }] }]
      }
    });

    const state = controller.getState();
    const refreshedParent = state.compositions.find((item) => item.id === parent.id);
    const refreshedGrandparent = state.compositions.find((item) => item.id === grandparent.id);
    expect(refreshedParent?.components[0]).toMatchObject({ width: 420, height: 78 });
    expect(refreshedParent?.timeline?.tracks[0].keyframes[0].props).toMatchObject({ width: 420, height: 78, scale: 1 });
    expect(refreshedGrandparent?.components[0]).toMatchObject({ width: 420, height: 78 });
    expect(state.dirtyCompositionIds).toEqual(new Set([parent.id, source.id, grandparent.id]));
  });

  it("repairs stale loaded reference and keyframe dimensions from the current source", () => {
    const source = composition("voting-card-answer-text");
    source.components = [
      { id: "shape", name: "Shape", kind: "shape", x: 0, y: 0, width: 180, height: 96 },
      { id: "text", name: "Text", kind: "text", x: 0, y: 0, width: 220, height: 60 }
    ] as never;
    source.timeline = {
      fps: 30,
      frameCount: 3,
      labels: [],
      commands: [],
      tracks: [
        { targetId: "shape", keyframes: [{ frame: 0, props: { x: 0, y: 0, width: 520, height: 150 } }] },
        { targetId: "text", keyframes: [{ frame: 0, props: { x: 0, y: 0, width: 420, height: 78 } }] }
      ]
    };
    const parent = composition("voting-card-answer");
    parent.components = [
      { id: "answer-text", name: "Answer Text", kind: "reference", artCompositionId: source.id, x: 0, y: 0, width: 220, height: 60 }
    ] as never;
    parent.timeline = {
      fps: 30,
      frameCount: 2,
      labels: [],
      commands: [],
      tracks: [{ targetId: "answer-text", keyframes: [{ frame: 0, props: { width: 420, height: 78, scale: 1 } }] }]
    };
    const controller = createArtCompositionsController({ initialCompositions: [parent, source], api: fakeApi() });

    const state = controller.getState();
    const repairedParent = state.compositions.find((item) => item.id === parent.id);
    expect(repairedParent?.components[0]).toMatchObject({ width: 520, height: 150 });
    expect(repairedParent?.timeline?.tracks[0].keyframes[0].props).toMatchObject({ width: 520, height: 150, scale: 1 });
    expect(state.dirtyCompositionIds).toEqual(new Set([parent.id]));
  });

  it("sizes nested references from tight visual content instead of the editor canvas", () => {
    const vip = composition("player-vip-widget");
    vip.name = "Player VIP Widget";
    vip.compositionKind = "gameObject";
    vip.canvas = { width: 52, height: 28 };
    vip.components = [
      { id: "vip-card", name: "VIP Card", kind: "shape", x: 22, y: 11, width: 44, height: 22 }
    ] as never;
    const vipMc = composition("prefab-vip-mc");
    vipMc.name = "VIP MC";
    vipMc.compositionKind = "prefab";
    vipMc.canvas = { width: 560, height: 230 };
    vipMc.components = [
      {
        id: "vip-widget-reference",
        name: "Player VIP Widget",
        kind: "reference",
        artCompositionId: vip.id,
        x: 0,
        y: 0,
        width: 44,
        height: 22
      }
    ] as never;
    const host = composition("host");
    const controller = createArtCompositionsController({ initialCompositions: [host, vip, vipMc], api: fakeApi() });

    controller.addComponent("reference", { referencedCompositionId: vipMc.id });

    expect(controller.getState().compositions[0].components[0]).toEqual(
      expect.objectContaining({ artCompositionId: vipMc.id, width: 44, height: 22 })
    );
  });

  it("adds an explicit composition reference as a nested child at the requested position", () => {
    const prefab = composition("answer-bubble");
    prefab.name = "Answer Bubble";
    prefab.compositionKind = "prefab";
    prefab.canvas = { width: 300, height: 180 };
    const controller = createArtCompositionsController({ initialCompositions: [composition("host"), prefab], api: fakeApi() });

    const parent = controller.addComponent("container");
    controller.addComponent("reference", {
      parentComponentId: parent?.id,
      referencedCompositionId: "answer-bubble",
      x: 42,
      y: 21
    });

    const child = controller.getState().compositions[0].components[0].children?.[0];
    expect(child).toEqual(
      expect.objectContaining({
        kind: "reference",
        artCompositionId: "answer-bubble",
        name: "Answer Bubble",
        x: 42,
        y: 21,
        width: 300,
        height: 180
      })
    );
  });

  it("rejects transitive prefab reference cycles", () => {
    const a = composition("a");
    const b = composition("b");
    b.components = [{ id: "b-to-a", instanceLabel: "aRef", name: "A", kind: "reference", artCompositionId: "a" }];
    const controller = createArtCompositionsController({ initialCompositions: [a, b], api: fakeApi() });

    expect(controller.addComponent("reference", { referencedCompositionId: "b" })).toBeNull();
    expect(controller.getState().compositions[0].components).toEqual([]);
    expect(controller.getState().error).toContain("cycle");
  });

  it("creates a prefab from selected components without sharing component ids", () => {
    const initial = composition("stage");
    initial.components = [
      { id: "card", name: "Card", kind: "shape", x: 100, y: 60, width: 200, height: 80 },
      { id: "label", name: "Label", kind: "text", x: 100, y: 60, width: 160, height: 40 }
    ] as never;
    const controller = createArtCompositionsController({ initialCompositions: [initial], api: fakeApi() });

    const prefab = controller.createPrefabFromComponents("stage", ["card", "label"], "Card Prefab");

    expect(prefab).toEqual(expect.objectContaining({ name: "Card Prefab", compositionKind: "prefab" }));
    const created = controller.getState().compositions.find((item) => item.id === prefab?.id);
    expect(created?.components).toHaveLength(2);
    expect(created?.components.map((component) => component.id)).not.toContain("card");
    expect(created?.components.map((component) => component.id)).not.toContain("label");
    expect(created?.canvas.width).toBeGreaterThanOrEqual(280);
    expect(controller.getState().selectedCompositionId).toBe(prefab?.id);
  });

  it("refreshes reference overrides when the referenced prefab changes", () => {
    const first = composition("first");
    first.compositionKind = "prefab";
    first.canvas = { width: 100, height: 50 };
    const second = composition("second");
    second.name = "Second Prefab";
    second.compositionKind = "prefab";
    second.canvas = { width: 420, height: 210 };
    const controller = createArtCompositionsController({ initialCompositions: [composition("host"), first, second], api: fakeApi() });

    controller.addComponent("reference");
    const referenceId = controller.getState().compositions[0].components[0].id;
    controller.updateComponent(referenceId, { artCompositionId: "second" } as never);

    const reference = controller.getState().compositions[0].components[0];
    expect(reference.artCompositionId).toBe("second");
    expect(reference.name).toBe("Second Prefab");
    expect(reference.width).toBe(420);
    expect(reference.height).toBe(210);
  });

  it("swaps a referenced game object while preserving every authored instance property and timeline target", () => {
    const host = composition("host");
    host.compositionKind = "prefab";
    host.components = [{
      id: "slot",
      name: "VIP Slot",
      instanceLabel: "vipSlot",
      kind: "reference",
      artCompositionId: "first",
      x: 41,
      y: 72,
      width: 133,
      height: 47,
      scale: 1.2,
      rotation: 18,
      opacity: 0.75,
      visible: false,
      transformOrigin: "bottomRight",
      locked: true,
      defaultAnimationState: "Appear"
    }] as never;
    host.timeline = {
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [],
      tracks: [{ targetId: "slot", keyframes: [{ frame: 4, props: { scale: 1.4 }, easing: "easeOut" }] }]
    };
    const first = composition("first");
    first.name = "First Game Object";
    first.compositionKind = "gameObject";
    first.canvas = { width: 20, height: 10 };
    const second = composition("second");
    second.name = "Second Game Object";
    second.compositionKind = "gameObject";
    second.canvas = { width: 500, height: 300 };
    const controller = createArtCompositionsController({ initialCompositions: [host, first, second], api: fakeApi() });
    const before = JSON.parse(JSON.stringify(controller.getState().compositions[0]));

    controller.swapReferenceGameObject("slot", "second");

    const after = controller.getState().compositions[0];
    expect(after.components[0]).toEqual({ ...before.components[0], artCompositionId: "second" });
    expect(after.timeline).toEqual(before.timeline);
    expect(after.components[0].name).toBe("VIP Slot");
    expect(after.components[0].instanceLabel).toBe("vipSlot");
    expect(after.components[0].width).toBe(133);
    expect(after.components[0].height).toBe(47);
    expect(controller.getState().canUndo).toBe(true);

    controller.undo();
    expect(controller.getState().compositions[0]).toEqual(before);
  });

  it("allows a selected reference to swap to a prefab", () => {
    const host = composition("host");
    host.compositionKind = "prefab";
    host.components = [{ id: "slot", name: "Slot", kind: "reference", artCompositionId: "first" }] as never;
    const first = composition("first");
    first.compositionKind = "gameObject";
    const replacement = composition("replacement");
    replacement.compositionKind = "prefab";
    const controller = createArtCompositionsController({ initialCompositions: [host, first, replacement], api: fakeApi() });

    controller.swapReferenceGameObject("slot", "replacement");

    expect(controller.getState().compositions[0].components[0].artCompositionId).toBe("replacement");
    expect(controller.getState().error).toBeNull();
  });

  it("publishes a new compositions array for every mutation so dependent library views refresh", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    const before = controller.getState().compositions;

    controller.updateComposition("a", { name: "Renamed" });

    expect(controller.getState().compositions).not.toBe(before);
    expect(controller.getState().compositions[0].name).toBe("Renamed");
  });

  it("updates a component property and removes it", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    controller.addComponent("shape");
    const id = controller.getState().compositions[0].components[0].id;
    controller.updateComponent(id, { name: "Renamed", fillColor: "#ff0000" } as never);
    expect(controller.getState().compositions[0].components[0].name).toBe("Renamed");
    controller.selectComponent(id);
    controller.removeSelectedComponents();
    expect(controller.getState().compositions[0].components).toHaveLength(0);
  });

  it("renames code-facing instance labels while rejecting invalid or duplicate names with feedback", () => {
    const initial = composition("a");
    initial.components = [
      { id: "left", name: "Left Container", instanceLabel: "leftContainer", kind: "container" },
      { id: "right", name: "Right Container", instanceLabel: "rightContainer", kind: "container" }
    ] as never;
    const controller = createArtCompositionsController({ initialCompositions: [initial], api: fakeApi() });

    controller.updateComponent("left", { instanceLabel: "containerLeft" });
    expect(controller.getState().compositions[0].components[0].instanceLabel).toBe("containerLeft");
    expect(controller.getState().error).toBeNull();

    controller.updateComponent("left", { instanceLabel: "container left" });
    expect(controller.getState().compositions[0].components[0].instanceLabel).toBe("containerLeft");
    expect(controller.getState().error).toContain("unique lower-camel identifier");

    controller.updateComponent("left", { instanceLabel: "rightContainer" });
    expect(controller.getState().compositions[0].components[0].instanceLabel).toBe("containerLeft");
    expect(controller.getState().error).toContain("unique lower-camel identifier");
  });

  it("removes selected component descendants plus their tracks and nested commands", () => {
    const initial = composition("a");
    initial.components = [{
      id: "bubble",
      name: "Bubble",
      kind: "reference",
      artCompositionId: "bubble-source",
      children: [{ id: "bubble-child", name: "Child", kind: "shape" }]
    }] as never;
    initial.timeline = {
      fps: 30,
      frameCount: 10,
      labels: [],
      commands: [{ frame: 1, type: "playComponent", target: "bubble", event: "Appear" }],
      tracks: [
        { targetId: "bubble", keyframes: [{ frame: 1, props: { x: 10 } }] },
        { targetId: "bubble-child", keyframes: [{ frame: 1, props: { x: 20 } }] }
      ]
    };
    const controller = createArtCompositionsController({ initialCompositions: [initial], api: fakeApi() });

    controller.selectComponent("bubble");
    controller.removeSelectedComponents();

    expect(controller.getState().compositions[0].components).toEqual([]);
    expect(controller.getState().compositions[0].timeline?.tracks).toEqual([]);
    expect(controller.getState().compositions[0].timeline?.commands.some((command) => command.type === "playComponent")).toBe(false);
    controller.undo();
    expect(controller.getState().compositions[0].components[0].id).toBe("bubble");
  });

  it("moves a composition to Trash without destroying its references and requires review before save", async () => {
    const api = fakeApi();
    const source = composition("source");
    source.compositionKind = "prefab";
    const host = composition("host");
    host.components = [{ id: "source-instance", name: "Source", kind: "reference", artCompositionId: "source" }] as never;
    host.timeline = {
      fps: 30,
      frameCount: 10,
      labels: [],
      commands: [{ frame: 1, type: "playComponent", target: "source-instance", event: "Appear" }],
      tracks: [{ targetId: "source-instance", keyframes: [{ frame: 1, props: { scale: 1 } }] }]
    };
    const controller = createArtCompositionsController({ initialCompositions: [host, source], api });
    controller.selectComposition("source");

    controller.removeSelectedComposition();

    expect(controller.getState().compositions.map((item) => item.id)).toEqual(["host", "source"]);
    expect([...controller.getState().trashedCompositionIds]).toEqual(["source"]);
    expect(controller.getState().compositions[0].components).toHaveLength(1);
    expect(controller.getState().compositions[0].timeline?.tracks).toHaveLength(1);
    expect(controller.getState().dirty).toBe(true);

    expect(await controller.save()).toBe(false);
    expect(controller.getState().error).toContain("Review 1 trashed asset");
    expect(api.saveArtComposition).not.toHaveBeenCalled();
    expect(api.cleanupArtCompositions).not.toHaveBeenCalled();

    controller.restoreTrashedComposition("source");
    expect([...controller.getState().trashedCompositionIds]).toEqual([]);
    expect(controller.getState().dirty).toBe(false);
  });

  it("permanently deletes reviewed Trash as one atomic cleanup request", async () => {
    const source = composition("source");
    source.compositionKind = "prefab";
    const survivor = composition("survivor");
    const cleanupArtCompositions = vi.fn(async () => ({
      ok: true as const,
      compositions: [survivor],
      dependencies: {
        survivor: {
          compositionId: "survivor",
          total: 0,
          artReferences: 0,
          stageLayoutReferences: 0,
          controllerLayoutReferences: 0,
          flowReferences: 0,
          runtimeReferences: 0,
          details: []
        }
      },
      compositionRevisions: { survivor: "survivor-revision" }
    }));
    const api = fakeApi({ cleanupArtCompositions });
    const controller = createArtCompositionsController({
      initialCompositions: [survivor, source],
      initialCompositionRevisions: { survivor: "survivor-revision", source: "source-revision" },
      api,
      workspaceStorage: null,
      trashStorage: null
    });
    controller.trashCompositions(["source"]);

    expect(await controller.save({ commitTrash: true })).toBe(true);

    expect(cleanupArtCompositions).toHaveBeenCalledTimes(1);
    expect(cleanupArtCompositions).toHaveBeenCalledWith({
      deleteCompositionIds: ["source"],
      expectedCompositionRevisions: { source: "source-revision" }
    });
    expect(controller.getState().compositions.map((item) => item.id)).toEqual(["survivor"]);
    expect([...controller.getState().trashedCompositionIds]).toEqual([]);
    expect(controller.getState().dirty).toBe(false);
  });

  it("keeps reviewed Trash staged when the server reports a changed target", async () => {
    const source = composition("source");
    const dependency = {
      compositionId: "source",
      total: 1,
      artReferences: 0,
      stageLayoutReferences: 0,
      controllerLayoutReferences: 0,
      flowReferences: 0,
      runtimeReferences: 1,
      details: [{ kind: "runtime" as const, sourceName: "Changed runtime" }]
    };
    const cleanupArtCompositions = vi.fn(async () => {
      throw new ApiError("Some trashed assets changed elsewhere", {
        status: 409,
        payload: {
          dependencies: { source: dependency },
          compositionRevisions: { source: "new-revision" }
        }
      });
    });
    const controller = createArtCompositionsController({
      initialCompositions: [source],
      initialCompositionRevisions: { source: "old-revision" },
      api: fakeApi({ cleanupArtCompositions }),
      workspaceStorage: null,
      trashStorage: null
    });
    controller.trashCompositions(["source"]);

    expect(await controller.save({ commitTrash: true })).toBe(false);
    expect([...controller.getState().trashedCompositionIds]).toEqual(["source"]);
    expect(controller.getState().compositionRevisions.source).toBe("new-revision");
    expect(controller.getState().dependencyReport.source).toEqual(dependency);
    expect(controller.getState().error).toContain("changed elsewhere");
  });

  it("shows the exact composition validation issues returned by the server", async () => {
    const saveArtComposition = vi.fn(async () => {
      throw new ApiError("Art composition validation failed", {
        status: 409,
        payload: {
          issues: [
            { compositionId: "crafting-timer-widget", code: "missing-instance-label", message: "Missing instance label: timer-value" },
            { compositionId: "crafting-timer-widget", code: "missing-instance-label", message: "Missing instance label: timer-ring" }
          ]
        }
      });
    });
    const controller = createArtCompositionsController({
      initialCompositions: [composition("stage-code-panel")],
      api: fakeApi({ saveArtComposition }),
      workspaceStorage: null
    });
    controller.updateComposition("stage-code-panel", { description: "Changed" });

    expect(await controller.save()).toBe(false);
    expect(controller.getState().error).toContain("crafting-timer-widget: Missing instance label: timer-value");
    expect(controller.getState().error).toContain("crafting-timer-widget: Missing instance label: timer-ring");
  });

  it("reorders root and nested component siblings with undo support", () => {
    const initial = composition("a");
    initial.components = [
      { id: "one", name: "One", kind: "shape" },
      {
        id: "group",
        name: "Group",
        kind: "container",
        children: [
          { id: "child-a", name: "Child A", kind: "shape" },
          { id: "child-b", name: "Child B", kind: "shape" },
          { id: "child-c", name: "Child C", kind: "shape" }
        ]
      },
      { id: "two", name: "Two", kind: "shape" }
    ] as never;
    const controller = createArtCompositionsController({ initialCompositions: [initial], api: fakeApi() });

    controller.reorderComponent("two", "one", "before");
    expect(controller.getState().compositions[0].components.map((component) => component.id)).toEqual(["two", "one", "group"]);

    controller.reorderComponent("child-c", "child-a", "after");
    expect(controller.getState().compositions[0].components[2].children?.map((component) => component.id)).toEqual([
      "child-a",
      "child-c",
      "child-b"
    ]);

    controller.reorderComponent("child-a", "one", "after");
    expect(controller.getState().compositions[0].components[2].children?.map((component) => component.id)).toEqual([
      "child-a",
      "child-c",
      "child-b"
    ]);

    controller.undo();
    expect(controller.getState().compositions[0].components[2].children?.map((component) => component.id)).toEqual([
      "child-a",
      "child-b",
      "child-c"
    ]);
  });

  it("persists component lock changes through save payloads", async () => {
    const api = fakeApi();
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api });
    controller.addComponent("shape");
    const id = controller.getState().compositions[0].components[0].id;
    controller.updateComponent(id, { locked: true } as never);

    await controller.save();

    expect(api.saveArtComposition).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({
        components: [expect.objectContaining({ id, locked: true })]
      })
    );
  });

  it("persists composition tracks and strips obsolete component-local timelines", async () => {
    const api = fakeApi();
    const initial = composition("timeline-host");
    initial.timeline = {
      fps: 30,
      frameCount: 12,
      labels: [{ name: "pulse", frame: 1 }],
      commands: [{ frame: 11, type: "stop" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 1, props: { scale: 1.2 } }] }]
    };
    initial.components = [
      {
        id: "card",
        name: "Card",
        kind: "container",
        timeline: {
          fps: 30,
          frameCount: 8,
          labels: [{ name: "pop", frame: 2 }],
          commands: [{ frame: 7, type: "stop" }],
          tracks: [{ targetId: "name", keyframes: [{ frame: 2, props: { opacity: 1 } }] }]
        },
        children: [
          {
            id: "name",
            name: "Name",
            kind: "text",
            timeline: {
              fps: 24,
              frameCount: 4,
              labels: [{ name: "swap", frame: 1 }],
              commands: [{ frame: 3, type: "stop" }],
              tracks: [{ targetId: "name", keyframes: [{ frame: 1, props: { defaultText: "Ava" } }] }]
            }
          }
        ]
      }
    ] as never;
    const controller = createArtCompositionsController({ initialCompositions: [initial], api });
    controller.updateComposition("timeline-host", { description: "dirty" });

    await controller.save();

    expect(api.saveArtComposition).toHaveBeenCalledWith(
      "timeline-host",
      expect.objectContaining({
        timeline: expect.objectContaining({
          labels: expect.arrayContaining([expect.objectContaining({ name: "pulse", frame: 1 })])
        }),
        components: [
          expect.objectContaining({
            id: "card",
            children: [
              expect.objectContaining({
                id: "name"
              })
            ]
          })
        ]
      })
    );
    const saved = vi.mocked(api.saveArtComposition).mock.calls[0][1];
    expect(saved.components[0].timeline).toBeUndefined();
    expect(saved.components[0].children?.[0].timeline).toBeUndefined();
  });

  it("saves only dirty compositions and clears dirty", async () => {
    const api = fakeApi();
    const controller = createArtCompositionsController({ initialCompositions: [composition("a"), composition("b")], api });
    controller.addComponent("shape");
    const ok = await controller.save();
    expect(ok).toBe(true);
    expect(api.saveArtComposition).toHaveBeenCalledTimes(1);
    expect(api.saveArtComposition).toHaveBeenCalledWith("a", expect.anything());
    expect(controller.getState().dirty).toBe(false);
  });

  it("saves every dirty composition in one atomic manifest batch", async () => {
    const saveArtCompositions = vi.fn(async (compositions: ArtComposition[]) => ({
      ok: true as const,
      compositions,
      compositionRevisions: Object.fromEntries(compositions.map((item) => [item.id, `${item.id}-revision`]))
    }));
    const api = fakeApi({ saveArtCompositions });
    const controller = createArtCompositionsController({ initialCompositions: [composition("a"), composition("b")], api });
    controller.updateComposition("a", { description: "Changed A" });
    controller.updateComposition("b", { description: "Changed B" });

    expect(await controller.save()).toBe(true);

    expect(saveArtCompositions).toHaveBeenCalledTimes(1);
    expect(saveArtCompositions.mock.calls[0][0].map((item) => item.id)).toEqual(["a", "b"]);
    expect(api.saveArtComposition).not.toHaveBeenCalled();
    expect(controller.getState().dirty).toBe(false);
  });

  it("saves created composition metadata", async () => {
    const api = fakeApi();
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api });
    const created = controller.createComposition("gameObject", "controller", "Score Popup");

    await controller.save();

    expect(api.saveArtComposition).toHaveBeenCalledWith(
      created.id,
      expect.objectContaining({
        name: "Score Popup",
        surface: "controller",
        compositionKind: "gameObject",
        isCustom: true
      })
    );
  });

  it("publishes composition edits as a session draft", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const controller = createArtCompositionsController({
        initialCompositions: [composition("a")],
        api: fakeApi(),
        postDraft,
        draftPublishDelayMs: 1
      });

      controller.addComponent("shape");
      await vi.advanceTimersByTimeAsync(1);

      expect(postDraft).toHaveBeenLastCalledWith({
        artCompositions: [expect.objectContaining({ id: "a", components: [expect.objectContaining({ kind: "shape" })] })]
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
