import type { FlowGraphNode } from "../flowNodeGraph";

export interface FlowNodeCanvasProps {
  nodes: FlowGraphNode[];
  depth: "moments" | "actions";
  stateTitle?: string;
  onSelectNode?: (nodeId: string, additive: boolean) => void;
  onEnterState?: (stateId: string) => void;
  onBackToMoments?: () => void;
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
  depth,
  stateTitle,
  onSelectNode,
  onEnterState,
  onBackToMoments
}: FlowNodeCanvasProps) {
  const { width, height } = worldSize(nodes);
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
