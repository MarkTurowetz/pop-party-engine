import { createActionDefaults, type FlowActionDefaults, type FlowActionDefaultsContext } from "./flowActionDefaults";

export interface PartyGameFlowActionDefaults {
  createActionDefaults: (context: FlowActionDefaultsContext) => FlowActionDefaults;
}

declare global {
  interface Window {
    PartyGameFlowActionDefaults?: PartyGameFlowActionDefaults;
  }
}

export function installFlowActionDefaultsAdapter(target: Window = window): PartyGameFlowActionDefaults {
  const adapter = { createActionDefaults };
  target.PartyGameFlowActionDefaults = adapter;
  target.document?.documentElement?.setAttribute("data-flow-action-defaults-adapter", "module");
  return adapter;
}
