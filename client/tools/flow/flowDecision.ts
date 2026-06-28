import type { FlowAction, JsonObject } from "../../types/game-data";

export interface FlowDecisionBranch extends JsonObject {
  id: string;
  type: string;
  value?: string;
  code?: string;
  targetActionId?: string;
  targetNodeId?: string;
}

export interface MakeDecisionBranchIdOptions {
  now?: () => number;
  random?: () => number;
}

export interface EnsureDecisionBranchesOptions {
  targetField?: string;
  trueTargetField?: string;
  falseTargetField?: string;
  makeBranchId?: (type?: string) => string;
}

const decisionVariableLabels: Record<string, string> = {
  activePlayerCount: "Active Player Count",
  currentRound: "Current Round",
  numSequentialGames: "Sequential Games",
  isFirstGameOfSession: "Is First Game",
  gameTitle: "Game Title",
  numberOfRounds: "Number of Rounds",
  randomChanceTest: "Random Chance Test",
  overrideFirstGameOfSession: "Override First Game",
  craftingTimerDuration: "Crafting Timer Duration"
};

export function decisionVariableName(variable: string): string {
  return decisionVariableLabels[variable] || variable || "Variable";
}

export function makeDecisionBranchId(type = "branch", options: MakeDecisionBranchIdOptions = {}): string {
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  return `${type}-${now().toString(36)}-${random().toString(36).slice(2, 7)}`;
}

export function ensureDecisionBranches(action: FlowAction | null | undefined, options: EnsureDecisionBranchesOptions = {}): FlowDecisionBranch[] {
  if (!action) return [];
  const targetField = options.targetField || "targetActionId";
  const trueTargetField = options.trueTargetField || "trueTargetActionId";
  const falseTargetField = options.falseTargetField || "falseTargetActionId";
  const branchIdFactory = options.makeBranchId || makeDecisionBranchId;
  if (!Array.isArray(action.branches) || !action.branches.length) {
    action.branches = [
      {
        id: "legacy-hit",
        type: "code",
        code: `x ${action.operator || "<"} ${action.compareValue || "3"}`,
        value: String(action.compareValue || "3"),
        [targetField]: String(action[trueTargetField] || "")
      },
      {
        id: "no-match",
        type: "noMatch",
        [targetField]: String(action[falseTargetField] || "")
      }
    ] as FlowAction[];
  }
  const normalizedBranches = action.branches.map((branch, index) => {
    const targetActionId = String(branch.targetActionId || "");
    const targetNodeId = String(branch.targetNodeId || "");
    const target = String(branch[targetField] || (targetField === "targetNodeId" ? targetActionId : "") || "");
    const normalized: FlowDecisionBranch = {
      id: String(branch.id || (branch.type === "noMatch" ? "no-match" : branchIdFactory(`branch-${index + 1}`))),
      type: ["hit", "code", "noMatch"].includes(String(branch.type)) ? String(branch.type) : "hit",
      value: String(branch.value ?? ""),
      code: String(branch.code || "x < 3"),
      [targetField]: target
    };
    if (targetField !== "targetActionId" && targetActionId) normalized.targetActionId = targetActionId;
    if (targetField !== "targetNodeId" && targetNodeId) normalized.targetNodeId = targetNodeId;
    return normalized;
  });
  const regular = normalizedBranches.filter((branch) => branch.type !== "noMatch");
  const noMatch = normalizedBranches.find((branch) => branch.type === "noMatch") || { id: "no-match", type: "noMatch", value: "", code: "", [targetField]: "" };
  action.branches = [...regular, { ...noMatch, type: "noMatch", id: noMatch.id || "no-match" }] as FlowAction[];
  return action.branches as FlowDecisionBranch[];
}

export function decisionBranchById(action: FlowAction | null | undefined, branchId: string, options: EnsureDecisionBranchesOptions = {}): FlowDecisionBranch | undefined {
  return ensureDecisionBranches(action, options).find((branch) => branch.id === branchId);
}

export function decisionBranchName(branch: Partial<FlowDecisionBranch> | null | undefined, index = 0): string {
  if (!branch) return "Branch";
  if (branch.type === "noMatch") return "No Match";
  if (branch.type === "code") return `Code ${index + 1}`;
  return `Hit ${branch.value || "Value"}`;
}

export function decisionBranchWireLabel(branch: Partial<FlowDecisionBranch> | null | undefined, index = 0): string {
  if (!branch) return "";
  if (branch.type === "code") return branch.code || decisionBranchName(branch, index);
  if (branch.type === "hit") return String(branch.value || decisionBranchName(branch, index));
  return decisionBranchName(branch, index);
}
