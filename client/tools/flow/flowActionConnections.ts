import type { FlowAction } from "../../types/game-data";
import { ensureDecisionBranches } from "./flowDecision";
import { isFlowSubroutineAction } from "./flowSubroutines";
import type { IsInputType } from "./flowNodeGraph";

const NO_FLOW_TARGETS = new Set(["", "none", "noFlow"]);

export interface FlowActionContinuation {
  kind: "field" | "branch";
  field?: string;
  branchId?: string;
  target: string;
}

export function isEmptyFlowTarget(value: unknown): boolean {
  return NO_FLOW_TARGETS.has(String(value || ""));
}

export function flowActionTargetFields(
  action: Pick<FlowAction, "type">,
  isInputType: IsInputType
): string[] {
  if (action.type === "jumpNode") return ["jumpTargetActionId"];
  if (action.type === "presentText") return ["stageClickTargetActionId"];
  if (action.type === "requestMicrophoneAccessInput") {
    return ["microphoneAccessGrantedTargetActionId"];
  }
  if (action.type === "voteOnAnswersInput" || isInputType(action.type)) {
    return ["timerEndTargetActionId", "answersSubmittedTargetActionId"];
  }
  if (
    action.type === "labelNode" ||
    action.type === "codeNode" ||
    isFlowSubroutineAction(action)
  ) {
    return ["nextTargetActionId"];
  }
  if (action.type === "decision") return [];
  return ["nextTargetActionId"];
}

export function primaryFlowActionContinuation(
  action: FlowAction,
  isInputType: IsInputType
): FlowActionContinuation | null {
  if (action.type === "decision") {
    const branches = ensureDecisionBranches(action);
    const noMatch = branches.find((candidate) => candidate.type === "noMatch");
    const branch =
      (!isEmptyFlowTarget(noMatch?.targetActionId) ? noMatch : undefined) ||
      branches.find((candidate) => !isEmptyFlowTarget(candidate.targetActionId)) ||
      noMatch ||
      branches[0];
    return branch
      ? {
          kind: "branch",
          branchId: String(branch.id || ""),
          target: String(branch.targetActionId || "")
        }
      : null;
  }

  const fields = flowActionTargetFields(action, isInputType);
  if (!fields.length) return null;
  const record = action as Record<string, unknown>;
  const field =
    fields.find((candidate) => !isEmptyFlowTarget(record[candidate])) || fields[0];
  return {
    kind: "field",
    field,
    target: String(record[field] || "")
  };
}

export function setFlowActionContinuation(
  action: FlowAction,
  continuation: Pick<FlowActionContinuation, "kind" | "field" | "branchId">,
  target: string
): void {
  if (continuation.kind === "branch") {
    const branches = ensureDecisionBranches(action);
    const branch = branches.find((candidate) => candidate.id === continuation.branchId);
    if (branch) branch.targetActionId = target;
    action.branches = branches as unknown as FlowAction["branches"];
    return;
  }
  if (continuation.field) {
    (action as Record<string, unknown>)[continuation.field] = target;
  }
}

/**
 * Carries a visible continuation across action-type schemas. Input actions have
 * two completion exits, so an empty new exit inherits the old destination while
 * already-connected exits keep their distinct destinations.
 */
export function preserveFlowActionContinuation(
  action: FlowAction,
  previous: FlowActionContinuation | null,
  isInputType: IsInputType
): void {
  if (!previous || isEmptyFlowTarget(previous.target)) return;
  if (action.type === "decision") {
    const branches = ensureDecisionBranches(action);
    const noMatch = branches.find((candidate) => candidate.type === "noMatch") || branches[0];
    const sameBranchSchema =
      previous.kind === "branch" &&
      branches.some((candidate) => candidate.id === previous.branchId);
    if (noMatch && (!sameBranchSchema || isEmptyFlowTarget(noMatch.targetActionId))) {
      noMatch.targetActionId = previous.target;
    }
    action.branches = branches as unknown as FlowAction["branches"];
    return;
  }

  const record = action as Record<string, unknown>;
  const fields = flowActionTargetFields(action, isInputType);
  const sameFieldSchema =
    previous.kind === "field" &&
    Boolean(previous.field) &&
    fields.includes(previous.field as string);
  for (const field of fields) {
    if (!sameFieldSchema || isEmptyFlowTarget(record[field])) {
      record[field] = previous.target;
    }
  }
}
