import { describe, expect, it } from "vitest";
import { StageManagedTextSources } from "./stageManagedTextSources";

const lobby = (overrides: Record<string, unknown> = {}) => ({
  gameSessionId: 4,
  flowStateId: "lobby",
  phase: "lobby",
  momentVisitId: 2,
  ...overrides
});

describe("StageManagedTextSources", () => {
  it("applies source text once per moment without overwriting later authored text on room revisions", () => {
    const sources = new StageManagedTextSources();
    const defaults = [
      { target: "stageTitle", value: "Party Game Template" },
      { target: "stageIntroTitle", value: "GAME INTRO" }
    ];

    expect(sources.reconcile(lobby(), defaults)).toEqual(defaults);
    expect(
      sources.reconcile(lobby({ revision: 2, action: { type: "displayText" } }), defaults)
    ).toEqual([]);
    expect(
      sources.reconcile(lobby({ revision: 3, action: { type: "transitionState" } }), defaults)
    ).toEqual([]);
  });

  it("applies only a server-backed value that actually changed", () => {
    const sources = new StageManagedTextSources();
    sources.reconcile(lobby({ flowStateId: "crafting" }), [
      { target: "stageTitle", value: "Party Game Template" },
      { target: "craftingTriviaPromptText", value: "" }
    ]);

    expect(
      sources.reconcile(lobby({ flowStateId: "crafting" }), [
        { target: "stageTitle", value: "Party Game Template" },
        { target: "craftingTriviaPromptText", value: "What is the answer?" }
      ])
    ).toEqual([{ target: "craftingTriviaPromptText", value: "What is the answer?" }]);
  });

  it("reapplies defaults for a new moment visit or an explicit moment setup", () => {
    const sources = new StageManagedTextSources();
    const defaults = [{ target: "stageTitle", value: "Party Game Template" }];
    sources.reconcile(lobby(), defaults);

    expect(sources.reconcile(lobby({ momentVisitId: 3 }), defaults)).toEqual(defaults);
    expect(sources.reconcile(lobby({ momentVisitId: 3 }), defaults, { force: true })).toEqual(
      defaults
    );
  });

  it("keeps lobby and starting phases in the same authored flow-state visit", () => {
    const sources = new StageManagedTextSources();
    const defaults = [{ target: "stageTitle", value: "Party Game Template" }];
    sources.reconcile(lobby(), defaults);

    expect(sources.reconcile(lobby({ phase: "starting" }), defaults)).toEqual([]);
  });
});
