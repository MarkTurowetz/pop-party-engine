import { createRoot, type Root } from "react-dom/client";
import type { GameFlow } from "../../types/game-data";
import { FlowToolApp } from "./FlowToolApp";

export interface FlowToolReactShell {
  root: Root;
  update: (flow?: GameFlow | null, selection?: FlowToolReactShellSelection) => void;
  unmount: () => void;
}

export interface FlowToolReactShellSelection {
  selectedActionId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
}

export interface MountFlowToolAppOptions {
  createRoot?: (container: Element) => Pick<Root, "render" | "unmount">;
  document?: Document;
  flow?: GameFlow | null;
  surface?: string;
}

declare global {
  interface Window {
    PartyGameFlowReactShell?: FlowToolReactShell;
  }
}

export function mountFlowToolApp(options: MountFlowToolAppOptions = {}): FlowToolReactShell | null {
  const targetDocument = options.document || document;
  const host = targetDocument.createElement("div");
  host.id = "flowReactShell";
  host.hidden = true;
  targetDocument.body.appendChild(host);
  const root = (options.createRoot || createRoot)(host);
  const surface = options.surface || "flow";
  const update = (flow: GameFlow | null = null, selection: FlowToolReactShellSelection = {}) => {
    root.render(
      <FlowToolApp
        flow={flow}
        selectedActionId={selection.selectedActionId || ""}
        selectedRouteNodeId={selection.selectedRouteNodeId || ""}
        selectedStateId={selection.selectedStateId || ""}
        surface={surface}
      />
    );
  };
  const shell = {
    root: root as Root,
    update,
    unmount: () => {
      root.unmount();
      host.remove();
    }
  };
  update(options.flow || null);
  if (targetDocument.defaultView) targetDocument.defaultView.PartyGameFlowReactShell = shell;
  return shell;
}
