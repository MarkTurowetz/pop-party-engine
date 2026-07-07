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
  style: Record<string, string>;
}

interface TestWindowShim {
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
});
