import type { FlowAction, FlowState, GameFlow } from "../../types/game-data";
import { decisionBranchName, ensureDecisionBranches } from "./flowDecision";

/**
 * Typed model for the Flow node-graph canvas. Mirrors the legacy
 * `flow-node-view.js` node geometry (positions persist on the data as
 * `nodePosition` / `startNodePosition` / `returnNodePosition`, so saved JSON stays
 * compatible). This module is pure: it derives node descriptors from the flow and
 * selection; rendering + interaction live in the React canvas.
 */
export type FlowNodeDepth = "moments" | "actions";

export interface FlowNodePoint {
  x: number;
  y: number;
}

export interface FlowGraphNode {
  id: string;
  /** "state" (moments depth), "action", or a system node ("start"/"return"). */
  kind: "state" | "action" | "system";
  title: string;
  subtitle: string;
  timing: string;
  x: number;
  y: number;
  width: number;
  height: number;
  className: string;
  selected: boolean;
}

export interface FlowGraphSelection {
  selectedStateId?: string;
  selectedActionId?: string;
  selectedActionIds?: Iterable<string>;
  selectedRouteNodeId?: string;
}

export interface FlowGraphConnection {
  id: string;
  from: string;
  to: string;
  label: string;
}

/** A draggable output on a node that sets a target when wired to another node. */
export interface FlowNodeExit {
  id: string;
  nodeId: string;
  label: string;
  /** "field" sets action[field]; "branch" sets a decision branch target; "entry"/"nextState" are state-level. */
  kind: "field" | "branch" | "entry" | "nextState";
  field?: string;
  branchId?: string;
  currentTarget: string;
}

export type IsInputType = (type: string) => boolean;

const EXIT_FIELDS: { field: string; label: string }[] = [
  { field: "nextTargetActionId", label: "Next" },
  { field: "stageClickTargetActionId", label: "Screen Click" },
  { field: "timerEndTargetActionId", label: "Timer Ends" },
  { field: "answersSubmittedTargetActionId", label: "Answers" },
  { field: "microphoneAccessGrantedTargetActionId", label: "Access Granted" }
];

function isNoFlowTarget(value: string): boolean {
  return !value || value === "none" || value === "noFlow";
}

function actionExitTargets(action: FlowAction): { to: string; label: string }[] {
  if (action.type === "decision") {
    return ensureDecisionBranches(action)
      .map((branch, index) => ({ to: String(branch.targetActionId || ""), label: decisionBranchName(branch, index) }))
      .filter((exit) => !isNoFlowTarget(exit.to));
  }
  if (action.type === "jumpNode") {
    const target = String((action as Record<string, unknown>).jumpTargetActionId || "");
    return isNoFlowTarget(target) ? [] : [{ to: target, label: "Jump" }];
  }
  const record = action as Record<string, unknown>;
  return EXIT_FIELDS.map((exit) => ({ to: String(record[exit.field] || ""), label: exit.label })).filter(
    (exit) => !isNoFlowTarget(exit.to)
  );
}

export function defaultNodePosition(
  index: number,
  columns = 3,
  startX = 80,
  startY = 80,
  gapX = 380,
  gapY = 230
): FlowNodePoint {
  return {
    x: startX + (index % columns) * gapX,
    y: startY + Math.floor(index / columns) * gapY
  };
}

export function savedNodePosition(position: FlowNodePoint | null | undefined, fallback: FlowNodePoint): FlowNodePoint {
  const x = Number(position?.x);
  const y = Number(position?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : fallback;
}

function readPoint(value: unknown): FlowNodePoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; y?: unknown };
  return { x: Number(point.x), y: Number(point.y) };
}

function actionTimingLabel(action: FlowAction): string {
  const timing = action.timing;
  if (!timing) return "";
  const mode = typeof timing.mode === "string" && timing.mode ? timing.mode : "E+";
  const seconds = Number(timing.seconds ?? 0);
  return `${mode} ${Number.isFinite(seconds) ? seconds.toFixed(2) : "0.00"}s`;
}

function stateClassName(): string {
  return "is-moment";
}

function actionClassName(action: FlowAction): string {
  switch (action.type) {
    case "decision":
      return "is-decision";
    case "jumpNode":
      return "is-jump";
    case "labelNode":
      return "is-label";
    case "codeNode":
      return "is-code";
    case "transition":
    case "transitionState":
      return "is-transition";
    default:
      return "is-standard";
  }
}

/** Nodes for the "moments" depth: one node per flow state. */
export function momentGraphNodes(flow: GameFlow | null, selection: FlowGraphSelection = {}): FlowGraphNode[] {
  const states = flow?.states || [];
  const selectedActionIds = new Set(selection.selectedActionIds || []);
  return states.map((state, index) => {
    const { x, y } = savedNodePosition(readPoint(state.nodePosition), defaultNodePosition(index, 3, 80, 80, 420, 240));
    const nextName = state.nextStateTargetId
      ? states.find((item) => item.id === state.nextStateTargetId)?.name || state.nextStateTargetId
      : "";
    const selected =
      !selection.selectedRouteNodeId &&
      !selection.selectedActionId &&
      (selection.selectedStateId === state.id || selectedActionIds.has(state.id));
    return {
      id: state.id,
      kind: "state",
      title: state.name || state.id,
      subtitle: `${(state.actions || []).length} actions${nextName ? ` / Next: ${nextName}` : ""}`,
      timing: "",
      x,
      y,
      width: 300,
      height: 150,
      className: stateClassName(),
      selected
    };
  });
}

/** Nodes for the "actions" depth: Start + one node per action + Return, for one state. */
export function actionGraphNodes(state: FlowState | null, selection: FlowGraphSelection = {}): FlowGraphNode[] {
  if (!state) return [];
  const selectedActionIds = new Set(selection.selectedActionIds || []);
  const isSelected = (id: string) => selection.selectedActionId === id || selectedActionIds.has(id);

  const startPos = savedNodePosition(
    readPoint((state as { startNodePosition?: unknown }).startNodePosition),
    { x: 70, y: 70 }
  );
  const nodes: FlowGraphNode[] = [
    {
      id: "start",
      kind: "system",
      title: "Start",
      subtitle: state.entryTargetActionId ? `Entry -> ${state.entryTargetActionId}` : "Moment entry",
      timing: "",
      x: startPos.x,
      y: startPos.y,
      width: 170,
      height: 86,
      className: "is-return",
      selected: isSelected("start")
    }
  ];

  (state.actions || []).forEach((action, index) => {
    const { x, y } = savedNodePosition(readPoint(action.nodePosition), defaultNodePosition(index, 3, 340, 70, 360, 230));
    const isLabel = action.type === "labelNode";
    const isCode = action.type === "codeNode";
    nodes.push({
      id: action.id,
      kind: "action",
      title: isLabel
        ? String(action.labelText || action.name || "Flow note")
        : action.name || `Action ${index + 1}`,
      subtitle: isCode ? String(action.code || "g.example = true") : action.type,
      timing: action.type === "decision" || action.type === "jumpNode" || isLabel || isCode ? "" : actionTimingLabel(action),
      x,
      y,
      width: action.type === "decision" || isLabel || isCode ? 320 : 260,
      height: 134,
      className: actionClassName(action),
      selected: isSelected(action.id)
    });
  });

  const returnPos = savedNodePosition(
    readPoint((state as { returnNodePosition?: unknown }).returnNodePosition),
    { x: 1240, y: 720 }
  );
  nodes.push({
    id: "return",
    kind: "system",
    title: "Return",
    subtitle: "Back to moments",
    timing: "",
    x: returnPos.x,
    y: returnPos.y,
    width: 190,
    height: 92,
    className: "is-return",
    selected: isSelected("return")
  });

  return nodes;
}

interface ExitDefinition {
  label: string;
  field?: string;
  branchId?: string;
}

/** Faithful port of legacy `flowNodeExitDefinitions` — the outputs a node exposes. */
function exitDefinitions(action: FlowAction, isInputType: IsInputType): ExitDefinition[] {
  if (action.type === "decision") {
    return ensureDecisionBranches(action).map((branch, index) => ({
      label: decisionBranchName(branch, index),
      branchId: branch.id
    }));
  }
  if (action.type === "labelNode" || action.type === "codeNode") {
    return [{ label: "Next", field: "nextTargetActionId" }];
  }
  if (action.type === "voteOnAnswersInput") {
    return [
      { label: "Timer Ends", field: "timerEndTargetActionId" },
      { label: "Votes Submitted", field: "answersSubmittedTargetActionId" }
    ];
  }
  if (action.type === "presentText") {
    return [{ label: "Screen Click", field: "stageClickTargetActionId" }];
  }
  if (action.type === "requestMicrophoneAccessInput") {
    return [{ label: "Access Granted", field: "microphoneAccessGrantedTargetActionId" }];
  }
  if (isInputType(action.type)) {
    return [
      { label: "Timer Ends", field: "timerEndTargetActionId" },
      { label: "Answers", field: "answersSubmittedTargetActionId" }
    ];
  }
  if (action.type === "transitionState") {
    return [{ label: "Event Complete", field: "nextTargetActionId" }];
  }
  if (action.type === "jumpNode") return [];
  return [{ label: "Next", field: "nextTargetActionId" }];
}

/** Output exits per node for the "actions" depth (Start entry + each action's exits). */
export function actionNodeExits(state: FlowState | null, isInputType: IsInputType): FlowNodeExit[] {
  if (!state) return [];
  const exits: FlowNodeExit[] = [
    {
      id: "start:entry",
      nodeId: "start",
      label: "Entry",
      kind: "entry",
      currentTarget: String(state.entryTargetActionId || "")
    }
  ];
  for (const action of state.actions || []) {
    const record = action as Record<string, unknown>;
    for (const def of exitDefinitions(action, isInputType)) {
      if (def.branchId) {
        const branch = ensureDecisionBranches(action).find((item) => item.id === def.branchId);
        exits.push({
          id: `${action.id}:${def.branchId}`,
          nodeId: action.id,
          label: def.label,
          kind: "branch",
          branchId: def.branchId,
          currentTarget: String(branch?.targetActionId || "")
        });
      } else if (def.field) {
        exits.push({
          id: `${action.id}:${def.field}`,
          nodeId: action.id,
          label: def.label,
          kind: "field",
          field: def.field,
          currentTarget: String(record[def.field] || "")
        });
      }
    }
  }
  return exits;
}

/** Output exits per node for the "moments" depth (each state's Next). */
export function momentNodeExits(flow: GameFlow | null): FlowNodeExit[] {
  return (flow?.states || []).map((state) => ({
    id: `${state.id}:next`,
    nodeId: state.id,
    label: "Next",
    kind: "nextState",
    currentTarget: String(state.nextStateTargetId || "")
  }));
}

/** Connections for the "moments" depth: state -> nextStateTargetId. */
export function momentGraphConnections(flow: GameFlow | null): FlowGraphConnection[] {
  const states = flow?.states || [];
  const ids = new Set(states.map((state) => state.id));
  const connections: FlowGraphConnection[] = [];
  for (const state of states) {
    const target = String(state.nextStateTargetId || "");
    if (!isNoFlowTarget(target) && ids.has(target)) {
      connections.push({ id: `${state.id}->${target}`, from: state.id, to: target, label: "Next" });
    }
  }
  return connections;
}

/** Connections for the "actions" depth: start -> entry, action -> exit targets. */
export function actionGraphConnections(state: FlowState | null): FlowGraphConnection[] {
  if (!state) return [];
  const nodeIds = new Set<string>(["start", "return", ...(state.actions || []).map((action) => action.id)]);
  const connections: FlowGraphConnection[] = [];

  const entry = String(state.entryTargetActionId || "");
  if (!isNoFlowTarget(entry) && nodeIds.has(entry)) {
    connections.push({ id: `start->${entry}`, from: "start", to: entry, label: "Entry" });
  }

  for (const action of state.actions || []) {
    for (const exit of actionExitTargets(action)) {
      if (!nodeIds.has(exit.to)) continue;
      connections.push({ id: `${action.id}->${exit.to}:${exit.label}`, from: action.id, to: exit.to, label: exit.label });
    }
  }
  return connections;
}
