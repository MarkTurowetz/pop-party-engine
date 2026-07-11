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

  it("calculates nested timeline command duration relative to the nested component view", () => {
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

    expect(duration).toBe(420);
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

  it("includes nested component timeline command durations in renderer root playback", () => {
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

    expect(duration).toBe(600);
    expect(played).toEqual(["pop"]);
  });

  it("includes scoped component timeline command durations in renderer root playback", () => {
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

    expect(duration).toBe(550);
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
