import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import type { FlowGraphConnection, FlowGraphNode, FlowNodeExit } from "../flowNodeGraph";

const MINIMAP_W = 300;
const MINIMAP_H = 260;

interface ViewportRect {
  scrollLeft: number;
  scrollTop: number;
  clientW: number;
  clientH: number;
}

function FlowNodeMinimap({
  nodes,
  worldWidth,
  worldHeight,
  zoom,
  viewport,
  stageRef
}: {
  nodes: FlowGraphNode[];
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

  const centerOn = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const worldX = (event.clientX - rect.left) / scale;
    const worldY = (event.clientY - rect.top) / scale;
    const stage = stageRef.current;
    if (!stage) return;
    stage.scrollLeft = Math.max(0, worldX * zoom - stage.clientWidth / 2);
    stage.scrollTop = Math.max(0, worldY * zoom - stage.clientHeight / 2);
  };

  return (
    <div
      className="flow-node-minimap"
      data-node-minimap
      onClick={centerOn}
      style={{
        position: "absolute",
        right: 14,
        top: 14,
        width: mmW,
        height: mmH,
        background: "rgba(250, 247, 236, 0.94)",
        border: "4px solid currentColor",
        borderRadius: 12,
        overflow: "hidden",
        zIndex: 12,
        cursor: "pointer"
      }}
    >
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
            background: node.selected ? "#ffe156" : "rgba(255, 255, 255, 0.6)",
            borderRadius: 1
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
          border: "1px solid #fff",
          background: "rgba(255, 255, 255, 0.14)",
          pointerEvents: "none"
        }}
      />
    </div>
  );
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1;

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export interface FlowNodeCanvasProps {
  nodes: FlowGraphNode[];
  connections?: FlowGraphConnection[];
  exits?: FlowNodeExit[];
  depth: "moments" | "actions";
  stateTitle?: string;
  onSelectNode?: (nodeId: string, additive: boolean) => void;
  onEnterState?: (stateId: string) => void;
  onBackToMoments?: () => void;
  onMoveNode?: (nodeId: string, x: number, y: number) => void;
  onConnect?: (exit: FlowNodeExit, targetNodeId: string) => void;
  onOptimizeLayout?: () => void;
  onSelectNodes?: (nodeIds: string[]) => void;
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
  x: number;
  y: number;
}

interface WirePath {
  id: string;
  d: string;
  labelX: number;
  labelY: number;
  label: string;
  highlighted: boolean;
}

function buildWirePaths(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  selectedIds: Set<string>
): WirePath[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths: WirePath[] = [];
  for (const connection of connections) {
    const from = byId.get(connection.from);
    const to = byId.get(connection.to);
    if (!from || !to) continue;
    // Route bottom-center of the source down into top-center of the target. The control
    // points sit directly below the exit and directly above the entry, so the wire
    // leaves and (especially) enters vertically — a clean straight drop when the nodes
    // are aligned, no sideways S-curves.
    const x1 = from.x + from.width / 2;
    const y1 = from.y + from.height;
    const x2 = to.x + to.width / 2;
    const y2 = to.y;
    const dy = Math.max(40, Math.abs(y2 - y1) / 2);
    paths.push({
      id: connection.id,
      d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
      label: connection.label,
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
  onSelectNode,
  onEnterState,
  onBackToMoments,
  onMoveNode,
  onConnect,
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
    const list = exitsByNode.get(exit.nodeId) || [];
    list.push(exit);
    exitsByNode.set(exit.nodeId, list);
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
      const targetNode = targetEl?.closest("[data-node-id]") as HTMLElement | null;
      const targetId = targetNode?.getAttribute("data-node-id") || "";
      if (targetId && targetId !== connect.exit.nodeId) onConnect(connect.exit, targetId);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  };

  const beginDrag = (node: FlowGraphNode, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !onMoveNode) return;
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
      setLivePosition({ nodeId: drag.nodeId, x: drag.originX + dx, y: drag.originY + dy });
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
    ? nodes.map((node) =>
        node.id === livePosition.nodeId ? { ...node, x: livePosition.x, y: livePosition.y } : node
      )
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
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative"
      }}
    >
      <header className="flow-node-canvas-bar">
        <div className="flow-node-canvas-actions">
          {depth === "actions" ? (
            <button type="button" data-node-back onClick={() => onBackToMoments?.()}>
              ← Moments
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
          {depth === "moments"
            ? "Double-click a moment to edit its actions."
            : `Inside ${stateTitle || "moment"} — click nodes to edit; double-click Start/Return to go back.`}
        </span>
      </header>
      <div className="flow-node-stage-wrap">
        <div
          className="flow-node-stage"
          data-node-stage
          ref={stageRef}
          style={{ height: "min(70vh, 640px)", width: "100%", maxWidth: "100%", overflow: "auto" }}
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
                    {wire.label ? (
                      <text
                        x={wire.labelX}
                        y={wire.labelY}
                        fontSize={11}
                        textAnchor="middle"
                        fill={wire.highlighted ? WIRE_HIGHLIGHT_COLOR : "#cbd5f5"}
                      >
                        {wire.label}
                      </text>
                    ) : null}
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
                      if (node.kind === "state") onEnterState?.(node.id);
                      else if (node.id === "start" || node.id === "return") onBackToMoments?.();
                    }}
                  >
                    <div className="flow-node-main">
                      <strong className="flow-node-title">{node.title}</strong>
                      <span className="flow-node-subtitle">{node.subtitle}</span>
                      {node.timing ? <span className="flow-node-timing">{node.timing}</span> : null}
                    </div>
                    {(exitsByNode.get(node.id) || []).map((exit, exitIndex) => {
                      const portLocalX = Math.max(18, node.width - 22 - exitIndex * 30);
                      const portLocalY = node.height;
                      return (
                        <button
                          type="button"
                          key={exit.id}
                          className={`flow-node-port${exit.currentTarget ? " is-wired" : ""}`}
                          data-port-id={exit.id}
                          data-port-target={exit.currentTarget || ""}
                          aria-label={`${exit.label}${exit.currentTarget ? ` to ${exit.currentTarget}` : ""}`}
                          title={`${exit.label}${exit.currentTarget ? ` → ${exit.currentTarget}` : ""}`}
                          style={{ position: "absolute", right: 16 + exitIndex * 30, bottom: -11 }}
                          onPointerDown={(event) =>
                            beginConnect(exit, node, portLocalX, portLocalY, event)
                          }
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="flow-node-port-label">{exit.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {displayNodes.length ? (
          <FlowNodeMinimap
            nodes={displayNodes}
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
