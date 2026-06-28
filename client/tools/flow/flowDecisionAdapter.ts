import {
  decisionBranchById,
  decisionBranchName,
  decisionBranchWireLabel,
  decisionVariableName,
  ensureDecisionBranches,
  makeDecisionBranchId,
  type EnsureDecisionBranchesOptions,
  type FlowDecisionBranch,
  type MakeDecisionBranchIdOptions
} from "./flowDecision";
import type { FlowAction } from "../../types/game-data";

export interface PartyGameFlowDecision {
  decisionBranchById: (action: FlowAction | null | undefined, branchId: string, options?: EnsureDecisionBranchesOptions) => FlowDecisionBranch | undefined;
  decisionBranchName: (branch: Partial<FlowDecisionBranch> | null | undefined, index?: number) => string;
  decisionBranchWireLabel: (branch: Partial<FlowDecisionBranch> | null | undefined, index?: number) => string;
  decisionVariableName: (variable: string) => string;
  ensureDecisionBranches: (action: FlowAction | null | undefined, options?: EnsureDecisionBranchesOptions) => FlowDecisionBranch[];
  makeDecisionBranchId: (type?: string, options?: MakeDecisionBranchIdOptions) => string;
}

declare global {
  interface Window {
    PartyGameFlowDecision?: PartyGameFlowDecision;
  }
}

export function installFlowDecisionAdapter(target: Window = window): PartyGameFlowDecision {
  const adapter = {
    decisionBranchById,
    decisionBranchName,
    decisionBranchWireLabel,
    decisionVariableName,
    ensureDecisionBranches,
    makeDecisionBranchId
  };
  target.PartyGameFlowDecision = adapter;
  target.document?.documentElement?.setAttribute("data-flow-decision-adapter", "module");
  return adapter;
}
