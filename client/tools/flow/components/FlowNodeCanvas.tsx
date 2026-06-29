import type { FlowGraphConnection, FlowGraphNode } from "../flowNodeGraph";

export interface FlowNodeCanvasProps {
  nodes: FlowGraphNode[];
  connections?: FlowGraphConnection[];
  depth: "moments" | "actions";
  stateTitle?: string;
  onSelectNode?: (nodeId: string, additive: boolean) => void;
  onEnterState?: (stateId: string) => void;
  onBackToMoments?: () => void;
}

interface WirePath {
  id: string;
  d: string;
  labelX: number;
  labelY: number;
  label: string;
}

function buildWirePaths(nodes: FlowGraphNode[], connections: FlowGraphConnection[]): WirePath[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths: WirePath[] = [];
  for (const connection of connections) {
    const from = byId.get(connection.from);
    const to = byId.get(connection.to);
    if (!from || !to) continue;
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    paths.push({
      id: connection.id,
      d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 6,
      label: connection.label
    });
  }
  return paths;
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
  onSelectNode,
  onEnterState,
  onBackToMoments
}: FlowNodeCanvasProps) {
  const { width, height } = worldSize(nodes);
  const wires = buildWirePaths(nodes, connections);
  return (
    <section className="flow-react-node-canvas" data-flow-react-component="node-canvas" data-node-depth={depth}>
      <header className="flow-node-canvas-bar">
        {depth === "actions" ? (
          <button type="button" data-node-back onClick={() => onBackToMoments?.()}>
            ← Moments
          </button>
        ) : null}
        <span data-node-canvas-help>
          {depth === "moments"
            ? "Double-click a moment to edit its actions."
            : `Inside ${stateTitle || "moment"} — click nodes to edit; double-click Start/Return to go back.`}
        </span>
      </header>
      <div className="flow-node-stage" data-node-stage>
        <div className="flow-node-world" style={{ width, height, position: "relative" }}>
          <svg
            className="flow-node-wires"
            data-node-wires
            width={width}
            height={height}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
          >
            {wires.map((wire) => (
              <g key={wire.id} data-wire-id={wire.id}>
                <path d={wire.d} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.6} />
                {wire.label ? (
                  <text x={wire.labelX} y={wire.labelY} fontSize={11} textAnchor="middle" fill="currentColor">
                    {wire.label}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`flow-node ${node.className}${node.selected ? " is-selected" : ""}`}
              data-node-id={node.id}
              data-node-kind={node.kind}
              aria-current={node.selected ? "true" : undefined}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                width: node.width,
                minHeight: node.height
              }}
              onClick={(event) => onSelectNode?.(node.id, event.metaKey || event.ctrlKey || event.shiftKey)}
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
