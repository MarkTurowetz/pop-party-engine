import type { FlowAction, GameFlow } from "../../types/game-data";
import { decisionBranchName, ensureDecisionBranches } from "./flowDecision";
import { flowSubroutineActions, isFlowSubroutineAction, type FlowSubroutine } from "./flowSubroutines";

/**
 * Typed model for the Flow node-graph canvas. Mirrors the legacy
 * `flow-node-view.js` node geometry (positions persist on the data as
 * `nodePosition` / `startNodePosition` / `returnNodePosition`, so saved JSON stays
 * compatible). This module is pure: it derives node descriptors from the flow and
 * selection; rendering + interaction live in the React canvas.
 */
export type FlowNodeDepth = "subroutines" | "subroutine";

export interface FlowNodePoint {
  x: number;
  y: number;
}

export interface FlowGraphNode {
  id: string;
  /** Root/nested subroutine, action, or a system node ("start"/"return"). */
  kind: "subroutine" | "action" | "system";
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
  /** "field" sets action[field]; "branch" sets a decision branch target; "entry"/"nextSubroutine" are subroutine-level. */
  kind: "field" | "branch" | "entry" | "nextSubroutine";
  field?: string;
  branchId?: string;
  currentTarget: string;
}

export type IsInputType = (type: string) => boolean;

export interface FlowNodePositionUpdate {
  nodeId: string;
  x: number;
  y: number;
}

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
      .map((branch, index) => ({
        to: String(branch.targetActionId || ""),
        label: decisionBranchName(branch, index)
      }))
      .filter((exit) => !isNoFlowTarget(exit.to));
  }
  if (action.type === "jumpNode") {
    const target = String((action as Record<string, unknown>).jumpTargetActionId || "");
    return isNoFlowTarget(target) ? [] : [{ to: target, label: "Jump" }];
  }
  const record = action as Record<string, unknown>;
  return EXIT_FIELDS.map((exit) => ({
    to: String(record[exit.field] || ""),
    label: exit.label
  })).filter((exit) => !isNoFlowTarget(exit.to));
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

export function savedNodePosition(
  position: FlowNodePoint | null | undefined,
  fallback: FlowNodePoint
): FlowNodePoint {
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

function subroutineClassName(): string {
  return "is-subroutine";
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

/** Nodes for the root subroutines depth: one node per root flow subroutine. */
export function rootSubroutineGraphNodes(
  flow: GameFlow | null,
  selection: FlowGraphSelection = {}
): FlowGraphNode[] {
  const subroutines = flow?.states || [];
  const selectedActionIds = new Set(selection.selectedActionIds || []);
  return subroutines.map((state, index) => {
    const { x, y } = savedNodePosition(
      readPoint(state.nodePosition),
      defaultNodePosition(index, 3, 80, 80, 420, 240)
    );
    const nextName = state.nextStateTargetId
      ? subroutines.find((item) => item.id === state.nextStateTargetId)?.name || state.nextStateTargetId
      : "";
    const selected =
      !selection.selectedRouteNodeId &&
      !selection.selectedActionId &&
      (selection.selectedStateId === state.id || selectedActionIds.has(state.id));
    return {
      id: state.id,
      kind: "subroutine",
      title: state.name || state.id,
      subtitle: `${(state.actions || []).length} actions${nextName ? ` / Next: ${nextName}` : ""}`,
      timing: "",
      x,
      y,
      width: 300,
      height: 150,
      className: subroutineClassName(),
      selected
    };
  });
}

/** Nodes inside a subroutine: Start + child actions/subroutines + Return. */
export function subroutineGraphNodes(
  subroutine: FlowSubroutine | null,
  selection: FlowGraphSelection = {}
): FlowGraphNode[] {
  if (!subroutine) return [];
  const selectedActionIds = new Set(selection.selectedActionIds || []);
  const isSelected = (id: string) => selection.selectedActionId === id || selectedActionIds.has(id);

  const startPos = savedNodePosition(
    readPoint((subroutine as { startNodePosition?: unknown }).startNodePosition),
    { x: 70, y: 70 }
  );
  const nodes: FlowGraphNode[] = [
    {
      id: "start",
      kind: "system",
      title: "Start",
      subtitle: subroutine.entryTargetActionId
        ? `Entry -> ${subroutine.entryTargetActionId}`
        : "Subroutine entry",
      timing: "",
      x: startPos.x,
      y: startPos.y,
      width: 170,
      height: 86,
      className: "is-return",
      selected: isSelected("start")
    }
  ];

  flowSubroutineActions(subroutine).forEach((action, index) => {
    const { x, y } = savedNodePosition(
      readPoint(action.nodePosition),
      defaultNodePosition(index, 3, 340, 70, 360, 230)
    );
    const isLabel = action.type === "labelNode";
    const isCode = action.type === "codeNode";
    const isSubroutine = isFlowSubroutineAction(action);
    nodes.push({
      id: action.id,
      kind: isSubroutine ? "subroutine" : "action",
      title: isSubroutine
        ? action.name || `Subroutine ${index + 1}`
        : isLabel
        ? String(action.labelText || action.name || "Flow note")
        : action.name || `Action ${index + 1}`,
      subtitle: isSubroutine
        ? `${flowSubroutineActions(action).length} actions`
        : isCode
          ? String(action.code || "g.example = true")
          : action.type,
      timing:
        action.type === "decision" || action.type === "jumpNode" || isLabel || isCode
          ? ""
          : actionTimingLabel(action),
      x,
      y,
      width: action.type === "decision" || isLabel || isCode ? 320 : 260,
      height: 134,
      className: isSubroutine ? subroutineClassName() : actionClassName(action),
      selected: isSelected(action.id)
    });
  });

  const returnPos = savedNodePosition(
    readPoint((subroutine as { returnNodePosition?: unknown }).returnNodePosition),
    { x: 1240, y: 720 }
  );
  nodes.push({
    id: "return",
    kind: "system",
    title: "Return",
    subtitle: "Back to parent subroutine",
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
  if (isFlowSubroutineAction(action)) {
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

/** Output exits per node inside any subroutine (Start entry + each child action's exits). */
export function subroutineNodeExits(subroutine: FlowSubroutine | null, isInputType: IsInputType): FlowNodeExit[] {
  if (!subroutine) return [];
  const exits: FlowNodeExit[] = [
    {
      id: "start:entry",
      nodeId: "start",
      label: "Entry",
      kind: "entry",
      currentTarget: String(subroutine.entryTargetActionId || "")
    }
  ];
  for (const action of flowSubroutineActions(subroutine)) {
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

/** Output exits per node for the root subroutines depth (each root subroutine's Next). */
export function rootSubroutineNodeExits(flow: GameFlow | null): FlowNodeExit[] {
  return (flow?.states || []).map((state) => ({
    id: `${state.id}:next`,
    nodeId: state.id,
    label: "Next",
    kind: "nextSubroutine",
    currentTarget: String(state.nextStateTargetId || "")
  }));
}

/** Connections for the root subroutines depth: root subroutine -> nextStateTargetId. */
export function rootSubroutineGraphConnections(flow: GameFlow | null): FlowGraphConnection[] {
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

/** Connections inside any subroutine: start -> entry, action -> exit targets. */
export function subroutineGraphConnections(subroutine: FlowSubroutine | null): FlowGraphConnection[] {
  if (!subroutine) return [];
  const nodeIds = new Set<string>([
    "start",
    "return",
    ...flowSubroutineActions(subroutine).map((action) => action.id)
  ]);
  const connections: FlowGraphConnection[] = [];

  const entry = String(subroutine.entryTargetActionId || "");
  if (!isNoFlowTarget(entry) && nodeIds.has(entry)) {
    connections.push({ id: `start->${entry}`, from: "start", to: entry, label: "Entry" });
  }

  for (const action of flowSubroutineActions(subroutine)) {
    for (const exit of actionExitTargets(action)) {
      if (!nodeIds.has(exit.to)) continue;
      connections.push({
        id: `${action.id}->${exit.to}:${exit.label}`,
        from: action.id,
        to: exit.to,
        label: exit.label
      });
    }
  }
  return connections;
}

function orderedGraphNodesForLayout(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  depth: FlowNodeDepth
): FlowGraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, FlowGraphConnection[]>();
  connections.forEach((connection) => {
    if (!byId.has(connection.from) || !byId.has(connection.to)) return;
    const list = outgoing.get(connection.from) || [];
    list.push(connection);
    outgoing.set(connection.from, list);
  });

  const ordered: FlowGraphNode[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    const node = byId.get(nodeId);
    if (!node) return;
    visited.add(nodeId);
    ordered.push(node);
    (outgoing.get(nodeId) || []).forEach((connection) => visit(connection.to));
  };

  const startId = depth === "subroutine" && byId.has("start") ? "start" : nodes[0]?.id || "";
  visit(startId);
  nodes.forEach((node) => visit(node.id));
  return ordered;
}

export function optimizedVerticalNodePositions(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  depth: FlowNodeDepth
): FlowNodePositionUpdate[] {
  if (!nodes.length) return [];
  const orderedNodes = orderedGraphNodesForLayout(nodes, connections, depth);
  const centerX = Math.max(
    depth === "subroutines" ? 420 : 470,
    Math.round(nodes.reduce((sum, node) => sum + node.x + node.width / 2, 0) / nodes.length)
  );
  let y = 70;
  return orderedNodes.map((node) => {
    const position = {
      nodeId: node.id,
      x: Math.max(0, Math.round(centerX - node.width / 2)),
      y
    };
    y += Math.max(node.height + 90, depth === "subroutines" ? 240 : 190);
    return position;
  });
}
