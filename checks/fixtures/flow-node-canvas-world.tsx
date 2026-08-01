import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FlowNodeCanvas } from "../../client/tools/flow/components/FlowNodeCanvas";
import type {
  FlowGraphConnection,
  FlowGraphNode,
  FlowNodeExit
} from "../../client/tools/flow/flowNodeGraph";

declare global {
  interface Window {
    flowCanvasTest: {
      lastConnect: string | null;
      lastMove: { id: string; x: number; y: number } | null;
      optimizeCount: number;
    };
  }
}

const initialNodes: FlowGraphNode[] = [
  {
    id: "overlap-at-zero",
    kind: "action",
    title: "Overlapping action",
    subtitle: "message",
    timing: "",
    x: 0,
    y: 2400,
    width: 260,
    height: 1000,
    className: "is-standard",
    selected: false
  },
  {
    id: "opening-deal-complete",
    kind: "action",
    title: "Branch on Opening Deal Complete",
    subtitle: "decision",
    timing: "",
    x: 302,
    y: 5428,
    width: 260,
    height: 134,
    className: "is-decision",
    selected: false
  },
  {
    id: "draw-opening-card",
    kind: "action",
    title: "Draw Opening Card",
    subtitle: "drawCard",
    timing: "",
    x: 542,
    y: 1858,
    width: 260,
    height: 134,
    className: "is-standard",
    selected: false
  },
  {
    id: "connect-source",
    kind: "action",
    title: "Connect Source",
    subtitle: "message",
    timing: "",
    x: 180,
    y: 180,
    width: 220,
    height: 120,
    className: "is-standard",
    selected: false
  },
  {
    id: "connect-target",
    kind: "action",
    title: "Connect Target",
    subtitle: "message",
    timing: "",
    x: 560,
    y: 390,
    width: 220,
    height: 120,
    className: "is-standard",
    selected: false
  }
];

const connections: FlowGraphConnection[] = [
  {
    id: "opening-deal-complete->draw-opening-card:no-match",
    from: "opening-deal-complete",
    to: "draw-opening-card",
    label: "No Match",
    labelKind: "branch-no-match"
  },
  {
    id: "connect-source->connect-target",
    from: "connect-source",
    to: "connect-target",
    label: "Next"
  },
  {
    id: "negative-coordinate-safety-net",
    from: "connect-source",
    to: "connect-target",
    fromPoint: { x: -80, y: 320 },
    label: "Explicit negative route"
  }
];

const exits: FlowNodeExit[] = [
  {
    id: "connect-source-next",
    nodeId: "connect-source",
    label: "Next",
    kind: "field",
    field: "targetActionId",
    currentTarget: "",
    portSide: "bottomCenter"
  }
];

window.flowCanvasTest = { lastConnect: null, lastMove: null, optimizeCount: 0 };

function Fixture() {
  const [nodes, setNodes] = useState(initialNodes);
  return (
    <FlowNodeCanvas
      depth="subroutine"
      stateTitle="Round Initialization"
      nodes={nodes}
      connections={connections}
      exits={exits}
      onSelectNode={(id) => {
        setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })));
      }}
      onMoveNode={(id, x, y) => {
        window.flowCanvasTest.lastMove = { id, x, y };
        setNodes((current) => current.map((node) => (node.id === id ? { ...node, x, y } : node)));
      }}
      onConnect={(exit, targetNodeId) => {
        window.flowCanvasTest.lastConnect = `${exit.id}->${targetNodeId}`;
      }}
      onOptimizeLayout={() => {
        window.flowCanvasTest.optimizeCount += 1;
      }}
      onSelectNodes={() => undefined}
    />
  );
}

createRoot(document.querySelector("#root")!).render(<Fixture />);
