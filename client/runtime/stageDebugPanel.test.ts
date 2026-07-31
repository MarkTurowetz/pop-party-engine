import { describe, expect, it } from "vitest";
import { PartyGameStageDebug } from "./stageDebugPanel";

function fakeElement() {
  const classes = new Set(["hidden"]);
  return {
    classes,
    element: {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name)
      },
      textContent: ""
    } as unknown as HTMLElement
  };
}

describe("StageDebugPanel Log Value display", () => {
  it("renders the latest value through the existing global debug alert", () => {
    const { classes, element } = fakeElement();
    const panel = PartyGameStageDebug.createPanel({ alertElement: element });

    panel.renderLogValue({
      phase: "play",
      debugLog: { message: "l.bidResponse = accepted" }
    });

    expect(element.textContent).toBe("Log Value: l.bidResponse = accepted");
    expect(classes.has("hidden")).toBe(false);
  });

  it("does not overwrite higher-priority runtime or decision diagnostics", () => {
    const runtimeFault = fakeElement();
    runtimeFault.element.textContent = "Runtime Fault";
    const runtimePanel = PartyGameStageDebug.createPanel({ alertElement: runtimeFault.element });
    runtimePanel.renderLogValue({
      phase: "play",
      runtimeFault: { code: "FAULT" },
      debugLog: { message: "l.value = hidden" }
    });
    expect(runtimeFault.element.textContent).toBe("Runtime Fault");

    const noMatch = fakeElement();
    noMatch.element.textContent = "No Matching Branch";
    const decisionPanel = PartyGameStageDebug.createPanel({ alertElement: noMatch.element });
    decisionPanel.renderLogValue({
      phase: "play",
      lastDecisionTrace: { selectedTarget: "none" },
      debugLog: { message: "l.value = hidden" }
    });
    expect(noMatch.element.textContent).toBe("No Matching Branch");
  });
});
