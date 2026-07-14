import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTimeline } from "../../shared/timeline-model";
import { PartyGameVisualObject } from "./visualObject";

interface FakeElement {
  clientHeight?: number;
  clientWidth?: number;
  classList: {
    add: (...classes: string[]) => void;
    contains: (className: string) => boolean;
    remove: (...classes: string[]) => void;
    toggle: (className: string, force?: boolean) => boolean;
  };
  dataset: Record<string, string>;
  offsetHeight?: number;
  offsetWidth: number;
  querySelector?: (selector: string) => HTMLElement | null;
  dispatchEvent?: (event: Event) => boolean;
  setAttribute?: (name: string, value: string) => void;
  style: CSSStyleDeclaration | Record<string, string>;
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
  const style = createFakeStyle();
  const element: FakeElement = {
    classList: {
      add: (...nextClasses) => {
        for (const className of nextClasses) classes.add(className);
      },
      contains: (className) => classes.has(className),
      remove: (...nextClasses) => {
        for (const className of nextClasses) classes.delete(className);
      },
      toggle: (className, force) => {
        const shouldAdd = force === undefined ? !classes.has(className) : force;
        if (shouldAdd) classes.add(className);
        else classes.delete(className);
        return shouldAdd;
      }
    },
    dataset: {},
    offsetWidth: 0,
    style
  };
  return element as unknown as HTMLElement;
}

function createFakeStyle(): CSSStyleDeclaration {
  const values: Record<string, string> = {};
  return new Proxy(values, {
    get(target, property) {
      if (property === "setProperty") {
        return (name: string, value: string) => {
          target[name] = value;
        };
      }
      if (property === "getPropertyValue") {
        return (name: string) => target[name] || "";
      }
      if (property === "removeProperty") {
        return (name: string) => {
          const previous = target[name] || "";
          delete target[name];
          return previous;
        };
      }
      return target[property as string] || "";
    },
    set(target, property, value) {
      target[property as string] = String(value);
      return true;
    }
  }) as unknown as CSSStyleDeclaration;
}

function createFakeLabel(): HTMLElement {
  return {
    dataset: {},
    setAttribute: vi.fn(),
    style: createFakeStyle(),
    textContent: ""
  } as unknown as HTMLElement;
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
    expect(animationForVisibility(false, false)).toBe("off");
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

  it("treats canonical uppercase lifecycle labels as lifecycle animations", () => {
    const element = createFakeElement(["hidden"]);
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      durations: { appear: 100 }
    });

    expect(visual.play("On", { instant: true })).toBe(0);
    expect(element.dataset.visualState).toBe("shown");
    expect(visual.play("Disappear")).toBe(500);
    expect(element.dataset.visualState).toBe("disappearing");

    vi.advanceTimersByTime(500);
    expect(element.dataset.visualState).toBe("hidden");
  });

  it("repairs stale hidden classes when On is repeated for a logically shown object", () => {
    const element = createFakeElement();
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["visual-hidden", "hidden"]
    });

    visual.play("On", { instant: true });
    element.classList.add("visual-hidden", "hidden");
    expect(element.dataset.visualState).toBe("shown");

    expect(visual.play("On", { instant: true })).toBe(0);
    expect(element.classList.contains("visual-hidden")).toBe(false);
    expect(element.classList.contains("hidden")).toBe(false);
    expect(element.dataset.visualVisible).toBe("true");
  });

  it("applies timeline visibility commands to the rendered lifecycle state", () => {
    const element = createFakeElement(["hidden"]);
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      durations: { off: 100 }
    });

    visual.play("Off");
    visual.applyCommandVisibility(true);
    vi.advanceTimersByTime(100);
    expect(element.classList.contains("hidden")).toBe(false);
    expect(element.dataset.visualState).toBe("shown");
    expect(element.dataset.visualVisible).toBe("true");

    visual.applyCommandVisibility(false);
    expect(element.classList.contains("hidden")).toBe(true);
    expect(element.dataset.visualState).toBe("hidden");
    expect(element.dataset.visualVisible).toBe("false");
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
    const label = createFakeLabel();
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
              { frame: 0, props: { x: 50, y: 25, width: 80, height: 20, scale: 0.5, opacity: 0.25, brightness: 0.5, text: "Start" } },
              {
                frame: 2,
                props: {
                  x: 100,
                  y: 50,
                  width: 120,
                  height: 40,
                  scale: 1,
                  opacity: 1,
                  brightness: 1,
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
    expect((element.style as unknown as Record<string, string>)["--component-brightness"]).toBe("0.5");
    expect(label.textContent).toBe("Start");

    vi.advanceTimersByTime(200);
    expect(element.style.left).toBe("50%");
    expect(element.style.top).toBe("50%");
    expect(element.style.width).toBe("60%");
    expect(element.style.height).toBe("40%");
    expect((element.style as unknown as Record<string, string>)["--component-scale"]).toBe("1");
    expect(element.style.opacity).toBe("1");
    expect((element.style as unknown as Record<string, string>)["--component-brightness"]).toBe("1");
    expect(label.textContent).toBe("Done");
    expect(Number.parseFloat((element.style as unknown as Record<string, string>)["--component-font-size"])).toBeLessThanOrEqual(42);
    expect((element.style as unknown as Record<string, string>)["--component-text-color"]).toBe("#ffffff");
    expect((element.style as unknown as Record<string, string>)["--component-font-family"]).toBe("Game UI");
    expect((element.style as unknown as Record<string, string>)["--component-fill-color"]).toBe("#ffe156");
    expect((element.style as unknown as Record<string, string>)["--component-border-color"]).toBe("#17131f");
    expect((element.style as unknown as Record<string, string>)["--component-border-width"]).toBe("4px");
    expect((element.style as unknown as Record<string, string>)["--component-border-radius"]).toBe("12px");
  });

  it("maps nested timeline positions through the canvas content origin", () => {
    const element = createFakeElement(["hidden"]);
    element.dataset.artComponentId = "avatar";
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      timelineCanvas: { width: 100, height: 100, minX: -50, minY: -50 },
      timeline: normalizeTimeline({
        fps: 30,
        frameCount: 1,
        labels: [{ name: "Rex", frame: 0 }],
        commands: [{ frame: 0, type: "stop" }],
        tracks: [{ targetId: "avatar", keyframes: [{ frame: 0, props: { x: 0, y: 0, width: 70, height: 70 } }] }]
      })
    });

    visual.stopAt("Rex");

    expect(element.style.left).toBe("50%");
    expect(element.style.top).toBe("50%");
    expect(element.style.width).toBe("70%");
    expect(element.style.height).toBe("70%");
  });

  it("routes a reference timeline to descendants without blocking parent snapshots on the reference", () => {
    const element = createFakeElement();
    element.dataset.artComponentId = "avatar";
    const descendantSnapshots: unknown[] = [];
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      timelineApplySelf: false,
      timelineCanvas: { width: 100, height: 100, minX: -50, minY: -50 },
      timelineFrameHandler: (snapshot) => descendantSnapshots.push(snapshot),
      timeline: normalizeTimeline({
        fps: 30,
        frameCount: 1,
        labels: [{ name: "Raptor", frame: 0 }],
        commands: [{ frame: 0, type: "stop" }],
        tracks: [{ targetId: "avatar", keyframes: [{ frame: 0, props: { x: 0, y: 0, imageAssetId: "avatar-raptor" } }] }]
      })
    });

    visual.stopAt("Raptor");

    expect(element.style.left).toBe("");
    expect(descendantSnapshots).toEqual([
      { frame: 0, targets: { avatar: { x: 0, y: 0, imageAssetId: "avatar-raptor" } } }
    ]);

    visual.applyTimelineSnapshot({ frame: 0, targets: { avatar: { x: 0, y: 0 } } });
    expect(element.style.left).toBe("50%");
    expect(element.style.top).toBe("50%");
  });

  it("fits authored timeline text through the shared text renderer", () => {
    const label = createFakeLabel();
    const element = createFakeElement(["hidden"]);
    const textFit = (globalThis as unknown as { PartyGameTextFit?: { renderLayoutTextField?: unknown } }).PartyGameTextFit;
    const originalRender = textFit?.renderLayoutTextField;
    const renderLayoutTextField = vi.fn((target: HTMLElement, _element: unknown, options: { text?: string }) => {
      target.textContent = String(options.text ?? "");
      return { fontSize: 18 };
    });
    if (textFit) textFit.renderLayoutTextField = renderLayoutTextField;
    element.dataset.artComponentId = "component-a";
    element.querySelector = (selector: string) => (selector === ".art-runtime-object-label" ? label : null);

    try {
      const visual = PartyGameVisualObject.createCssVisualObject({
        element,
        hiddenClasses: ["hidden"],
        motionHiddenClasses: ["hidden"],
        timeline: normalizeTimeline({
          fps: 10,
          frameCount: 2,
          labels: [{ name: "appear", frame: 0 }],
          commands: [{ frame: 1, type: "stop" }],
          tracks: [
            {
              targetId: "component-a",
              keyframes: [{ frame: 0, props: { width: 120, height: 40, defaultText: "Timeline Text", fontSize: 40, autoFitText: true } }]
            }
          ]
        })
      });

      expect(visual.play("appear")).toBe(100);

      expect(renderLayoutTextField).toHaveBeenCalledWith(
        label,
        expect.objectContaining({ autoFitText: true, fontSize: 40, height: 40, width: 120 }),
        expect.objectContaining({ text: "Timeline Text", renderOptions: { padding: 4 } })
      );
      expect(label.textContent).toBe("Timeline Text");
      expect((element.style as unknown as Record<string, string>)["--component-font-size"]).toBe("18px");
    } finally {
      if (textFit) textFit.renderLayoutTextField = originalRender;
    }
  });

  it("applies authored timeline shape style classes while playing", () => {
    const element = createFakeElement(["hidden", "is-style-rounded"]);
    element.dataset.artComponentId = "component-a";
    const visual = PartyGameVisualObject.createCssVisualObject({
      element,
      hiddenClasses: ["hidden"],
      motionHiddenClasses: ["hidden"],
      timeline: normalizeTimeline({
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [{ frame: 2, type: "stop" }],
        tracks: [
          {
            targetId: "component-a",
            keyframes: [
              { frame: 0, props: { shapeStyle: "rounded" } },
              { frame: 2, props: { shapeStyle: "pill" } }
            ]
          }
        ]
      })
    });

    expect(visual.play("appear")).toBe(200);
    expect(element.classList.contains("is-style-rounded")).toBe(true);

    vi.advanceTimersByTime(200);

    expect(element.classList.contains("is-style-rounded")).toBe(false);
    expect(element.classList.contains("is-style-pill")).toBe(true);
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
          { id: "emit-pop-name", frame: 1, type: "emit", event: "pop-name" },
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
    expect((handled[0] as { command: { id?: string } }).command.id).toBe("emit-pop-name");
    expect(handled[0]).toMatchObject({ frame: 1, elapsedMs: 100 });
    expect((dispatched[0].detail as { eventName: string }).eventName).toBe("pop-name");
    expect((dispatched[0].detail as { command: { id?: string } }).command.id).toBe("emit-pop-name");
    expect(dispatched[0].detail).toMatchObject({ frame: 1, elapsedMs: 100 });
  });

  it("dispatches authored timeline emit commands on the starting frame", () => {
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
          { frame: 0, type: "emit", event: "pop-name" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      })
    });

    expect(visual.play("appear")).toBe(200);

    expect(handled).toHaveLength(1);
    expect(dispatched.map((event) => event.type)).toEqual(["party-game:timeline-command", "party-game:timeline:pop-name"]);
    expect((handled[0] as { eventName: string }).eventName).toBe("pop-name");
    expect(handled[0]).toMatchObject({ frame: 0, elapsedMs: 0 });
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
