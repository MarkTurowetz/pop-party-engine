import { createActionSummary, type FlowActionSummaryContext, type FlowActionSummaryRuntime } from "./flowActionSummary";

export interface PartyGameFlowActionSummary {
  createActionSummary: (context: FlowActionSummaryContext) => FlowActionSummaryRuntime;
}

declare global {
  interface Window {
    PartyGameFlowActionSummary?: PartyGameFlowActionSummary;
  }
}

export function installFlowActionSummaryAdapter(target: Window = window): PartyGameFlowActionSummary {
  const adapter = { createActionSummary };
  target.PartyGameFlowActionSummary = adapter;
  target.document?.documentElement?.setAttribute("data-flow-action-summary-adapter", "module");
  return adapter;
}
