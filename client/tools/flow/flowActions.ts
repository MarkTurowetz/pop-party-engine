import type { FlowAction } from "../../types/game-data";

export interface CreateDefaultFlowActionOptions {
  timestamp?: number;
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
