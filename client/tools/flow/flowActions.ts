import type { FlowAction } from "../../types/game-data";
import type { FlowActionTypeMeta } from "./flowSelectors";

export interface CreateDefaultFlowActionOptions {
  timestamp?: number;
}

export interface EnsureActionTimingOptions {
  actionTypeMeta?: (type: string) => Pick<FlowActionTypeMeta, "category">;
}

export function createDefaultFlowAction(
  stateId: string,
  name: string,
  isSubAction: boolean,
  options: CreateDefaultFlowActionOptions = {}
): FlowAction {
  const timestamp = typeof options.timestamp === "number" && Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
  return {
    id: `${stateId}-${isSubAction ? "sub-action" : "action"}-${timestamp.toString(36)}`,
    name,
    type: isSubAction ? "setPlayersShown" : "presentText",
    timing: { mode: isSubAction ? "S+" : "E+", seconds: 0 },
    text: "Presented text",
    textTarget: "",
    instant: false,
    isShown: true,
    subActions: []
  };
}

export function createDefaultFlowSubroutineAction(
  stateId: string,
  name: string,
  options: CreateDefaultFlowActionOptions = {}
): FlowAction {
  const timestamp = typeof options.timestamp === "number" && Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
  return {
    id: `${stateId}-subroutine-${timestamp.toString(36)}`,
    name,
    type: "subroutine",
    timing: { mode: "E+", seconds: 0 },
    entryTargetActionId: "",
    nextTargetActionId: "",
    actions: [],
    subActions: []
  };
}

export function ensureActionTiming(action: FlowAction, isSubAction = false, options: EnsureActionTimingOptions = {}) {
  if (!action.timing) action.timing = { mode: "E+", seconds: 0 };
  const isInputAction = options.actionTypeMeta?.(action.type)?.category === "input" && !isSubAction;
  if (isSubAction) {
    action.timing.mode = "S+";
  } else {
    action.timing.mode = action.timing.mode === "S+" && !isInputAction ? "S+" : "E+";
  }
  const seconds = Number(action.timing.seconds || 0);
  action.timing.seconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return action.timing;
}
