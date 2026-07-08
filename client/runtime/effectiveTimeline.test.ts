import { describe, expect, it } from "vitest";
import { effectiveVisibilityTimeline } from "./effectiveTimeline";

describe("effectiveVisibilityTimeline", () => {
  it("supplies standard visibility labels for missing timelines", () => {
    const timeline = effectiveVisibilityTimeline(null);

    expect(timeline.labels.map((label) => label.name)).toEqual(expect.arrayContaining(["park", "on", "appear", "update", "disappear"]));
    expect(timeline.commands.some((command) => command.type === "stop")).toBe(true);
  });

  it("keeps authored timeline data without injecting default stop commands", () => {
    const timeline = effectiveVisibilityTimeline({
      fps: 24,
      frameCount: 4,
      labels: [{ name: "custom", frame: 2 }],
      commands: [{ frame: 2, type: "emit", target: "name", event: "pop" }],
      tracks: [{ targetId: "name", keyframes: [{ frame: 2, props: { scale: 1.2 } }] }]
    });

    expect(timeline.fps).toBe(24);
    expect(timeline.labels).toEqual([{ name: "custom", frame: 2 }]);
    expect(timeline.commands).toEqual(expect.arrayContaining([{ frame: 2, type: "emit", target: "name", event: "pop" }]));
    expect(timeline.tracks).toEqual([{ targetId: "name", keyframes: [{ frame: 2, props: { scale: 1.2 } }] }]);
  });

  it("does not duplicate existing default markers", () => {
    const timeline = effectiveVisibilityTimeline({
      fps: 30,
      frameCount: 20,
      labels: [{ name: "appear", frame: 5 }],
      commands: [{ frame: 5, type: "stop" }],
      tracks: []
    });

    expect(timeline.labels.filter((label) => label.name === "appear")).toHaveLength(1);
    expect(timeline.commands.filter((command) => command.frame === 5 && command.type === "stop")).toHaveLength(1);
  });
});
