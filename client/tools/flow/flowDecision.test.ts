import { describe, expect, it } from "vitest";
import {
  decisionBranchById,
  decisionBranchName,
  decisionBranchWireLabel,
  decisionVariableName,
  ensureDecisionBranches,
  makeDecisionBranchId
} from "./flowDecision";
import type { FlowAction } from "../../types/game-data";

describe("Flow decision helpers", () => {
  it("maps decision variable labels with legacy fallback behavior", () => {
    expect(decisionVariableName("currentRound")).toBe("Current Round");
    expect(decisionVariableName("customVariable")).toBe("customVariable");
    expect(decisionVariableName("")).toBe("Variable");
  });

  it("creates deterministic branch IDs when generators are supplied", () => {
    expect(makeDecisionBranchId("branch", { now: () => 123456789, random: () => 0.5 })).toBe("branch-21i3v9-i");
  });

  it("normalizes legacy decision actions into ordered branches", () => {
    const action = {
      id: "decision",
      type: "decision",
      operator: ">",
      compareValue: "5",
      trueTargetActionId: "win",
      falseTargetActionId: "lose"
    } as FlowAction;

    expect(ensureDecisionBranches(action)).toEqual([
      {
        id: "legacy-hit",
        type: "code",
        code: "x > 5",
        value: "5",
        targetActionId: "win"
      },
      {
        id: "no-match",
        type: "noMatch",
        value: "",
        code: "x < 3",
        targetActionId: "lose"
      }
    ]);
    expect(action.branches).toEqual(ensureDecisionBranches(action));
  });

  it("normalizes target-node branches while preserving alternate target IDs", () => {
    const action = {
      id: "decision",
      type: "decision",
      branches: [
        { id: "", type: "other", value: 7, targetActionId: "action-a" },
        { id: "no-match", type: "noMatch", targetNodeId: "node-b" }
      ]
    } as FlowAction;

    expect(ensureDecisionBranches(action, { targetField: "targetNodeId", makeBranchId: (type) => `${type}-fixed` })).toEqual([
      {
        id: "branch-1-fixed",
        type: "hit",
        value: "7",
        code: "x < 3",
        targetNodeId: "action-a",
        targetActionId: "action-a"
      },
      {
        id: "no-match",
        type: "noMatch",
        value: "",
        code: "x < 3",
        targetNodeId: "node-b"
      }
    ]);
  });

  it("finds, names, and labels decision branches", () => {
    const action = {
      id: "decision",
      type: "decision",
      branches: [
        { id: "branch-hit", type: "hit", value: "yes" },
        { id: "branch-code", type: "code", code: "x > 10" },
        { id: "no-match", type: "noMatch" }
      ]
    } as FlowAction;

    expect(decisionBranchById(action, "branch-hit")).toMatchObject({ id: "branch-hit" });
    expect(decisionBranchName({ type: "hit", value: "yes" })).toBe("Hit yes");
    expect(decisionBranchName({ type: "code" }, 1)).toBe("Code 2");
    expect(decisionBranchName({ type: "noMatch" })).toBe("No Match");
    expect(decisionBranchWireLabel({ type: "hit", value: "yes" })).toBe("yes");
    expect(decisionBranchWireLabel({ type: "code", code: "x > 10" }, 1)).toBe("x > 10");
    expect(decisionBranchWireLabel({ type: "noMatch" })).toBe("No Match");
  });
});
