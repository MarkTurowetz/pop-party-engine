import type { FlowNodeDepth } from "./flowNodeGraph";

export interface ParentFlowNodeLocation {
  depth: FlowNodeDepth;
  subroutinePath: string[];
}

export function parentFlowNodeLocation(
  subroutinePath: Iterable<string>
): ParentFlowNodeLocation {
  const path = [...subroutinePath].filter(Boolean);
  if (path.length) {
    return {
      depth: "subroutine",
      subroutinePath: path.slice(0, -1)
    };
  }
  return {
    depth: "subroutines",
    subroutinePath: []
  };
}

export function shouldNavigateUpFromCanvasDoubleClick(
  depth: FlowNodeDepth,
  targetInsideNode: boolean
): boolean {
  return depth === "subroutine" && !targetInsideNode;
}
