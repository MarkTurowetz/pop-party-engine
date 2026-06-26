import { installFlowActionOptionsAdapter, type PartyGameFlowActionOptions } from "./flowActionOptionsAdapter";
import { installFlowActionsAdapter, type PartyGameFlowActions } from "./flowActionsAdapter";
import { installFlowDecisionAdapter, type PartyGameFlowDecision } from "./flowDecisionAdapter";
import { installFlowMutationsAdapter, type PartyGameFlowMutations } from "./flowMutationsAdapter";
import { installFlowRouteGraphAdapter, type PartyGameFlowRouteGraph } from "./flowRouteGraphAdapter";
import { installFlowSelectionAdapter, type PartyGameFlowSelection } from "./flowSelectionAdapter";
import { installFlowSerializationAdapter, type PartyGameFlowSerialization } from "./flowSerializationAdapter";
import { installFlowSelectorsAdapter, type PartyGameFlowSelectors } from "./flowSelectorsAdapter";

export interface InstalledFlowAdapters {
  actionOptions: PartyGameFlowActionOptions;
  actions: PartyGameFlowActions;
  decision: PartyGameFlowDecision;
  mutations: PartyGameFlowMutations;
  routeGraph: PartyGameFlowRouteGraph;
  selection: PartyGameFlowSelection;
  serialization: PartyGameFlowSerialization;
  selectors: PartyGameFlowSelectors;
}

export function installFlowAdapters(target: Window = window): InstalledFlowAdapters {
  const adapters = {
    actionOptions: installFlowActionOptionsAdapter(target),
    actions: installFlowActionsAdapter(target),
    decision: installFlowDecisionAdapter(target),
    mutations: installFlowMutationsAdapter(target),
    routeGraph: installFlowRouteGraphAdapter(target),
    selection: installFlowSelectionAdapter(target),
    serialization: installFlowSerializationAdapter(target),
    selectors: installFlowSelectorsAdapter(target)
  };
  target.document?.documentElement?.setAttribute("data-flow-adapters", "module");
  return adapters;
}
