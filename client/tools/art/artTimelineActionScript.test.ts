import { describe, expect, it } from "vitest";
import { parseTimelineActionScript, timelineCommandsToActionScript } from "./artTimelineActionScript";
import type { TimelineCommand } from "../../../shared/timeline-model";

describe("artTimelineActionScript", () => {
  it("formats timeline commands as editable script", () => {
    const commands: TimelineCommand[] = [
      { frame: 4, type: "stop" },
      { frame: 5, type: "gotoAndPlay", target: "appear" },
      { frame: 6, type: "emit", event: "done" },
      { frame: 7, type: "playComponent", target: "name-card", event: "pop" },
      { frame: 8, type: "setVisible", target: "false" }
    ];

    expect(timelineCommandsToActionScript(commands)).toBe(
      ['stop();', 'gotoAndPlay("appear");', 'emit("done");', 'playComponent("name-card", "pop");', "visible = false;"].join("\n")
    );
  });

  it("parses supported frame action commands", () => {
    expect(parseTimelineActionScript('stop();\ngotoAndPlay("appear");\ngotoAndStop("park");')).toEqual({
      commands: [{ type: "stop" }, { type: "gotoAndPlay", target: "appear" }, { type: "gotoAndStop", target: "park" }]
    });
    expect(parseTimelineActionScript('emit("card", "started");\nplayComponent("avatar", "pop");')).toEqual({
      commands: [
        { type: "emit", target: "card", event: "started" },
        { type: "playComponent", target: "avatar", event: "pop" }
      ]
    });
    expect(parseTimelineActionScript("visible = false;\nvisible = true;")).toEqual({
      commands: [
        { type: "setVisible", target: "false" },
        { type: "setVisible", target: "true" }
      ]
    });
  });

  it("rejects unknown commands without returning partial writes", () => {
    expect(parseTimelineActionScript('stop();\nspin("fast");')).toEqual({
      commands: [],
      error: "Unknown timeline command: spin"
    });
  });
});
