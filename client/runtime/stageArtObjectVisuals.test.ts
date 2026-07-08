import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartyGameArtObject } from "./stageArtObjectVisuals";

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
      tracks: [{ targetId: "child", keyframes: [{ frame: 0, props: { x: 10 } }, { frame: 2, props: { x: 30 } }] }]
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
});
