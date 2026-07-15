import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartyGameArtObject, artRuntimeInitialAnimation } from "./stageArtObjectVisuals";
import { effectiveVisibilityTimeline } from "./effectiveTimeline";

describe("PartyGameArtObject (ported art-object-visuals)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes the renderer + view classes and helpers", () => {
    expect(PartyGameArtObject.ArtObjectTreeRenderer).toBeTypeOf("function");
    expect(PartyGameArtObject.ArtObjectView).toBeTypeOf("function");
    expect(PartyGameArtObject.applyComponentLayout).toBeTypeOf("function");
    expect(PartyGameArtObject.renderComponentText).toBeTypeOf("function");
    expect(PartyGameArtObject.syncComponentElement).toBeTypeOf("function");
  });

  it("always constructs runtime art at Off until an animation is explicitly played", () => {
    expect(artRuntimeInitialAnimation()).toBe("Off");
  });

  it("reveals a rendered tree through the fallback timeline On command", () => {
    const visibility: boolean[] = [];
    const renderer = Object.create(PartyGameArtObject.ArtObjectTreeRenderer.prototype) as {
      views: Map<string, { setVisibleTree: (visible: boolean) => void }>;
      rootTimelinePlayer: unknown;
      updateRootTimeline: (timeline: unknown) => void;
      playAll: (animation: string, options?: unknown) => number;
    };
    renderer.views = new Map([["child", { setVisibleTree: (visible) => visibility.push(visible) }]]);
    renderer.rootTimelinePlayer = null;
    renderer.updateRootTimeline(effectiveVisibilityTimeline(null));

    renderer.playAll("On", { instant: true });

    expect(visibility).toEqual([true]);
  });

  it("applies persisted transform origins to runtime art objects", () => {
    const globals = globalThis as typeof globalThis & { PartyGameArtComponentSchema?: Record<string, unknown> };
    const previousSchema = globals.PartyGameArtComponentSchema;
    const properties = new Map<string, string>();
    const style = {
      setProperty: (name: string, value: string) => properties.set(name, value),
      transformOrigin: ""
    } as unknown as CSSStyleDeclaration;
    globals.PartyGameArtComponentSchema = {
      normalizeComponentKind: (kind: unknown) => String(kind || "shape"),
      componentLabel: () => "",
      normalizeFillCss: () => "",
      normalizeImageObjectFit: () => "cover",
      transformOriginCss: (value: unknown) => value === "bottomRight" ? "100% 100%" : "50% 50%"
    };
    try {
      PartyGameArtObject.applyComponentLayout(
        { style } as unknown as HTMLElement,
        { id: "card", kind: "shape", x: 50, y: 50, width: 100, height: 60, transformOrigin: "bottomRight" },
        { width: 200, height: 100 }
      );
      expect(style.transformOrigin).toBe("100% 100%");
    } finally {
      globals.PartyGameArtComponentSchema = previousSchema;
    }
  });

  it("lays out referenced children against a tight content view box", () => {
    const globals = globalThis as typeof globalThis & { PartyGameArtComponentSchema?: Record<string, unknown> };
    const previousSchema = globals.PartyGameArtComponentSchema;
    const style = { setProperty: vi.fn() } as unknown as CSSStyleDeclaration;
    globals.PartyGameArtComponentSchema = {
      normalizeComponentKind: (kind: unknown) => String(kind || "shape"),
      componentLabel: () => "",
      normalizeFillCss: () => "",
      normalizeImageObjectFit: () => "cover",
      transformOriginCss: () => "50% 50%"
    };
    try {
      PartyGameArtObject.applyComponentLayout(
        { style } as unknown as HTMLElement,
        { id: "vip", kind: "shape", x: 22, y: 11, width: 44, height: 22 },
        { width: 44, height: 22, minX: 0, minY: 0 }
      );
      expect(style.left).toBe("50%");
      expect(style.top).toBe("50%");
      expect(style.width).toBe("100%");
      expect(style.height).toBe("100%");
    } finally {
      globals.PartyGameArtComponentSchema = previousSchema;
    }
  });

  it("renderComponentText returns null without a target", () => {
    expect(PartyGameArtObject.renderComponentText(null, { id: "x" })).toBe(null);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameArtObject?: unknown };
    expect(host.PartyGameArtObject).toBeTypeOf("object");
  });

  it("routes parent timeline snapshots to descendant component views", () => {
    const snapshots: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      applyTimelineSnapshotToDescendants: (snapshot: unknown) => void;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      createVisual: () => { applyTimelineSnapshot: (snapshot: unknown) => void };
    };
    parent.component = { id: "parent" };
    child.component = { id: "child" };
    child.children = new Map();
    child.createVisual = () => ({ applyTimelineSnapshot: (snapshot) => snapshots.push(snapshot) });
    parent.children = new Map([["child", child]]);

    const snapshot = { frame: 2, targets: { parent: { opacity: 0.5 }, child: { x: 24 } } };
    parent.applyTimelineSnapshotToDescendants(snapshot);

    expect(snapshots).toEqual([snapshot]);
  });

  it("routes referenced timeline snapshots past a same-id wrapper to the nested component", () => {
    const snapshots: unknown[] = [];
    const reference = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      applyTimelineSnapshotToDescendants: (snapshot: unknown) => void;
    };
    const sprite = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      createVisual: () => { applyTimelineSnapshot: (snapshot: unknown) => void };
    };
    reference.component = { id: "avatar" };
    sprite.component = { id: "avatar" };
    sprite.children = new Map();
    sprite.createVisual = () => ({ applyTimelineSnapshot: (snapshot) => snapshots.push(snapshot) });
    reference.children = new Map([["avatar", sprite]]);

    const snapshot = { frame: 3, targets: { avatar: { imageAssetId: "avatar-raptor" } } };
    reference.applyTimelineSnapshotToDescendants(snapshot);

    expect(snapshots).toEqual([snapshot]);
  });

  it("routes parent timeline snapshots by scoped component path", () => {
    const snapshots: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      componentPath: string[];
      children: Map<string, unknown>;
      applyTimelineSnapshotToDescendants: (snapshot: unknown) => void;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      componentPath: string[];
      children: Map<string, unknown>;
      createVisual: () => { applyTimelineSnapshot: (snapshot: unknown) => void };
    };
    parent.component = { id: "player" };
    parent.componentPath = ["player"];
    child.component = { id: "answer-text" };
    child.componentPath = ["player", "bubble", "answer-text"];
    child.children = new Map();
    child.createVisual = () => ({ applyTimelineSnapshot: (snapshot) => snapshots.push(snapshot) });
    parent.children = new Map([["answer-text", child]]);

    const snapshot = { frame: 2, targets: { "player/bubble/answer-text": { defaultText: "Scoped" } } };
    parent.applyTimelineSnapshotToDescendants(snapshot);

    expect(snapshots).toEqual([snapshot]);
  });

  it("routes parent timeline emit commands to targeted descendant animations", () => {
    const played: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      handleTimelineCommand: (detail: unknown) => number;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      play: (animation: string) => number;
    };
    parent.component = { id: "parent" };
    child.component = { id: "name-card" };
    child.children = new Map();
    child.play = (animation) => {
      played.push(animation);
      return 250;
    };
    parent.children = new Map([["name-card", child]]);

    const duration = parent.handleTimelineCommand({
      command: { type: "emit", frame: 12, target: "name-card", event: "pop" },
      eventName: "pop",
      visual: {}
    });

    expect(duration).toBe(250);
    expect(played).toEqual(["pop"]);
  });

  it("routes parent timeline playComponent commands to targeted descendant animations", () => {
    const played: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      handleTimelineCommand: (detail: unknown) => number;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      play: (animation: string) => number;
    };
    parent.component = { id: "parent" };
    child.component = { id: "name-card" };
    child.children = new Map();
    child.play = (animation) => {
      played.push(animation);
      return 300;
    };
    parent.children = new Map([["name-card", child]]);

    const duration = parent.handleTimelineCommand({
      command: { type: "playComponent", frame: 12, target: "name-card", event: "pop" },
      eventName: "playComponent",
      visual: {}
    });

    expect(duration).toBe(300);
    expect(played).toEqual(["pop"]);
  });

  it("routes parent timeline playComponent commands to targeted descendant instance labels", () => {
    const played: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      handleTimelineCommand: (detail: unknown) => number;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string; name: string };
      componentPath: string[];
      children: Map<string, unknown>;
      play: (animation: string) => number;
    };
    parent.component = { id: "parent" };
    child.component = { id: "answer-bubble-slot", name: "bubble" };
    child.componentPath = ["player", "answer-bubble-slot"];
    child.children = new Map();
    child.play = (animation) => {
      played.push(animation);
      return 240;
    };
    parent.children = new Map([["answer-bubble-slot", child]]);

    const duration = parent.handleTimelineCommand({
      command: { type: "playComponent", frame: 12, target: "bubble", event: "appear" },
      eventName: "playComponent",
      visual: {}
    });

    expect(duration).toBe(240);
    expect(played).toEqual(["appear"]);
  });

  it("uses the referenced prefab timeline when a reference component is played", () => {
    const view = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string; kind: string; artCompositionId: string; timeline: null };
      getComposition: (id: string) => unknown;
      referencePath: Set<string>;
      componentTimeline: () => { labels: Array<{ name: string; frame: number }> };
    };
    view.component = { id: "answer-bubble-slot", kind: "reference", artCompositionId: "prefab-answer-bubble", timeline: null };
    view.referencePath = new Set();
    view.getComposition = () => ({
      id: "prefab-answer-bubble",
      timeline: {
        fps: 10,
        frameCount: 2,
        labels: [{ name: "appear", frame: 0 }],
        commands: [],
        tracks: []
      }
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousSchema = globals.PartyGameArtComponentSchema;
    globals.PartyGameArtComponentSchema = { normalizeComponentKind: (kind: unknown) => String(kind || "") };
    try {
      expect(view.componentTimeline().labels.map((label) => label.name)).toContain("appear");
    } finally {
      globals.PartyGameArtComponentSchema = previousSchema;
    }
  });

  it("routes parent timeline playComponent commands by scoped component path", () => {
    const played: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      componentPath: string[];
      children: Map<string, unknown>;
      handleTimelineCommand: (detail: unknown) => number;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      componentPath: string[];
      children: Map<string, unknown>;
      play: (animation: string) => number;
    };
    parent.component = { id: "player" };
    parent.componentPath = ["player"];
    child.component = { id: "answer-text" };
    child.componentPath = ["player", "answer-bubble-slot", "answer-text"];
    child.children = new Map();
    child.play = (animation) => {
      played.push(animation);
      return 300;
    };
    parent.children = new Map([["answer-text", child]]);

    const duration = parent.handleTimelineCommand({
      command: { type: "playComponent", frame: 12, target: "player/answer-bubble-slot/answer-text", event: "pulse" },
      eventName: "playComponent",
      visual: {}
    });

    expect(duration).toBe(300);
    expect(played).toEqual(["pulse"]);
  });

  it("routes nested timeline commands relative to the nested component view", () => {
    const played: unknown[] = [];
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      handleTimelineCommand: (detail: unknown) => number;
    };
    const label = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      play: (animation: string) => number;
    };
    child.component = { id: "child" };
    label.component = { id: "label" };
    label.children = new Map();
    label.play = (animation) => {
      played.push(animation);
      return 180;
    };
    child.children = new Map([["label", label]]);

    const duration = child.handleTimelineCommand({
      command: { type: "playComponent", frame: 4, target: "label", event: "flash" },
      eventName: "playComponent",
      visual: {}
    });

    expect(duration).toBe(180);
    expect(played).toEqual(["flash"]);
  });

  it("routes parent timeline stopComponent commands to targeted descendant timeline labels", () => {
    const stopped: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      handleTimelineCommand: (detail: unknown) => number;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      stopAt: (animation: string) => number;
      play: (animation: string) => number;
    };
    parent.component = { id: "parent" };
    child.component = { id: "dino-mask" };
    child.children = new Map();
    child.stopAt = (animation) => {
      stopped.push(animation);
      return 0;
    };
    child.play = () => 999;
    parent.children = new Map([["dino-mask", child]]);

    const duration = parent.handleTimelineCommand({
      command: { type: "stopComponent", frame: 12, target: "dino-mask", event: "stego" },
      eventName: "stopComponent",
      visual: {}
    });

    expect(duration).toBe(0);
    expect(stopped).toEqual(["stego"]);
  });

  it("does not let a nested component duration affect its parent callback", () => {
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      timelineCommandDuration: (command: unknown) => number;
    };
    const label = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      durationForAnimation: (animation: string) => number;
    };
    child.component = { id: "child" };
    label.component = { id: "label" };
    label.children = new Map();
    label.durationForAnimation = (animation) => (animation === "flash" ? 420 : 0);
    child.children = new Map([["label", label]]);

    const duration = child.timelineCommandDuration({ type: "playComponent", frame: 4, target: "label", event: "flash" });

    expect(duration).toBe(0);
  });

  it("plays renderer root timelines before falling back to component timelines", () => {
    const snapshots: unknown[] = [];
    const renderer = Object.create(PartyGameArtObject.ArtObjectTreeRenderer.prototype) as {
      views: Map<string, unknown>;
      rootTimelinePlayer: unknown;
      updateRootTimeline: (timeline: unknown) => void;
      playAll: (animation: string, options?: unknown) => number;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      createVisual: () => { applyTimelineSnapshot: (snapshot: unknown) => void };
      play: (animation: string) => number;
    };
    child.component = { id: "child" };
    child.children = new Map();
    child.createVisual = () => ({ applyTimelineSnapshot: (snapshot) => snapshots.push(snapshot) });
    child.play = () => 999;
    renderer.views = new Map([["child", child]]);
    renderer.rootTimelinePlayer = null;
    renderer.updateRootTimeline({
      fps: 10,
      frameCount: 3,
      labels: [{ name: "pulse", frame: 0 }],
      commands: [{ frame: 2, type: "stop" }],
      tracks: [{ targetId: "child", keyframes: [{ frame: 0, easing: "linear", props: { x: 10 } }, { frame: 2, props: { x: 30 } }] }]
    });

    const duration = renderer.playAll("pulse", {});
    vi.advanceTimersByTime(200);

    expect(duration).toBe(200);
    expect(snapshots).toEqual([
      { frame: 0, targets: { child: { x: 10 } } },
      { frame: 1, targets: { child: { x: 20 } } },
      { frame: 2, targets: { child: { x: 30 } } }
    ]);
  });

  it("reapplies the active root timeline frame after tree reconciliation", () => {
    const appliedFrames: unknown[] = [];
    const renderer = Object.create(PartyGameArtObject.ArtObjectTreeRenderer.prototype) as {
      rootTimelinePlayer: { currentFrame: number; applyFrame: (frame: number) => void };
      syncRootTimelineFrame: () => void;
    };
    renderer.rootTimelinePlayer = {
      currentFrame: 7,
      applyFrame: (frame) => appliedFrames.push(frame)
    };

    renderer.syncRootTimelineFrame();

    expect(appliedFrames).toEqual([7]);
  });

  it("reapplies each nested component timeline after static tree reconciliation", () => {
    const events: string[] = [];
    const view = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: unknown;
      canvas: unknown;
      visual: unknown;
      gameObject: unknown;
      element: {
        className: string;
        classList: { add: (className: string) => void; toggle: (className: string, force?: boolean) => boolean };
        dataset: Record<string, string>;
        style: CSSStyleDeclaration;
      };
      image: unknown;
      label: unknown;
      componentPathId: () => string;
      isVisible: () => boolean;
      createVisual: () => { reapplyTimelineFrame: () => void };
      renderChildren: (children: unknown[]) => void;
      update: (component: unknown, canvas: unknown, layer?: unknown) => void;
    };
    view.component = {};
    view.canvas = null;
    view.visual = {};
    view.gameObject = null;
    const styleValues: Record<string, string> = {};
    const style = new Proxy(styleValues, {
      get: (target, property) => {
        if (property === "setProperty") return (name: string, value: string) => { target[name] = value; };
        if (property === "removeProperty") return (name: string) => { delete target[name]; };
        return target[property as string] || "";
      },
      set: (target, property, value) => {
        target[property as string] = String(value);
        return true;
      }
    }) as unknown as CSSStyleDeclaration;
    view.element = {
      className: "",
      classList: { add: () => undefined, toggle: (_className, force) => force === true },
      dataset: {},
      style
    };
    view.image = { getAttribute: () => null, removeAttribute: () => undefined };
    view.label = { replaceChildren: () => undefined };
    view.componentPathId = () => "player/answer-bubble";
    view.isVisible = () => true;
    view.createVisual = () => ({ reapplyTimelineFrame: () => events.push("reapply") });
    view.renderChildren = () => events.push("children");

    const globals = globalThis as unknown as Record<string, unknown>;
    const previousSchema = globals.PartyGameArtComponentSchema;
    globals.PartyGameArtComponentSchema = {
      normalizeComponentKind: () => "shape",
      componentLabel: () => "",
      normalizeFillCss: () => "",
      normalizeImageObjectFit: () => "cover",
      normalizeShapeStyle: () => "rounded",
      componentSpriteDataUrl: () => "",
      normalizeSpriteRenderMode: () => "image",
      transformOriginCss: () => "50% 50%"
    };
    try {
      view.update({ id: "answer-bubble", kind: "shape", children: [] }, { width: 100, height: 100 }, {});
    } finally {
      globals.PartyGameArtComponentSchema = previousSchema;
    }

    expect(events).toEqual(["children", "reapply"]);
  });

  it("completes renderer root playback at its own stop even when it starts a child animation", () => {
    const renderer = Object.create(PartyGameArtObject.ArtObjectTreeRenderer.prototype) as {
      views: Map<string, unknown>;
      rootTimelinePlayer: unknown;
      updateRootTimeline: (timeline: unknown) => void;
      playAll: (animation: string, options?: unknown) => number;
    };
    const played: unknown[] = [];
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      durationForAnimation: (animation: string) => number;
      play: (animation: string) => number;
    };
    child.component = { id: "child" };
    child.children = new Map();
    child.durationForAnimation = (animation) => (animation === "pop" ? 500 : 0);
    child.play = (animation) => {
      played.push(animation);
      return child.durationForAnimation(animation);
    };
    renderer.views = new Map([["child", child]]);
    renderer.rootTimelinePlayer = null;
    renderer.updateRootTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 1, type: "playComponent", target: "child", event: "pop" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    });

    const duration = renderer.playAll("appear", {});
    vi.advanceTimersByTime(100);

    expect(duration).toBe(200);
    expect(played).toEqual(["pop"]);
  });

  it("does not include scoped child component durations in renderer root playback", () => {
    const renderer = Object.create(PartyGameArtObject.ArtObjectTreeRenderer.prototype) as {
      views: Map<string, unknown>;
      rootTimelinePlayer: unknown;
      updateRootTimeline: (timeline: unknown) => void;
      playAll: (animation: string, options?: unknown) => number;
    };
    const played: unknown[] = [];
    const player = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      componentPath: string[];
      children: Map<string, unknown>;
    };
    const bubbleText = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      componentPath: string[];
      children: Map<string, unknown>;
      durationForAnimation: (animation: string) => number;
      play: (animation: string) => number;
    };
    player.component = { id: "player" };
    player.componentPath = ["player"];
    bubbleText.component = { id: "answer-text" };
    bubbleText.componentPath = ["player", "answer-bubble-slot", "answer-text"];
    bubbleText.children = new Map();
    bubbleText.durationForAnimation = (animation) => (animation === "pulse" ? 450 : 0);
    bubbleText.play = (animation) => {
      played.push(animation);
      return bubbleText.durationForAnimation(animation);
    };
    player.children = new Map([["answer-text", bubbleText]]);
    renderer.views = new Map([["player", player]]);
    renderer.rootTimelinePlayer = null;
    renderer.updateRootTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 1, type: "playComponent", target: "player/answer-bubble-slot/answer-text", event: "pulse" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    });

    const duration = renderer.playAll("appear", {});
    vi.advanceTimersByTime(100);

    expect(duration).toBe(200);
    expect(played).toEqual(["pulse"]);
  });

  it("ignores timeline emit commands without both a target and animation event", () => {
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      handleTimelineCommand: (detail: unknown) => number;
    };
    parent.component = { id: "parent" };
    parent.children = new Map();

    expect(parent.handleTimelineCommand({ command: { type: "emit", frame: 1, event: "pop" }, eventName: "pop", visual: {} })).toBe(0);
    expect(parent.handleTimelineCommand({ command: { type: "emit", frame: 1, target: "name-card" }, eventName: "emit", visual: {} })).toBe(0);
    expect(parent.handleTimelineCommand({ command: { type: "gotoAndPlay", frame: 1, target: "appear" }, eventName: "gotoAndPlay", visual: {} })).toBe(0);
  });

  it("routes timeline visible assignment commands to the whole rendered tree", () => {
    const toggles: boolean[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      createVisual: () => { setVisibleState: (isVisible: boolean) => void };
      handleTimelineCommand: (detail: unknown) => number;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      createVisual: () => { setVisibleState: (isVisible: boolean) => void };
    };
    parent.component = { id: "parent" };
    child.component = { id: "child" };
    parent.createVisual = () => ({ setVisibleState: (isVisible) => toggles.push(isVisible) });
    child.createVisual = () => ({ setVisibleState: (isVisible) => toggles.push(isVisible) });
    child.children = new Map();
    parent.children = new Map([["child", child]]);

    expect(parent.handleTimelineCommand({ command: { type: "setVisible", frame: 1, target: "false" } })).toBe(0);
    expect(parent.handleTimelineCommand({ command: { type: "setVisible", frame: 2, target: "true" } })).toBe(0);
    expect(toggles).toEqual([false, false, true, true]);
  });
});
