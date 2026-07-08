import { describe, expect, it, vi } from "vitest";
import {
  actionTypeName,
  controllerLayoutOptions,
  findFlowActionRef,
  findFlowState,
  flowActionTargetOptions,
  flowGameObjectLayoutElements,
  flowGameObjectAnimationLabelOptions,
  flowGameObjectComponentTargetOptions,
  flowGameObjectTargetLabel,
  flowGameObjectTargetName,
  flowGameObjectTargetOptions,
  flowGameObjectTargetParts,
  flowGameObjectTargetValue,
  flowTextTargetName,
  flowTextTargetOptions,
  flowPlacedGameObjectElementsForLayoutGroup,
  flowStateName,
  flowStateTargetOptions,
  flowTargetActionName,
  makeFlowId,
  normalizeFlowTextTargetId,
  stateActionNameSet,
  uniqueActionNameForType
} from "./flowSelectors";
import { decisionBranchGraphNodeId } from "./flowDecisionBranchIdentity";
import type { FlowAction, GameFlow } from "../../types/game-data";

const flow: GameFlow = {
  states: [
    {
      id: "intro",
      name: "Intro",
      actions: [
        {
          id: "intro-present",
          name: "Present Text",
          type: "presentText",
          subActions: [{ id: "intro-show-players", name: "Show Players", type: "setPlayersShown" }]
        },
        {
          id: "intro-branch",
          name: "Branch",
          type: "decision",
          branches: [{ id: "branch-yes", type: "branch", name: "Yes" }]
        } as FlowAction
      ]
    }
  ]
};

describe("Flow selectors", () => {
  it("finds states and nested action refs", () => {
    expect(findFlowState(flow, "intro")?.name).toBe("Intro");
    expect(findFlowActionRef(flow, "intro", "intro-present")).toMatchObject({
      action: { id: "intro-present" },
      parentAction: null,
      isSubAction: false,
      isBranch: false
    });
    expect(findFlowActionRef(flow, "intro", "intro-show-players")).toMatchObject({
      action: { id: "intro-show-players" },
      parentAction: { id: "intro-present" },
      isSubAction: true,
      isBranch: false
    });
  });

  it("uses the legacy decision branch normalizer when looking up branch refs", () => {
    const ensureDecisionBranches = vi.fn((action: FlowAction) => action.branches as FlowAction[]);

    expect(findFlowActionRef(flow, "intro", "branch-yes", { ensureDecisionBranches })).toMatchObject({
      action: { id: "branch-yes" },
      parentAction: { id: "intro-branch" },
      isSubAction: false,
      isBranch: true
    });
    expect(ensureDecisionBranches).toHaveBeenCalledWith(expect.objectContaining({ id: "intro-branch" }));
  });

  it("resolves graph-scoped decision branch ids to their parent decision", () => {
    const multiDecisionFlow: GameFlow = {
      states: [
        {
          id: "intro",
          name: "Intro",
          actions: [
            {
              id: "decision-a",
              name: "Decision A",
              type: "decision",
              branches: [{ id: "no-match", type: "noMatch", targetActionId: "" }]
            },
            {
              id: "decision-b",
              name: "Decision B",
              type: "decision",
              branches: [{ id: "no-match", type: "noMatch", targetActionId: "" }]
            }
          ]
        } as never
      ],
      routeNodes: []
    };

    expect(
      findFlowActionRef(multiDecisionFlow, "intro", decisionBranchGraphNodeId("decision-b", "no-match"))
    ).toMatchObject({
      action: { id: "no-match" },
      parentAction: { id: "decision-b" },
      isBranch: true
    });
  });

  it("keeps legacy ID and action-name behavior", () => {
    const actionTypes = [{ id: "presentText", name: "Present Text" }];
    const state = flow.states[0];

    expect(makeFlowId("  Hello, Flow!!!  ", "fallback")).toBe("hello-flow");
    expect(makeFlowId("", "fallback")).toBe("fallback");
    expect(actionTypeName(actionTypes, "presentText")).toBe("Present Text");
    expect([...stateActionNameSet(state)]).toContain("present text");
    expect(uniqueActionNameForType(actionTypes, state, { id: "new-action", type: "presentText" })).toBe("Present Text 1");
  });

  it("builds state and action target display names with legacy fallbacks", () => {
    expect(flowStateName(flow, "intro")).toBe("Intro");
    expect(flowStateName(flow, "route-node", { routeNodeName: () => "Route Node" })).toBe("Route Node");
    expect(flowStateName(flow, "missing")).toBe("missing");
    expect(flowStateName(flow, "")).toBe("State");
    expect(flowTargetActionName(flow.states[0], "")).toBe("No Connection");
    expect(flowTargetActionName(flow.states[0], "none")).toBe("None");
    expect(flowTargetActionName(flow.states[0], "return")).toBe("Return");
    expect(flowTargetActionName(flow.states[0], "intro-present")).toBe("Present Text");
    expect(flowTargetActionName(flow.states[0], "missing")).toBe("Next Action");
  });


  it("builds action target options with selected missing action preservation", () => {
    expect(flowActionTargetOptions(flow.states[0], "missing-action")).toEqual([
      { id: "", name: "No Connection" },
      { id: "none", name: "None" },
      { id: "return", name: "Return To Parent Subroutine" },
      { id: "intro-present", name: "Present Text" },
      { id: "intro-branch", name: "Branch" },
      { id: "missing-action", name: "missing-action" }
    ]);
  });

  it("builds state target options with current state exclusion and route targets", () => {
    const appendRouteTargets = vi.fn((options) => {
      options.push({ id: "route:bonus", name: "Route: Bonus" });
    });

    expect(flowStateTargetOptions(flow, "missing-state", "intro", { appendRouteTargets })).toEqual([
      { id: "", name: "No Next Subroutine" },
      { id: "none", name: "None / Halt" },
      { id: "route:bonus", name: "Route: Bonus" },
      { id: "missing-state", name: "missing-state" }
    ]);
    expect(appendRouteTargets).toHaveBeenCalled();
  });

  it("builds controller layout options with selected missing layout preservation", () => {
    const layouts = {
      states: [
        { id: "intro", name: "Intro Layout", elements: [] },
        { id: "round-one", name: "", elements: [] }
      ]
    };

    expect(controllerLayoutOptions(layouts, "legacy-layout")).toEqual([
      { id: "", name: "Current Moment Default" },
      { id: "intro", name: "Intro Layout" },
      { id: "round-one", name: "round-one" },
      { id: "legacy-layout", name: "legacy-layout" }
    ]);
  });

  it("builds placed game-object layout elements with moment/global precedence", () => {
    const stageLayouts = {
      global: {
        id: "global",
        elements: [
          { id: "shared", name: "Shared Global" },
          { id: "global-only", name: "Global Only" },
          { id: "hidden-global", name: "Hidden Global" }
        ]
      },
      states: [
        {
          id: "intro",
          elements: [{ id: "shared", name: "Moment Shared" }, { id: "moment-only", name: "Moment Only" }],
          hiddenGlobals: ["hidden-global"]
        }
      ]
    };

    expect(flowGameObjectLayoutElements(stageLayouts, { id: "intro" }, "")).toEqual([
      { id: "shared", name: "Moment Shared", targetLayoutScope: "moment" },
      { id: "moment-only", name: "Moment Only", targetLayoutScope: "moment" },
      { id: "global-only", name: "Global Only", targetLayoutScope: "global" }
    ]);
  });

  it("builds text target options from the selected moment layout", () => {
    const stageLayouts = {
      global: {
        id: "global",
        elements: [
          { id: "stageTitle", name: "Stage Title", artCompositionId: "layout-text-field" },
          { id: "global-card", name: "Global Card", kind: "shape" }
        ]
      },
      states: [
        {
          id: "intro",
          elements: [
            { id: "stagePresentationText", name: "Presentation Text", artCompositionId: "layout-text-field" },
            { id: "stagePromptText", name: "Prompt Text", kind: "text" },
            { id: "hero-card", name: "Hero Card", kind: "shape" }
          ],
          hiddenGlobals: ["stageTitle"]
        }
      ]
    };

    expect(normalizeFlowTextTargetId("presentation")).toBe("stagepresentationtext");
    expect(flowTextTargetOptions(stageLayouts, { id: "intro" }, "intro", "presentation")).toEqual([
      { id: "", name: "No Text Field" },
      { id: "stagePresentationText", name: "Presentation Text (stagePresentationText)" },
      { id: "stagePromptText", name: "Prompt Text (stagePromptText)" }
    ]);
    expect(flowTextTargetName(stageLayouts, "intro", "presentation")).toBe(
      "Presentation Text (stagePresentationText)"
    );
  });

  it("supports game-object target labels, values, parts, options, and names", () => {
    const stageLayouts = {
      global: {
        id: "global",
        elements: [{ id: "score", name: "Score" }]
      },
      states: [
        {
          id: "intro",
          elements: [{ id: "prompt", name: "Prompt" }]
        },
        {
          id: "bonus",
          elements: [{ id: "bonus-card", name: "Bonus Card" }]
        }
      ]
    };

    expect(flowPlacedGameObjectElementsForLayoutGroup(stageLayouts.global, "global")).toEqual([
      { id: "score", name: "Score", targetLayoutScope: "global" }
    ]);
    expect(flowGameObjectTargetLabel({ id: "score", name: "Score", targetLayoutScope: "global" })).toBe("Global: Score");
    expect(flowGameObjectTargetValue({ id: "prompt", targetLayoutScope: "moment" })).toBe("moment:prompt");
    expect(flowGameObjectTargetParts("global:score")).toEqual({ scope: "global", id: "score" });
    expect(flowGameObjectTargetParts("legacy-id", "moment")).toEqual({ scope: "moment", id: "legacy-id" });
    expect(flowGameObjectTargetOptions(stageLayouts, { id: "intro" }, "", "global:missing")).toEqual([
      { id: "", name: "No Game Object" },
      { id: "moment:prompt", name: "Prompt" },
      { id: "global:score", name: "Global: Score" },
      { id: "global:missing", name: "missing" }
    ]);
    expect(flowGameObjectTargetName(stageLayouts, "intro", "prompt", "moment")).toBe("Prompt");
    expect(flowGameObjectTargetName(stageLayouts, "intro", "score", "global")).toBe("Global: Score");
    expect(flowGameObjectTargetName(stageLayouts, "intro", "bonus-card")).toBe("Bonus Card (bonus-card)");
    expect(flowGameObjectTargetName(stageLayouts, "intro", "missing")).toBe("missing");
  });

  it("builds animation label suggestions from the selected target composition timeline", () => {
    const stageLayouts = {
      global: {
        id: "global",
        elements: [{ id: "wipe", name: "Wipe", artCompositionId: "wipe-composition" }]
      },
      states: [
        {
          id: "intro",
          elements: [{ id: "bubble", name: "Bubble", artCompositionId: "bubble-composition" }]
        }
      ]
    };
    const compositions = [
      {
        id: "bubble-composition",
        name: "Bubble",
        timeline: {
          fps: 30,
          frameCount: 20,
          labels: [{ name: "pop", frame: 3 }],
          commands: [],
          tracks: []
        },
        components: [
          {
            id: "bubble-card",
            name: "Bubble Card",
            kind: "shape",
            children: [
              {
                id: "answer-text",
                name: "Answer Text",
                kind: "text",
                timeline: {
                  fps: 30,
                  frameCount: 12,
                  labels: [{ name: "text-pop", frame: 2 }],
                  commands: [],
                  tracks: []
                }
              }
            ]
          }
        ]
      },
      {
        id: "wipe-composition",
        name: "Wipe",
        timeline: {
          fps: 30,
          frameCount: 20,
          labels: [{ name: "sweep", frame: 1 }],
          commands: [],
          tracks: []
        }
      }
    ];

    expect(
      flowGameObjectAnimationLabelOptions(
        stageLayouts,
        compositions,
        { id: "intro" },
        "intro",
        "moment:bubble",
        "",
        "custom-label"
      ).map((option) => option.id)
    ).toEqual(["appear", "disappear", "on", "off", "park", "update", "pop", "custom-label"]);
    expect(
      flowGameObjectComponentTargetOptions(
        stageLayouts,
        compositions,
        { id: "intro" },
        "intro",
        "moment:bubble"
      )
    ).toEqual([
      { id: "", name: "Whole Game Object" },
      { id: "bubble-card", name: "Bubble Card (bubble-card)" },
      { id: "bubble-card/answer-text", name: "  Answer Text (bubble-card/answer-text)" }
    ]);
    expect(
      flowGameObjectAnimationLabelOptions(
        stageLayouts,
        compositions,
        { id: "intro" },
        "intro",
        "moment:bubble",
        "answer-text",
        ""
      ).map((option) => option.id)
    ).toContain("text-pop");
    expect(
      flowGameObjectAnimationLabelOptions(
        stageLayouts,
        compositions,
        { id: "intro" },
        "intro",
        "moment:bubble",
        "bubble-card/answer-text",
        ""
      ).map((option) => option.id)
    ).toContain("text-pop");
    expect(
      flowGameObjectAnimationLabelOptions(
        stageLayouts,
        compositions,
        { id: "intro" },
        "intro",
        "global:wipe",
        "",
        ""
      ).map((option) => option.id)
    ).toContain("sweep");
  });

  it("expands referenced prefab components for animation targets", () => {
    const stageLayouts = {
      states: [
        {
          id: "intro",
          elements: [{ id: "player", name: "Player", artCompositionId: "player-object" }]
        }
      ]
    };
    const compositions = [
      {
        id: "player-object",
        name: "Player Object",
        components: [
          {
            id: "answer-bubble-slot",
            name: "Answer Bubble Slot",
            kind: "reference",
            artCompositionId: "answer-bubble"
          }
        ]
      },
      {
        id: "answer-bubble",
        name: "Answer Bubble",
        components: [
          {
            id: "answer-text",
            name: "Answer Text",
            kind: "text",
            timeline: {
              fps: 30,
              frameCount: 12,
              labels: [{ name: "pulse", frame: 4 }],
              commands: [],
              tracks: []
            }
          }
        ]
      }
    ];

    expect(
      flowGameObjectComponentTargetOptions(
        stageLayouts,
        compositions,
        { id: "intro" },
        "intro",
        "moment:player"
      )
    ).toEqual([
      { id: "", name: "Whole Game Object" },
      { id: "answer-bubble-slot", name: "Answer Bubble Slot (answer-bubble-slot)" },
      { id: "answer-bubble-slot/answer-text", name: "  Answer Text (answer-bubble-slot/answer-text)" }
    ]);
    expect(
      flowGameObjectAnimationLabelOptions(
        stageLayouts,
        compositions,
        { id: "intro" },
        "intro",
        "moment:player",
        "answer-bubble-slot/answer-text",
        ""
      ).map((option) => option.id)
    ).toContain("pulse");
  });
});
