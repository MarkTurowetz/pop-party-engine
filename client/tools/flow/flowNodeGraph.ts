import type { FlowAction, GameFlow } from "../../types/game-data";
import {
  decisionBranchName,
  decisionBranchWireLabel,
  ensureDecisionBranches
} from "./flowDecision";
import { decisionBranchGraphNodeId } from "./flowDecisionBranchIdentity";
import {
  flowSubroutineActions,
  isFlowSubroutineAction,
  type FlowSubroutine
} from "./flowSubroutines";

export {
  decisionBranchGraphNodeId,
  parseDecisionBranchGraphNodeId
} from "./flowDecisionBranchIdentity";
export { optimizedVerticalNodePositions } from "./flowGraphLayout";

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
  kind: "subroutine" | "action" | "branch" | "subAction" | "system";
  title: string;
  subtitle: string;
  timing: string;
  x: number;
  y: number;
  width: number;
  height: number;
  className: string;
  selected: boolean;
  parentNodeId?: string;
  branchId?: string;
  subActionId?: string;
  draggable?: boolean;
}

export interface FlowGraphSelection {
  selectedStateId?: string;
  selectedActionId?: string;
  selectedActionIds?: Iterable<string>;
  selectedRouteNodeId?: string;
  selectedRouteBranchId?: string;
}

export interface FlowGraphConnection {
  id: string;
  from: string;
  to: string;
  label: string;
  labelKind?: "default" | "branch-hit" | "branch-code" | "branch-no-match" | "jump-preview";
  visibleWhenSelected?: boolean;
  fromAnchorNodeId?: string;
  fromPoint?: FlowNodePoint;
  toPoint?: FlowNodePoint;
}

/** A draggable output on a node that sets a target when wired to another node. */
export interface FlowNodeExit {
  id: string;
  nodeId: string;
  viewNodeId?: string;
  label: string;
  /** "field" sets action[field]; "branch" sets a decision branch target; "entry"/"nextSubroutine" are subroutine-level. */
  kind: "field" | "branch" | "entry" | "nextSubroutine";
  field?: string;
  branchId?: string;
  currentTarget: string;
  portSide?: "bottom" | "bottomCenter" | "right";
}

export type IsInputType = (type: string) => boolean;

export interface FlowNodePositionUpdate {
  nodeId: string;
  x: number;
  y: number;
}

const CHILD_NODE_TOP_GAP = 16;
const CHILD_NODE_GAP = 18;
const CHILD_NODE_SIDE_INSET = 20;
const CHILD_NODE_HEIGHT = 34;

export interface SubroutineGraphNodeOptions {
  includeSubActions?: boolean;
}

function isNoFlowTarget(value: string): boolean {
  return !value || value === "none" || value === "noFlow";
}

function actionExitTargets(
  action: FlowAction,
  isInputType: IsInputType
): Pick<FlowGraphConnection, "to" | "label" | "labelKind" | "visibleWhenSelected">[] {
  if (action.type === "jumpNode") {
    const target = String((action as Record<string, unknown>).jumpTargetActionId || "");
    return isNoFlowTarget(target)
      ? []
      : [{ to: target, label: "Jump", labelKind: "jump-preview", visibleWhenSelected: true }];
  }
  const record = action as Record<string, unknown>;
  return exitDefinitions(action, isInputType)
    .filter((exit) => exit.field)
    .map((exit) => ({
      to: String(record[exit.field as string] || ""),
      label: exit.label
    }))
    .filter((exit) => !isNoFlowTarget(exit.to));
}

export function decisionBranchConnectionKind(
  branch: Partial<FlowAction> | null | undefined
): FlowGraphConnection["labelKind"] {
  if (branch?.type === "code") return "branch-code";
  if (branch?.type === "noMatch") return "branch-no-match";
  return "branch-hit";
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

function subActionTimingSeconds(action: FlowAction): number {
  const seconds = Number(action.timing?.seconds ?? 0);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function subActionTimingLabel(action: FlowAction): string {
  return `S+ ${subActionTimingSeconds(action).toFixed(2)}s`;
}

function sortedSubActions(action: FlowAction): FlowAction[] {
  return (action.subActions || [])
    .map((subAction, index) => ({ subAction, index }))
    .sort((left, right) => {
      const timingDelta =
        subActionTimingSeconds(left.subAction) - subActionTimingSeconds(right.subAction);
      return timingDelta || left.index - right.index;
    })
    .map((entry) => entry.subAction);
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

function branchSubtitle(branch: FlowAction): string {
  if (branch.type === "hit") return String(branch.value || "Hit value");
  if (branch.type === "code") return String(branch.code || "x < 3");
  return "Fallback";
}

function childNodes(
  nodes: FlowGraphNode[],
  actionId: string,
  kind: FlowGraphNode["kind"]
): FlowGraphNode[] {
  return nodes.filter((node) => node.kind === kind && node.parentNodeId === actionId);
}

function decisionBranchNodes(nodes: FlowGraphNode[], actionId: string): FlowGraphNode[] {
  return childNodes(nodes, actionId, "branch");
}

function subActionNodes(nodes: FlowGraphNode[], actionId: string): FlowGraphNode[] {
  return childNodes(nodes, actionId, "subAction");
}

function bottomCenterAnchor(node: FlowGraphNode): FlowNodePoint {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height
  };
}

function childNodeWidth(parentWidth: number): number {
  return Math.max(180, parentWidth - CHILD_NODE_SIDE_INSET * 2);
}

function childNodeX(parentX: number, parentWidth: number): number {
  return parentX + (parentWidth - childNodeWidth(parentWidth)) / 2;
}

export function decisionBranchTargetAnchor(
  nodes: FlowGraphNode[],
  actionId: string
): FlowNodePoint | undefined {
  const branches = decisionBranchNodes(nodes, actionId);
  const lastBranch = branches[branches.length - 1];
  if (!lastBranch) return undefined;
  return bottomCenterAnchor(lastBranch);
}

export function decisionBranchTargetAnchorNodeId(
  nodes: FlowGraphNode[],
  actionId: string
): string | undefined {
  const branches = decisionBranchNodes(nodes, actionId);
  return branches[branches.length - 1]?.id;
}

export function subActionTargetAnchor(
  nodes: FlowGraphNode[],
  actionId: string
): FlowNodePoint | undefined {
  const subActions = subActionNodes(nodes, actionId);
  const lastSubAction = subActions[subActions.length - 1];
  return lastSubAction ? bottomCenterAnchor(lastSubAction) : undefined;
}

export function subActionTargetAnchorNodeId(
  nodes: FlowGraphNode[],
  actionId: string
): string | undefined {
  const subActions = subActionNodes(nodes, actionId);
  return subActions[subActions.length - 1]?.id;
}

function lastSortedSubActionId(action: FlowAction): string {
  const subActions = sortedSubActions(action);
  return String(subActions[subActions.length - 1]?.id || "");
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
      ? subroutines.find((item) => item.id === state.nextStateTargetId)?.name ||
        state.nextStateTargetId
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
  selection: FlowGraphSelection = {},
  options: SubroutineGraphNodeOptions = {}
): FlowGraphNode[] {
  if (!subroutine) return [];
  const includeSubActions = options.includeSubActions !== false;
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
    const actionHeight = 134;
    const actionWidth = action.type === "decision" || isLabel || isCode ? 320 : 260;
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
      width: actionWidth,
      height: actionHeight,
      className: isSubroutine ? subroutineClassName() : actionClassName(action),
      selected: isSelected(action.id)
    });
    if (action.type === "decision") {
      ensureDecisionBranches(action).forEach((branch, branchIndex) => {
        const branchId = String(branch.id);
        const branchNodeId = decisionBranchGraphNodeId(action.id, branchId);
        const isNoMatch = branch.type === "noMatch";
        nodes.push({
          id: branchNodeId,
          kind: "branch",
          title: decisionBranchName(branch, branchIndex),
          subtitle: branchSubtitle(branch as FlowAction),
          timing: "",
          x: childNodeX(x, actionWidth),
          y:
            y +
            actionHeight +
            CHILD_NODE_TOP_GAP +
            branchIndex * (CHILD_NODE_HEIGHT + CHILD_NODE_GAP),
          width: childNodeWidth(actionWidth),
          height: CHILD_NODE_HEIGHT,
          className: `is-branch${isNoMatch ? " is-no-match" : ""}`,
          selected: isSelected(branchNodeId),
          parentNodeId: action.id,
          branchId,
          draggable: false
        });
      });
    } else if (includeSubActions) {
      sortedSubActions(action).forEach((subAction, subActionIndex) => {
        const subActionId = String(subAction.id);
        nodes.push({
          id: subActionId,
          kind: "subAction",
          title: subAction.name || `Sub-action ${subActionIndex + 1}`,
          subtitle: "",
          timing: subActionTimingLabel(subAction),
          x: childNodeX(x, actionWidth),
          y:
            y +
            actionHeight +
            CHILD_NODE_TOP_GAP +
            subActionIndex * (CHILD_NODE_HEIGHT + CHILD_NODE_GAP),
          width: childNodeWidth(actionWidth),
          height: CHILD_NODE_HEIGHT,
          className: "is-sub-action",
          selected: isSelected(subActionId),
          parentNodeId: action.id,
          subActionId,
          draggable: false
        });
      });
    }
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
export function subroutineNodeExits(
  subroutine: FlowSubroutine | null,
  isInputType: IsInputType
): FlowNodeExit[] {
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
    const childExitViewNodeId = action.type === "decision" ? "" : lastSortedSubActionId(action);
    for (const def of exitDefinitions(action, isInputType)) {
      if (def.branchId) {
        const branch = ensureDecisionBranches(action).find((item) => item.id === def.branchId);
        const viewNodeId = decisionBranchGraphNodeId(action.id, def.branchId);
        exits.push({
          id: `${viewNodeId}:target`,
          nodeId: action.id,
          viewNodeId,
          label: "Target",
          kind: "branch",
          branchId: def.branchId,
          currentTarget: String(branch?.targetActionId || ""),
          portSide: "right"
        });
      } else if (def.field) {
        exits.push({
          id: `${action.id}:${def.field}`,
          nodeId: action.id,
          viewNodeId: childExitViewNodeId || undefined,
          label: def.label,
          kind: "field",
          field: def.field,
          currentTarget: String(record[def.field] || ""),
          portSide: childExitViewNodeId ? "right" : undefined
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
export function subroutineGraphConnections(
  subroutine: FlowSubroutine | null,
  isInputType: IsInputType = () => false
): FlowGraphConnection[] {
  if (!subroutine) return [];
  const graphNodes = subroutineGraphNodes(subroutine);
  const nodeIds = new Set<string>(["start", "return", ...graphNodes.map((node) => node.id)]);
  const connections: FlowGraphConnection[] = [];

  const entry = String(subroutine.entryTargetActionId || "");
  if (!isNoFlowTarget(entry) && nodeIds.has(entry)) {
    connections.push({ id: `start->${entry}`, from: "start", to: entry, label: "Entry" });
  }

  for (const action of flowSubroutineActions(subroutine)) {
    if (action.type === "decision") {
      const branchAnchorNodeId = decisionBranchTargetAnchorNodeId(graphNodes, action.id);
      ensureDecisionBranches(action).forEach((branch, index) => {
        const branchNodeId = decisionBranchGraphNodeId(action.id, branch.id);
        if (nodeIds.has(branchNodeId)) {
          connections.push({
            id: `${action.id}->${branchNodeId}`,
            from: action.id,
            to: branchNodeId,
            label: decisionBranchName(branch, index)
          });
        }
        const target = String(branch.targetActionId || "");
        if (!isNoFlowTarget(target) && nodeIds.has(target)) {
          connections.push({
            id: `${branchNodeId}->${target}`,
            from: branchNodeId,
            to: target,
            label: decisionBranchWireLabel(branch, index),
            labelKind: decisionBranchConnectionKind(branch as FlowAction),
            fromAnchorNodeId: branchAnchorNodeId
          });
        }
      });
      continue;
    }
    const subActionAnchorNodeId = subActionTargetAnchorNodeId(graphNodes, action.id);
    for (const exit of actionExitTargets(action, isInputType)) {
      if (!nodeIds.has(exit.to)) continue;
      connections.push({
        id: `${action.id}->${exit.to}:${exit.label}`,
        from: action.id,
        to: exit.to,
        label: exit.label,
        labelKind: exit.labelKind,
        visibleWhenSelected: exit.visibleWhenSelected,
        fromAnchorNodeId: subActionAnchorNodeId
      });
    }
  }
  return connections;
}
