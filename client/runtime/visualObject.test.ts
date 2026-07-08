import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTimeline } from "../../shared/timeline-model";
import { PartyGameVisualObject } from "./visualObject";

interface FakeElement {
  classList: {
    add: (...classes: string[]) => void;
    contains: (className: string) => boolean;
    remove: (...classes: string[]) => void;
  };
  dataset: Record<string, string>;
  offsetWidth: number;
  querySelector?: (selector: string) => { textContent: string } | null;
  dispatchEvent?: (event: Event) => boolean;
  style: Record<string, string>;
}

interface TestWindowShim {
  clearTimeout: (id: number) => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  setTimeout: (callback: TimerHandler, delay?: number) => number;
}

interface TestGlobalWithWindow {
  window?: TestWindowShim | unknown;
}

function createFakeElement(initialClasses: string[] = []): HTMLElement {
  const classes = new Set(initialClasses);
  const element: FakeElement = {
    classList: {
      add: (...nextClasses) => {
        for (const className of nextClasses) classes.add(className);
      },
      contains: (className) => classes.has(className),
      remove: (...nextClasses) => {
        for (const className of nextClasses) classes.delete(className);
      }
    },
    dataset: {},
    offsetWidth: 0,
    style: {}
  };
  return element as unknown as HTMLElement;
}

describe("PartyGameVisualObject (ported visual-object)", () => {
  let previousWindow: unknown;

  beforeEach(() => {
    vi.useFakeTimers();
    const host = globalThis as unknown as TestGlobalWithWindow;
    previousWindow = host.window;
    host.window = {
      clearTimeout: (id: number) => clearTimeout(id),
      requestAnimationFrame: (callback: FrameRequestCallback) => Number(setTimeout(() => callback(0), 0)),
      setTimeout: (callback: TimerHandler, delay?: number) => Number(setTimeout(callback, delay))
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as unknown as TestGlobalWithWindow).window = previousWindow;
  });

  it("animationForVisibility maps the visibility transitions", () => {
    const { animationForVisibility } = PartyGameVisualObject;
    expect(animationForVisibility(false, false)).toBe("park");
    expect(animationForVisibility(false, true)).toBe("disappear");
    expect(animationForVisibility(true, false)).toBe("appear");
    expect(animationForVisibility(true, true)).toBe("update");
  });

  it("instantAnimation collapses motion to instant variants", () => {
    const { instantAnimation } = PartyGameVisualObject;
    expect(instantAnimation("appear", false)).toBe("appear");
    expect(instantAnimation("appear", true)).toBe("on");
    expect(instantAnimation("update", true)).toBe("on");
    expect(instantAnimation("disappear", true)).toBe("off");
    expect(instantAnimation("park", true)).toBe("off");
  });

  it("createCssVisualObject merges default durations", () => {
    const visual = PartyGameVisualObject.createCssVisualObject({ durations: { appear: 1234 } });
    expect(visual.durations.appear).toBe(1234);
    expect(visual.durations.disappear).toBe(500);
    expect(visual.durations.update).toBe(200);
  });

  it("play is a no-op returning 0 without an element", () => {
    const visual = PartyGameVisualObject.createCssVisualObject({});
    expect(visual.play("appear")).toBe(0);
  });

  it("keeps an object logically shown while it is appearing and ignores duplicate appear calls", () => {
    const element = createFakeElement(["hidden"]);
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      durations: { appear: 100 }
    });

    expect(visual.play("appear")).toBe(100);
    expect(element.dataset.visualState).toBe("appearing");
    expect(element.dataset.visualVisible).toBe("true");
    expect(visual.isVisible()).toBe(true);

    expect(visual.play("appear")).toBe(0);
    expect(element.dataset.visualState).toBe("appearing");

    vi.advanceTimersByTime(100);
    expect(element.dataset.visualState).toBe("shown");
    expect(element.classList.contains("hidden")).toBe(false);
  });

  it("keeps a disappearing object logically shown until the disappear finishes", () => {
    const element = createFakeElement();
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      exitingClass: "exiting",
      durations: { disappear: 100 }
    });
    visual.play("on");

    expect(visual.play("disappear")).toBe(100);
    expect(element.dataset.visualState).toBe("disappearing");
    expect(element.dataset.visualVisible).toBe("true");
    expect(element.classList.contains("exiting")).toBe(true);
    expect(visual.isVisible()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(element.dataset.visualState).toBe("hidden");
    expect(element.dataset.visualVisible).toBe("false");
    expect(element.classList.contains("hidden")).toBe(true);
    expect(visual.isVisible()).toBe(false);
  });

  it("restarts a disappear animation when disappear is requested while already disappearing", () => {
    const element = createFakeElement();
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      exitingClass: "exiting",
      durations: { disappear: 100 }
    });
    visual.play("on");
    visual.play("disappear");
    const firstToken = element.dataset.visualAnimationToken;

    vi.advanceTimersByTime(50);
    expect(visual.play("disappear")).toBe(100);
    const secondToken = element.dataset.visualAnimationToken;
    expect(secondToken).not.toBe(firstToken);

    vi.advanceTimersByTime(50);
    expect(element.dataset.visualState).toBe("disappearing");
    expect(visual.isVisible()).toBe(true);

    vi.advanceTimersByTime(50);
    expect(element.dataset.visualState).toBe("hidden");
    expect(visual.isVisible()).toBe(false);
  });

  it("lets an instant disappear override an in-flight disappear immediately", () => {
    const element = createFakeElement();
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      exitingClass: "exiting",
      instantClass: "instant",
      durations: { disappear: 100 }
    });
    visual.play("on");
    visual.play("disappear");

    expect(visual.play("disappear", { instant: true })).toBe(0);
    expect(element.dataset.visualState).toBe("hidden");
    expect(element.dataset.visualVisible).toBe("false");
    expect(element.classList.contains("hidden")).toBe(true);
    expect(element.classList.contains("exiting")).toBe(false);
  });

  it("uses authored timeline segment duration when a matching label exists", () => {
    const element = createFakeElement(["hidden"]);
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      timeline: normalizeTimeline({
        fps: 20,
        frameCount: 12,
        labels: [{ name: "appear", frame: 2 }],
        commands: [{ frame: 8, type: "stop" }],
        tracks: []
      })
    });

    expect(visual.play("appear")).toBe(300);
    expect(element.dataset.visualState).toBe("appearing");
    vi.advanceTimersByTime(300);
    expect(element.dataset.visualState).toBe("shown");
  });

  it("uses authored timeline command-chain duration and completion for redirected playback", () => {
    const element = createFakeElement(["hidden"]);
    const complete = vi.fn();
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      timeline: normalizeTimeline({
        fps: 10,
        frameCount: 8,
        labels: [
          { name: "appear", frame: 0 },
          { name: "settle", frame: 4 }
        ],
        commands: [
          { frame: 1, type: "gotoAndPlay", target: "settle" },
          { frame: 6, type: "stop" }
        ],
        tracks: []
      })
    });

    expect(visual.play("appear", { complete })).toBe(300);
    expect(element.dataset.visualState).toBe("appearing");

    vi.advanceTimersByTime(299);
    expect(element.dataset.visualState).toBe("appearing");
    expect(complete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(element.dataset.visualState).toBe("shown");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("applies authored timeline keyframe snapshots while playing", () => {
    const label = { textContent: "" };
    const element = createFakeElement(["hidden"]);
    element.dataset.artComponentId = "component-a";
    element.querySelector = (selector: string) => (selector === ".art-runtime-object-label" ? label : null);
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      timelineCanvas: { width: 200, height: 100 },
      timeline: normalizeTimeline({
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [{ frame: 2, type: "stop" }],
        tracks: [
          {
            targetId: "component-a",
            keyframes: [
              { frame: 0, props: { x: 50, y: 25, width: 80, height: 20, scale: 0.5, opacity: 0.25, text: "Start" } },
              {
                frame: 2,
                props: {
                  x: 100,
                  y: 50,
                  width: 120,
                  height: 40,
                  scale: 1,
                  opacity: 1,
                  text: "Done",
                  fontSize: 42,
                  fontColor: "#ffffff",
                  fontFamily: "Game UI",
                  fillColor: "#ffe156",
                  borderColor: "#17131f",
                  borderWidth: 4,
                  borderRadius: 12
                }
              }
            ]
          }
        ]
      })
    });

    expect(visual.play("appear")).toBe(200);
    expect(element.style.left).toBe("25%");
    expect(element.style.top).toBe("25%");
    expect(element.style.width).toBe("40%");
    expect(element.style.height).toBe("20%");
    expect((element.style as unknown as Record<string, string>)["--component-scale"]).toBe("0.5");
    expect(element.style.opacity).toBe("0.25");
    expect(label.textContent).toBe("Start");

    vi.advanceTimersByTime(200);
    expect(element.style.left).toBe("50%");
    expect(element.style.top).toBe("50%");
    expect(element.style.width).toBe("60%");
    expect(element.style.height).toBe("40%");
    expect((element.style as unknown as Record<string, string>)["--component-scale"]).toBe("1");
    expect(element.style.opacity).toBe("1");
    expect(label.textContent).toBe("Done");
    expect((element.style as unknown as Record<string, string>)["--component-font-size"]).toBe("42px");
    expect((element.style as unknown as Record<string, string>)["--component-text-color"]).toBe("#ffffff");
    expect((element.style as unknown as Record<string, string>)["--component-font-family"]).toBe("Game UI");
    expect((element.style as unknown as Record<string, string>)["--component-fill-color"]).toBe("#ffe156");
    expect((element.style as unknown as Record<string, string>)["--component-border-color"]).toBe("#17131f");
    expect((element.style as unknown as Record<string, string>)["--component-border-width"]).toBe("4px");
    expect((element.style as unknown as Record<string, string>)["--component-border-radius"]).toBe("12px");
  });

  it("dispatches authored timeline emit commands through the visual object", () => {
    const element = createFakeElement(["hidden"]);
    const dispatched: { type: string; detail: unknown }[] = [];
    element.dispatchEvent = (event: Event) => {
      dispatched.push({ type: event.type, detail: (event as unknown as { detail?: unknown }).detail });
      return true;
    };
    const handled: unknown[] = [];
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      timelineCommandHandler: (detail) => handled.push(detail),
      timeline: normalizeTimeline({
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "emit", event: "pop-name" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      })
    });

    expect(visual.play("appear")).toBe(200);
    vi.advanceTimersByTime(100);

    expect(handled).toHaveLength(1);
    expect(dispatched.map((event) => event.type)).toEqual(["party-game:timeline-command", "party-game:timeline:pop-name"]);
    expect((handled[0] as { eventName: string }).eventName).toBe("pop-name");
    expect((dispatched[0].detail as { eventName: string }).eventName).toBe("pop-name");
  });

  it("notifies timeline frame handlers after applying authored snapshots", () => {
    const element = createFakeElement(["hidden"]);
    element.dataset.artComponentId = "component-a";
    const frames: number[] = [];
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      timelineFrameHandler: (snapshot) => frames.push(snapshot.frame),
      timeline: normalizeTimeline({
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [{ frame: 2, type: "stop" }],
        tracks: [{ targetId: "component-a", keyframes: [{ frame: 0, props: { opacity: 0.1 } }, { frame: 2, props: { opacity: 1 } }] }]
      })
    });

    expect(visual.play("appear")).toBe(200);
    expect(frames).toEqual([0]);
    vi.advanceTimersByTime(200);
    expect(frames).toEqual([0, 1, 2]);
  });
});
