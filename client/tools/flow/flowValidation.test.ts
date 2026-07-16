import { describe, expect, it } from "vitest";
import {
  assertFlowModel,
  collectFlowValidationIssues,
  FlowValidationError,
  isFlowModel
} from "./flowValidation";

describe("Flow validation helpers", () => {
  it("accepts the compatible flow model shape", () => {
    const flow = {
      states: [
        {
          id: "intro",
          name: "Intro",
          actions: [
            {
              id: "show-title",
              type: "presentText",
              subActions: [{ id: "show-subtitle", type: "presentText" }]
            },
            {
              id: "branch",
              type: "decision",
              branches: [{ id: "branch-a", type: "match" }]
            }
          ]
        }
      ],
      routeNodes: [{ id: "entry", routeNodeType: "momentEntry" }]
    };

    expect(isFlowModel(flow)).toBe(true);
    expect(() => assertFlowModel(flow)).not.toThrow();
  });

  it("reports path-specific issues", () => {
    expect(
      collectFlowValidationIssues({
        states: [{ id: 42, actions: [{ type: "presentText" }] }],
        routeNodes: {}
      })
    ).toEqual([
      { path: "flow.states[0].id", message: "must be a string" },
      { path: "flow.states[0].actions[0].id", message: "must be a string" },
      { path: "flow.routeNodes", message: "must be an array when present" }
    ]);
  });

  it("throws a typed validation error", () => {
    expect(() => assertFlowModel({ states: "nope" }, "runtimeFlow")).toThrow(FlowValidationError);
    try {
      assertFlowModel({ states: "nope" }, "runtimeFlow");
    } catch (error) {
      expect(error).toBeInstanceOf(FlowValidationError);
      expect((error as FlowValidationError).issues[0]).toEqual({
        path: "runtimeFlow.states",
        message: "must be an array"
      });
    }
  });

  it("rejects duplicate action identities before history or save can merge them", () => {
    const issues = collectFlowValidationIssues({
      states: [
        {
          id: "lobby",
          actions: [
            { id: "same-action", type: "presentText" },
            {
              id: "parent",
              type: "subroutine",
              actions: [{ id: "same-action", type: "displayText" }]
            }
          ]
        }
      ],
      routeNodes: []
    });

    expect(issues).toContainEqual({
      path: "flow.states[0].actions[1].actions[0].id",
      message: "duplicates flow.states[0].actions[0].id"
    });
  });
});
