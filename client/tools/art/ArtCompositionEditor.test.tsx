import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "../../../shared/timeline-model";
import { timelineActionScriptForFrame, timelineActionScriptPlaceholderForFrame } from "./ArtCompositionEditor";

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
});
