import { describe, expect, it, vi } from "vitest";
import { createArtCompositionsController } from "./artCompositionsController";
import type { ArtApi } from "../../api/artApi";
import type { ArtComposition, ArtCompositionSaveResponse } from "../../types/game-data";

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

  it("deletes a composition locally, cascades placed references, and persists on save", async () => {
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

    expect(controller.getState().compositions.map((item) => item.id)).toEqual(["host"]);
    expect(controller.getState().compositions[0].components).toEqual([]);
    expect(controller.getState().compositions[0].timeline?.tracks).toEqual([]);
    expect(controller.getState().dirty).toBe(true);

    await controller.save();

    expect(api.saveArtComposition).toHaveBeenCalledWith("host", expect.anything());
    expect(api.deleteArtComposition).toHaveBeenCalledWith("source");
    expect(controller.getState().dirty).toBe(false);
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
