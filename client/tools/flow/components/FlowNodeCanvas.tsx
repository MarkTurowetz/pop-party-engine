import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import type { FlowGraphConnection, FlowGraphNode, FlowNodeExit } from "../flowNodeGraph";
import { shouldNavigateUpFromCanvasDoubleClick } from "../flowNodeNavigation";

const MINIMAP_W = 300;
const MINIMAP_H = 260;
const NEW_CONNECTED_ACTION_WIDTH = 260;
const NEW_CONNECTED_ACTION_HEIGHT = 134;
const NEW_CONNECTED_ACTION_SIDE_GAP = 70;
const MINIMAP_BACKGROUND =
  "linear-gradient(135deg, rgba(34, 211, 238, 0.24), rgba(255, 79, 163, 0.22)), #160b35";

interface ViewportRect {
  scrollLeft: number;
  scrollTop: number;
  clientW: number;
  clientH: number;
}

function FlowNodeMinimap({
  nodes,
  connections,
  worldWidth,
  worldHeight,
  zoom,
  viewport,
  stageRef
}: {
  nodes: FlowGraphNode[];
  connections: FlowGraphConnection[];
  worldWidth: number;
  worldHeight: number;
  zoom: number;
  viewport: ViewportRect;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const scale = Math.min(MINIMAP_W / worldWidth, MINIMAP_H / worldHeight);
  const mmW = worldWidth * scale;
  const mmH = worldHeight * scale;
  const viewX = (viewport.scrollLeft / zoom) * scale;
  const viewY = (viewport.scrollTop / zoom) * scale;
  const viewW = (viewport.clientW / zoom) * scale;
  const viewH = (viewport.clientH / zoom) * scale;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  const visibleConnections = connections.filter((connection) =>
    connectionIsVisible(connection, selectedIds)
  );

  const centerStageOn = (clientX: number, clientY: number, rect: DOMRect) => {
    const stage = stageRef.current;
    if (!stage) return;
    const worldX = clampNumber((clientX - rect.left) / scale, 0, worldWidth);
    const worldY = clampNumber((clientY - rect.top) / scale, 0, worldHeight);
    stage.scrollLeft = clampNumber(
      worldX * zoom - stage.clientWidth / 2,
      0,
      stage.scrollWidth - stage.clientWidth
    );
    stage.scrollTop = clampNumber(
      worldY * zoom - stage.clientHeight / 2,
      0,
      stage.scrollHeight - stage.clientHeight
    );
  };

  const beginMinimapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    centerStageOn(event.clientX, event.clientY, rect);

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      centerStageOn(moveEvent.clientX, moveEvent.clientY, rect);
    };
    const stop = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
    };
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
  };

  return (
    <div
      className="flow-node-minimap"
      data-node-minimap
      onPointerDown={beginMinimapDrag}
      style={{
        position: "absolute",
        right: 14,
        top: 14,
        width: mmW,
        height: mmH,
        background: MINIMAP_BACKGROUND,
        border: "4px solid #f8fafc",
        borderRadius: 12,
        overflow: "hidden",
        zIndex: 12,
        cursor: "grab",
        boxShadow: "0 0 0 3px rgba(34, 211, 238, 0.45), 7px 7px 0 rgba(23, 19, 31, 0.55)"
      }}
    >
      <svg
        data-minimap-wires
        width={mmW}
        height={mmH}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {visibleConnections.map((connection) => {
          const from = byId.get(connection.from);
          const to = byId.get(connection.to);
          if (!from || !to) return null;
          const route = buildConnectionRoute(connection, from, to, nodes, scale);
          const highlighted = selectedIds.has(connection.from);
          return (
            <path
              key={connection.id}
              d={route.d}
              fill="none"
              stroke={highlighted ? "#ff4fa3" : "#38bdf8"}
              strokeLinecap="round"
              strokeWidth={highlighted ? 3 : 2}
              opacity={highlighted ? 0.95 : 0.72}
            />
          );
        })}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          data-minimap-node={node.id}
          style={{
            position: "absolute",
            left: node.x * scale,
            top: node.y * scale,
            width: Math.max(2, node.width * scale),
            height: Math.max(2, node.height * scale),
            background: minimapNodeFill(node),
            border: "1px solid rgba(23, 19, 31, 0.85)",
            borderRadius: node.kind === "system" ? 3 : 2,
            boxShadow: node.selected
              ? "0 0 0 2px #fff, 0 0 10px #ff4fa3"
              : "0 0 0 1px rgba(255,255,255,0.18)",
            opacity: 0.98
          }}
        />
      ))}
      <div
        data-minimap-viewport
        style={{
          position: "absolute",
          left: viewX,
          top: viewY,
          width: viewW,
          height: viewH,
          border: "3px solid #fff",
          background: "rgba(34, 211, 238, 0.18)",
          boxShadow: "0 0 0 2px #ff4fa3, inset 0 0 0 1px rgba(23, 19, 31, 0.65)",
          pointerEvents: "none"
        }}
      />
    </div>
  );
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampZoom(value: number): number {
  return clampNumber(value, MIN_ZOOM, MAX_ZOOM);
}

function minimapNodeFill(node: FlowGraphNode): string {
  if (node.selected) return "#ff4fa3";
  if (node.kind === "system") return "#f8fafc";
  if (node.kind === "gameState") return "#22d3ee";
  if (node.kind === "subroutine") return "#22d3ee";
  if (node.kind === "branch") return node.className.includes("is-no-match") ? "#fff7d6" : "#fef3c7";
  if (node.kind === "subAction") return "#fff7d6";
  if (node.className.includes("is-decision")) return "#a3e635";
  if (node.className.includes("is-transition")) return "#fb923c";
  if (node.className.includes("is-code")) return "#bae6fd";
  return "#ffe156";
}

export interface FlowNodeCanvasProps {
  nodes: FlowGraphNode[];
  connections?: FlowGraphConnection[];
  exits?: FlowNodeExit[];
  depth: "subroutines" | "subroutine";
  stateTitle?: string;
  backLabel?: string;
  onSelectNode?: (nodeId: string, additive: boolean) => void;
  onEnterSubroutine?: (nodeId: string) => void;
  onBackToSubroutines?: () => void;
  onMoveNode?: (nodeId: string, x: number, y: number) => void;
  onConnect?: (exit: FlowNodeExit, targetNodeId: string) => void;
  onCreateConnectedAction?: (
    exit: FlowNodeExit,
    x: number,
    y: number,
    continuationTargetId?: string
  ) => void;
  onOptimizeLayout?: () => void;
  onSelectNodes?: (nodeIds: string[]) => void;
}

export function newConnectedActionPosition(
  pointer: { x: number; y: number },
  sourceNode?: FlowGraphNode,
  targetNode?: FlowGraphNode
): { x: number; y: number } {
  if (!targetNode) {
    return {
      x: Math.max(0, pointer.x - NEW_CONNECTED_ACTION_WIDTH / 2),
      y: Math.max(0, pointer.y - NEW_CONNECTED_ACTION_HEIGHT / 2)
    };
  }

  const sourceCenterX = sourceNode
    ? sourceNode.x + sourceNode.width / 2
    : targetNode.x + targetNode.width / 2;
  const targetCenterX = targetNode.x + targetNode.width / 2;
  const placeOnLeft = sourceCenterX < targetCenterX;
  return {
    x: Math.max(
      0,
      placeOnLeft
        ? targetNode.x - NEW_CONNECTED_ACTION_WIDTH - NEW_CONNECTED_ACTION_SIDE_GAP
        : targetNode.x + targetNode.width + NEW_CONNECTED_ACTION_SIDE_GAP
    ),
    y: Math.max(0, targetNode.y)
  };
}

interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rectsOverlap(node: FlowGraphNode, marquee: MarqueeRect): boolean {
  const left = Math.min(marquee.x1, marquee.x2);
  const right = Math.max(marquee.x1, marquee.x2);
  const top = Math.min(marquee.y1, marquee.y2);
  const bottom = Math.max(marquee.y1, marquee.y2);
  return (
    left < node.x + node.width && right > node.x && top < node.y + node.height && bottom > node.y
  );
}

interface ConnectState {
  exit: FlowNodeExit;
  startX: number;
  startY: number;
}

const DRAG_THRESHOLD = 3;

interface DragState {
  nodeId: string;
  originX: number;
  originY: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

interface LivePosition {
  nodeId: string;
  movingNodeIds: string[];
  dx: number;
  dy: number;
  x: number;
  y: number;
}

interface WirePath {
  id: string;
  d: string;
  labelX: number;
  labelY: number;
  label: string;
  labelKind: FlowGraphConnection["labelKind"];
  highlighted: boolean;
}

interface ConnectionRoute {
  d: string;
  labelX: number;
  labelY: number;
}

function connectionSourcePoint(
  connection: FlowGraphConnection,
  from: FlowGraphNode,
  byId: Map<string, FlowGraphNode>
): { x: number; y: number } {
  if (connection.fromPoint) return connection.fromPoint;
  const anchorNode = connection.fromAnchorNodeId ? byId.get(connection.fromAnchorNodeId) : null;
  if (anchorNode) {
    return {
      x: anchorNode.x + anchorNode.width / 2,
      y: anchorNode.y + anchorNode.height
    };
  }
  return {
    x: from.x + from.width / 2,
    y: from.y + from.height
  };
}

function connectionTargetPoint(
  connection: FlowGraphConnection,
  to: FlowGraphNode
): { x: number; y: number } {
  return connection.toPoint || { x: to.x + to.width / 2, y: to.y };
}

function routeCurve(
  sourcePoint: { x: number; y: number },
  targetPoint: { x: number; y: number },
  scale = 1
): ConnectionRoute {
  const x1 = sourcePoint.x * scale;
  const y1 = sourcePoint.y * scale;
  const x2 = targetPoint.x * scale;
  const y2 = targetPoint.y * scale;
  const dy = Math.max(40 * scale, Math.abs(y2 - y1) / 2);
  return {
    d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2
  };
}

function verticalRangesOverlap(
  aTop: number,
  aBottom: number,
  bTop: number,
  bBottom: number
): boolean {
  return aTop < bBottom && aBottom > bTop;
}

function routeUpwardOrthogonal(
  sourcePoint: { x: number; y: number },
  from: FlowGraphNode,
  to: FlowGraphNode,
  nodes: FlowGraphNode[],
  scale = 1
): ConnectionRoute {
  const targetCenterX = to.x + to.width / 2;
  const useLeftSide = sourcePoint.x < targetCenterX;
  const targetX = useLeftSide ? to.x : to.x + to.width;
  const targetY = to.y + to.height / 2;
  const dropY = sourcePoint.y + 52;
  const routeTop = Math.min(targetY, dropY);
  const routeBottom = Math.max(targetY, dropY);
  const overlappingNodes = nodes.filter((node) => {
    if (node.id === from.id || node.id === to.id) return false;
    return verticalRangesOverlap(node.y, node.y + node.height, routeTop, routeBottom);
  });
  const leftBound = Math.min(from.x, to.x, ...overlappingNodes.map((node) => node.x)) - 100;
  const rightBound =
    Math.max(
      from.x + from.width,
      to.x + to.width,
      ...overlappingNodes.map((node) => node.x + node.width)
    ) + 100;
  const corridorX = useLeftSide ? leftBound : rightBound;
  const points = [
    sourcePoint,
    { x: sourcePoint.x, y: dropY },
    { x: corridorX, y: dropY },
    { x: corridorX, y: targetY },
    { x: targetX, y: targetY }
  ];
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * scale} ${point.y * scale}`)
    .join(" ");
  return {
    d,
    labelX: corridorX * scale,
    labelY: ((dropY + targetY) / 2) * scale
  };
}

function buildConnectionRoute(
  connection: FlowGraphConnection,
  from: FlowGraphNode,
  to: FlowGraphNode,
  nodes: FlowGraphNode[],
  scale = 1
): ConnectionRoute {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sourcePoint = connectionSourcePoint(connection, from, byId);
  const targetPoint = connectionTargetPoint(connection, to);
  if (targetPoint.y < sourcePoint.y) {
    return routeUpwardOrthogonal(sourcePoint, from, to, nodes, scale);
  }
  return routeCurve(sourcePoint, targetPoint, scale);
}

function connectionIsVisible(connection: FlowGraphConnection, selectedIds: Set<string>): boolean {
  return !connection.visibleWhenSelected || selectedIds.has(connection.from);
}

function buildWirePaths(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  selectedIds: Set<string>
): WirePath[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths: WirePath[] = [];
  for (const connection of connections) {
    if (!connectionIsVisible(connection, selectedIds)) continue;
    const from = byId.get(connection.from);
    const to = byId.get(connection.to);
    if (!from || !to) continue;
    const route = buildConnectionRoute(connection, from, to, nodes);
    paths.push({
      id: connection.id,
      d: route.d,
      labelX: route.labelX,
      labelY: route.labelY,
      label: connection.label,
      labelKind: connection.labelKind || "default",
      // Only the OUTGOING wire highlights — selecting a node shows where it goes next,
      // not what points into it.
      highlighted: selectedIds.has(connection.from)
    });
  }
  return paths;
}

// Wire colors chosen to read against the dark node canvas: bright cyan by default,
// hot pink for connections touching the selected node.
const WIRE_COLOR = "#38bdf8";
const WIRE_HIGHLIGHT_COLOR = "#ff4fa3";

function wireLabelIcon(kind: FlowGraphConnection["labelKind"]): string {
  if (kind === "branch-code") return "C";
  if (kind === "branch-no-match") return "N";
  if (kind === "branch-hit") return "H";
  if (kind === "jump-preview") return "J";
  return "";
}

function wireLabelFill(kind: FlowGraphConnection["labelKind"], highlighted: boolean): string {
  if (kind === "branch-code") return "#bae6fd";
  if (kind === "branch-no-match") return "#fff7d6";
  if (kind === "branch-hit") return "#fef3c7";
  if (kind === "jump-preview") return "#ffe4f1";
  return highlighted ? WIRE_HIGHLIGHT_COLOR : "#cbd5f5";
}

function wireLabelStroke(kind: FlowGraphConnection["labelKind"], highlighted: boolean): string {
  if (kind === "branch-code") return "#38bdf8";
  if (kind === "branch-no-match") return "#a16207";
  if (kind === "branch-hit") return "#ff4fa3";
  if (kind === "jump-preview") return WIRE_HIGHLIGHT_COLOR;
  return highlighted ? WIRE_HIGHLIGHT_COLOR : "#cbd5f5";
}

function truncateWireLabel(label: string): string {
  return label.length > 26 ? `${label.slice(0, 23)}...` : label;
}

function WireLabel({ wire }: { wire: WirePath }) {
  if (!wire.label) return null;
  const kind = wire.labelKind || "default";
  const isCapsule = kind !== "default";
  if (!isCapsule) {
    return (
      <text
        x={wire.labelX}
        y={wire.labelY}
        fontSize={11}
        textAnchor="middle"
        fill={wire.highlighted ? WIRE_HIGHLIGHT_COLOR : "#cbd5f5"}
      >
        {wire.label}
      </text>
    );
  }

  const icon = wireLabelIcon(kind);
  const label = truncateWireLabel(wire.label);
  const width = Math.max(54, Math.min(220, label.length * 7.5 + (icon ? 34 : 18)));
  const height = 24;
  const x = wire.labelX - width / 2;
  const y = wire.labelY - height / 2;
  const stroke = wireLabelStroke(kind, wire.highlighted);
  const fill = wireLabelFill(kind, wire.highlighted);
  return (
    <g data-wire-label-kind={kind} transform={`translate(${x} ${y})`} aria-label={wire.label}>
      <title>{wire.label}</title>
      <rect
        width={width}
        height={height}
        rx={12}
        ry={12}
        fill={fill}
        stroke={stroke}
        strokeWidth={2.5}
      />
      {icon ? (
        <>
          <circle cx={13} cy={12} r={8} fill={stroke} />
          <text x={13} y={15.5} fontSize={10} fontWeight={900} textAnchor="middle" fill="#fff">
            {icon}
          </text>
        </>
      ) : null}
      <text
        x={icon ? 28 : width / 2}
        y={15.5}
        fontSize={11}
        fontWeight={900}
        textAnchor={icon ? "start" : "middle"}
        fill="#17131f"
      >
        {label}
      </text>
    </g>
  );
}

const WORLD_MIN_WIDTH = 1600;
const WORLD_MIN_HEIGHT = 920;

function worldSize(nodes: FlowGraphNode[]): { width: number; height: number } {
  let width = WORLD_MIN_WIDTH;
  let height = WORLD_MIN_HEIGHT;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width + 160);
    height = Math.max(height, node.y + node.height + 160);
  }
  return { width, height };
}

/**
 * Static node-graph canvas (slice 1). Renders the typed {@link FlowGraphNode} list
 * at absolute positions; selection + depth navigation route back to the controller.
 * Wires, drag, ports, marquee, minimap, and zoom land in later slices.
 */
export function FlowNodeCanvas({
  nodes,
  connections = [],
  depth,
  stateTitle,
  backLabel = "Game States",
  onSelectNode,
  onEnterSubroutine,
  onBackToSubroutines,
  onMoveNode,
  onConnect,
  onCreateConnectedAction,
  onOptimizeLayout,
  onSelectNodes,
  exits = []
}: FlowNodeCanvasProps) {
  const dragRef = useRef<DragState | null>(null);
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const connectRef = useRef<ConnectState | null>(null);
  const [connectPreview, setConnectPreview] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Track the stage viewport (scroll + client size) so the minimap can draw the
  // visible-region indicator. Scroll doesn't re-render React, so we listen for it.
  const [viewport, setViewport] = useState({ scrollLeft: 0, scrollTop: 0, clientW: 0, clientH: 0 });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () =>
      setViewport({
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
        clientW: stage.clientWidth,
        clientH: stage.clientHeight
      });
    update();
    stage.addEventListener("scroll", update, { passive: true });
    return () => stage.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    const stage = stageRef.current;
    if (stage) {
      setViewport({
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
        clientW: stage.clientWidth,
        clientH: stage.clientHeight
      });
    }
  }, [zoom]);

  // Non-passive wheel listener so we can preventDefault and zoom anchored at the cursor.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const previous = zoomRef.current;
      const next = clampZoom(previous * (event.deltaY < 0 ? 1.1 : 0.9));
      if (next === previous) return;
      const rect = stage.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;
      const worldX = (stage.scrollLeft + anchorX) / previous;
      const worldY = (stage.scrollTop + anchorY) / previous;
      // Update the ref synchronously so rapid wheel events compound off the latest zoom.
      zoomRef.current = next;
      setZoom(next);
      requestAnimationFrame(() => {
        stage.scrollLeft = worldX * next - anchorX;
        stage.scrollTop = worldY * next - anchorY;
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const exitsByNode = new Map<string, FlowNodeExit[]>();
  for (const exit of exits) {
    const viewNodeId = exit.viewNodeId || exit.nodeId;
    const list = exitsByNode.get(viewNodeId) || [];
    list.push(exit);
    exitsByNode.set(viewNodeId, list);
  }

  const toWorldPoint = (clientX: number, clientY: number) => {
    const rect = worldRef.current?.getBoundingClientRect();
    const z = zoomRef.current || 1;
    return { x: (clientX - (rect?.left ?? 0)) / z, y: (clientY - (rect?.top ?? 0)) / z };
  };

  const beginConnect = (
    exit: FlowNodeExit,
    node: FlowGraphNode,
    localX: number,
    localY: number,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.button !== 0 || !onConnect) return;
    event.stopPropagation();
    const startX = node.x + localX;
    const startY = node.y + localY;
    connectRef.current = { exit, startX, startY };
    setConnectPreview({ x1: startX, y1: startY, x2: startX, y2: startY });

    const handleMove = (moveEvent: PointerEvent) => {
      if (!connectRef.current) return;
      const point = toWorldPoint(moveEvent.clientX, moveEvent.clientY);
      setConnectPreview({ x1: startX, y1: startY, x2: point.x, y2: point.y });
    };

    const handleUp = (upEvent: PointerEvent) => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      const connect = connectRef.current;
      connectRef.current = null;
      setConnectPreview(null);
      if (!connect) return;
      const targetEl = document.elementFromPoint(
        upEvent.clientX,
        upEvent.clientY
      ) as HTMLElement | null;
      const targetNodeElement = targetEl?.closest("[data-node-id]") as HTMLElement | null;
      const targetId = targetNodeElement?.getAttribute("data-node-id") || "";
      const targetKind = targetNodeElement?.getAttribute("data-node-kind");
      const validTargetId =
        targetKind !== "branch" &&
        targetKind !== "subAction" &&
        targetId !== connect.exit.nodeId
          ? targetId
          : "";
      if ((upEvent.metaKey || upEvent.ctrlKey) && onCreateConnectedAction) {
        const point = toWorldPoint(upEvent.clientX, upEvent.clientY);
        const position = newConnectedActionPosition(
          point,
          nodes.find((candidate) => candidate.id === connect.exit.nodeId),
          nodes.find((candidate) => candidate.id === validTargetId)
        );
        onCreateConnectedAction(
          connect.exit,
          position.x,
          position.y,
          validTargetId || undefined
        );
        return;
      }
      if (validTargetId) onConnect(connect.exit, validTargetId);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  };

  const beginDrag = (node: FlowGraphNode, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !onMoveNode) return;
    if (node.draggable === false) return;
    const movingNodeIds = node.selected
      ? nodes
          .filter((candidate) =>
            candidate.selected &&
            candidate.draggable !== false &&
            candidate.kind !== "branch" &&
            candidate.kind !== "subAction"
          )
          .map((candidate) => candidate.id)
      : [node.id];
    dragRef.current = {
      nodeId: node.id,
      originX: node.x,
      originY: node.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const z = zoomRef.current || 1;
      const dx = (moveEvent.clientX - drag.startClientX) / z;
      const dy = (moveEvent.clientY - drag.startClientY) / z;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true;
      setLivePosition({
        nodeId: drag.nodeId,
        movingNodeIds,
        dx,
        dy,
        x: drag.originX + dx,
        y: drag.originY + dy
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      const drag = dragRef.current;
      dragRef.current = null;
      setLivePosition(null);
      if (drag && drag.moved) {
        const z = zoomRef.current || 1;
        const dx = (upEvent.clientX - drag.startClientX) / z;
        const dy = (upEvent.clientY - drag.startClientY) / z;
        onMoveNode(drag.nodeId, Math.max(0, drag.originX + dx), Math.max(0, drag.originY + dy));
      }
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  };

  const beginViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startScrollLeft = stage.scrollLeft;
    const startScrollTop = stage.scrollTop;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      stage.scrollLeft = startScrollLeft - (moveEvent.clientX - startClientX);
      stage.scrollTop = startScrollTop - (moveEvent.clientY - startClientY);
    };
    const stop = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      document.body.style.cursor = previousCursor;
    };
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
  };

  const marqueeRef = useRef<{ startX: number; startY: number } | null>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const beginMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !onSelectNodes) return;
    if ((event.target as HTMLElement).closest("[data-node-id]")) return; // background only
    const start = toWorldPoint(event.clientX, event.clientY);
    marqueeRef.current = { startX: start.x, startY: start.y };
    setMarquee({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });

    const handleMove = (moveEvent: PointerEvent) => {
      if (!marqueeRef.current) return;
      const point = toWorldPoint(moveEvent.clientX, moveEvent.clientY);
      setMarquee({
        x1: marqueeRef.current.startX,
        y1: marqueeRef.current.startY,
        x2: point.x,
        y2: point.y
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      const start2 = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      if (!start2) return;
      const end = toWorldPoint(upEvent.clientX, upEvent.clientY);
      const rect = { x1: start2.startX, y1: start2.startY, x2: end.x, y2: end.y };
      if (Math.abs(rect.x2 - rect.x1) < 5 && Math.abs(rect.y2 - rect.y1) < 5) return;
      onSelectNodes(nodes.filter((node) => rectsOverlap(node, rect)).map((node) => node.id));
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  };

  const displayNodes = livePosition
    ? (() => {
        const movingNodeIds = new Set(livePosition.movingNodeIds);
        return nodes.map((node) =>
          movingNodeIds.has(node.id)
            ? { ...node, x: node.x + livePosition.dx, y: node.y + livePosition.dy }
            : node.parentNodeId && movingNodeIds.has(node.parentNodeId)
              ? { ...node, x: node.x + livePosition.dx, y: node.y + livePosition.dy }
              : node
        );
      })()
    : nodes;
  const { width, height } = worldSize(displayNodes);
  // Selecting a node highlights the nodes it points TO (its next steps) in pink, so you
  // can follow where the flow goes — not what points back into it.
  const selectedIds = new Set(displayNodes.filter((node) => node.selected).map((node) => node.id));
  const connectedIds = new Set<string>();
  for (const connection of connections) {
    if (selectedIds.has(connection.from)) connectedIds.add(connection.to);
  }
  const wires = buildWirePaths(displayNodes, connections, selectedIds);
  return (
    <section
      className="flow-react-node-canvas"
      data-flow-react-component="node-canvas"
      data-node-depth={depth}
      style={{
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative"
      }}
    >
      <header className="flow-node-canvas-bar">
        <div className="flow-node-canvas-actions">
          {depth === "subroutine" ? (
            <button type="button" data-node-back onClick={() => onBackToSubroutines?.()}>
              ← {backLabel}
            </button>
          ) : null}
          <button
            type="button"
            data-node-optimize
            onClick={() => onOptimizeLayout?.()}
            disabled={!onOptimizeLayout || !nodes.length}
          >
            Optimize
          </button>
        </div>
        <span data-node-canvas-help>
          {depth === "subroutines"
            ? "Double-click a game state to edit its actions."
            : `Inside ${stateTitle || "subroutine"} — double-click nested subroutines to drill in or the background to go up one level.`}
        </span>
      </header>
      <div className="flow-node-stage-wrap">
        <div
          className="flow-node-stage"
          data-node-stage
          ref={stageRef}
          style={{ flex: 1, height: "100%", width: "100%", maxWidth: "100%", overflow: "auto" }}
          onPointerDown={beginViewportPan}
          onAuxClick={(event) => {
            if (event.button === 1) event.preventDefault();
          }}
          onDoubleClick={(event) => {
            const target = event.target as HTMLElement;
            const targetInsideNode = Boolean(target.closest?.("[data-node-id]"));
            if (!shouldNavigateUpFromCanvasDoubleClick(depth, targetInsideNode)) return;
            event.preventDefault();
            onBackToSubroutines?.();
          }}
        >
          <div
            className="flow-node-graph"
            data-node-zoom={zoom}
            style={{ width: width * zoom, height: height * zoom, position: "relative" }}
          >
            <div
              className="flow-node-world"
              ref={worldRef}
              style={{
                width,
                height,
                position: "absolute",
                left: 0,
                top: 0,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0"
              }}
              onPointerDown={beginMarquee}
            >
              {marquee ? (
                <div
                  className="flow-node-marquee"
                  data-node-marquee
                  style={{
                    position: "absolute",
                    left: Math.min(marquee.x1, marquee.x2),
                    top: Math.min(marquee.y1, marquee.y2),
                    width: Math.abs(marquee.x2 - marquee.x1),
                    height: Math.abs(marquee.y2 - marquee.y1),
                    border: "2px dashed currentColor",
                    background: "rgba(255,255,255,0.08)",
                    pointerEvents: "none",
                    zIndex: 2
                  }}
                />
              ) : null}
              <svg
                className="flow-node-wires"
                data-node-wires
                width={width}
                height={height}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  pointerEvents: "none",
                  overflow: "visible"
                }}
              >
                {wires.map((wire) => (
                  <g
                    key={wire.id}
                    data-wire-id={wire.id}
                    data-wire-highlighted={wire.highlighted ? "true" : undefined}
                  >
                    <path
                      d={wire.d}
                      fill="none"
                      stroke={wire.highlighted ? WIRE_HIGHLIGHT_COLOR : WIRE_COLOR}
                      strokeWidth={wire.highlighted ? 5 : 3.5}
                      strokeLinecap="round"
                      opacity={wire.highlighted ? 1 : 0.9}
                    />
                    <WireLabel wire={wire} />
                  </g>
                ))}
                {connectPreview ? (
                  <path
                    data-connect-preview
                    d={`M ${connectPreview.x1} ${connectPreview.y1} L ${connectPreview.x2} ${connectPreview.y2}`}
                    fill="none"
                    stroke={WIRE_HIGHLIGHT_COLOR}
                    strokeWidth={3.5}
                    strokeDasharray="6 4"
                    opacity={0.95}
                  />
                ) : null}
              </svg>
              {displayNodes.map((node) => {
                const isDragging = livePosition?.nodeId === node.id;
                const isConnected = connectedIds.has(node.id) && !node.selected;
                return (
                  <div
                    key={node.id}
                    className={`flow-node ${node.className}${node.selected ? " is-selected" : ""}${isConnected ? " is-connected" : ""}${isDragging ? " is-dragging" : ""}`}
                    data-node-id={node.id}
                    data-node-kind={node.kind}
                    data-node-connected={isConnected ? "true" : undefined}
                    aria-current={node.selected ? "true" : undefined}
                    style={{
                      position: "absolute",
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      minHeight: node.height,
                      touchAction: "none",
                      // Pink ring + glow on nodes wired to the selected node, so connections
                      // are easy to follow at a glance.
                      ...(isConnected
                        ? {
                            boxShadow: `0 0 0 3px ${WIRE_HIGHLIGHT_COLOR}, 0 0 14px rgba(255, 79, 163, 0.65)`
                          }
                        : {})
                    }}
                    onPointerDown={(event) => beginDrag(node, event)}
                    onClick={(event) =>
                      onSelectNode?.(node.id, event.metaKey || event.ctrlKey || event.shiftKey)
                    }
                    onDoubleClick={() => {
                      if (node.kind === "gameState" || node.kind === "subroutine") {
                        onEnterSubroutine?.(node.id);
                      }
                      else if (node.id === "start" || node.id === "return") onBackToSubroutines?.();
                    }}
                  >
                    <div className="flow-node-main">
                      <strong className="flow-node-title">{node.title}</strong>
                      {node.subtitle ? (
                        <span className="flow-node-subtitle">{node.subtitle}</span>
                      ) : null}
                      {node.timing || node.valueBadge ? (
                        <span className="flow-node-meta-row">
                          {node.timing ? (
                            <span className="flow-node-timing">{node.timing}</span>
                          ) : null}
                          {node.valueBadge ? (
                            <span className={`flow-node-value-badge ${node.valueBadge.className}`}>
                              {node.valueBadge.text}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    {(() => {
                      const nodeExits = exitsByNode.get(node.id) || [];
                      return nodeExits.map((exit, exitIndex) => {
                        const portSide = exit.portSide || "bottom";
                        const sameSideExits = nodeExits.filter(
                          (candidate) => (candidate.portSide || "bottom") === portSide
                        );
                        const sameSideIndex = nodeExits
                          .slice(0, exitIndex)
                          .filter(
                            (candidate) => (candidate.portSide || "bottom") === portSide
                          ).length;
                        const isRightPort = portSide === "right";
                        const isBottomCenterPort = portSide === "bottomCenter";
                        const rightPortSpacing = 28;
                        const bottomCenterSpacing = 30;
                        const rightPortY =
                          node.height / 2 -
                          ((sameSideExits.length - 1) * rightPortSpacing) / 2 +
                          sameSideIndex * rightPortSpacing;
                        const bottomCenterX =
                          node.width / 2 -
                          ((sameSideExits.length - 1) * bottomCenterSpacing) / 2 +
                          sameSideIndex * bottomCenterSpacing;
                        const portLocalX = isRightPort
                          ? node.width
                          : isBottomCenterPort
                            ? bottomCenterX
                            : Math.max(18, node.width - 22 - sameSideIndex * 30);
                        const portLocalY = isRightPort ? rightPortY : node.height;
                        const portStyle = isRightPort
                          ? {
                              position: "absolute" as const,
                              right: -12,
                              top: rightPortY - 12
                            }
                          : isBottomCenterPort
                            ? {
                                position: "absolute" as const,
                                left: bottomCenterX - 12,
                                bottom: -11
                              }
                            : {
                                position: "absolute" as const,
                                right: 16 + sameSideIndex * 30,
                                bottom: -11
                              };
                        return (
                          <button
                            type="button"
                            key={exit.id}
                            className={`flow-node-port${exit.currentTarget ? " is-wired" : ""}`}
                            data-port-id={exit.id}
                            data-port-side={portSide}
                            data-port-target={exit.currentTarget || ""}
                            aria-label={`${exit.label}${exit.currentTarget ? ` to ${exit.currentTarget}` : ""}`}
                            title={`${exit.label}${exit.currentTarget ? ` → ${exit.currentTarget}` : ""}`}
                            style={portStyle}
                            onPointerDown={(event) =>
                              beginConnect(exit, node, portLocalX, portLocalY, event)
                            }
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="flow-node-port-label">{exit.label}</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {displayNodes.length ? (
          <FlowNodeMinimap
            nodes={displayNodes}
            connections={connections}
            worldWidth={width}
            worldHeight={height}
            zoom={zoom}
            viewport={viewport}
            stageRef={stageRef}
          />
        ) : null}
      </div>
    </section>
  );
}
