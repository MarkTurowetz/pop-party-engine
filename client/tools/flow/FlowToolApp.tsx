import type { GameFlow } from "../../types/game-data";

export interface FlowToolAppProps {
  flow?: GameFlow | null;
  surface?: string;
}

export function FlowToolApp({ flow = null, surface = "flow" }: FlowToolAppProps) {
  const stateCount = flow?.states?.length || 0;
  const routeNodeCount = flow?.routeNodes?.length || 0;

  return (
    <section
      aria-hidden="true"
      data-flow-react-shell="legacy-bridge"
      data-route-node-count={routeNodeCount}
      data-state-count={stateCount}
      data-surface={surface}
      hidden
    />
  );
}
