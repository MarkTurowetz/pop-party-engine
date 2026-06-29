import { createRoot, type Root } from "react-dom/client";
import type { GameFlow } from "../../types/game-data";
import type { FlowActionTypeMeta } from "./flowSelectors";
import { FlowToolApp } from "./FlowToolApp";

export interface FlowToolReactShell {
  root: Root;
  setHandlers: (handlers: FlowToolReactShellHandlers) => void;
  update: (flow?: GameFlow | null, selection?: FlowToolReactShellSelection) => void;
  unmount: () => void;
}

export interface FlowToolReactShellHandlers {
  addAction?: () => void;
  addState?: () => void;
  deleteSelection?: () => void;
  revert?: () => void;
  selectAction?: (actionId: string) => void;
  selectRouteBranch?: (routeNodeId: string, branchId: string) => void;
  selectRouteNode?: (routeNodeId: string) => void;
  selectState?: (stateId: string) => void;
  setViewMode?: (mode: "list" | "node") => void;
}

export interface FlowToolReactShellSelection {
  canAddAction?: boolean;
  canAddState?: boolean;
  canDelete?: boolean;
  canRevert?: boolean;
  flowActionTypes?: FlowActionTypeMeta[];
  flowNodeDepth?: string;
  flowViewMode?: string;
  selectedActionId?: string;
  selectedRouteBranchId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
}

export interface MountFlowToolAppOptions {
  createRoot?: (container: Element) => Pick<Root, "render" | "unmount">;
  document?: Document;
  flow?: GameFlow | null;
  previewMode?: string;
  surface?: string;
  visible?: boolean;
}

declare global {
  interface Window {
    PartyGameFlowReactShell?: FlowToolReactShell;
  }
}

export function mountFlowToolApp(options: MountFlowToolAppOptions = {}): FlowToolReactShell | null {
  const targetDocument = options.document || document;
  const searchParams = new URLSearchParams(targetDocument.defaultView?.location?.search || "");
  const previewParam = searchParams.get("reactFlowPreview") || "";
  const visible = options.visible ?? Boolean(previewParam);
  const previewMode = options.previewMode || (previewParam === "replace" ? "replace" : "overlay");
  const host = targetDocument.createElement("div");
  host.id = "flowReactShell";
  host.hidden = !visible;
  if (host.dataset) host.dataset.previewMode = previewMode;
  targetDocument.body?.classList?.toggle("flow-react-preview-replace", visible && previewMode === "replace");
  (targetDocument.querySelector?.("#flowScreen") || targetDocument.body).appendChild(host);
  const root = (options.createRoot || createRoot)(host);
  const surface = options.surface || "flow";
  let handlers: FlowToolReactShellHandlers = {};
  let lastFlow: GameFlow | null = options.flow || null;
  let lastSelection: FlowToolReactShellSelection = {};
  const update = (flow: GameFlow | null = null, selection: FlowToolReactShellSelection = {}) => {
    lastFlow = flow;
    lastSelection = selection;
    root.render(
      <FlowToolApp
        canAddAction={selection.canAddAction || false}
        canAddState={selection.canAddState ?? true}
        canDelete={selection.canDelete || false}
        canRevert={selection.canRevert || false}
        flowActionTypes={selection.flowActionTypes || []}
        flowNodeDepth={selection.flowNodeDepth || "actions"}
        flowViewMode={selection.flowViewMode || "list"}
        flow={flow}
        handlers={handlers}
        selectedActionId={selection.selectedActionId || ""}
        selectedRouteBranchId={selection.selectedRouteBranchId || ""}
        selectedRouteNodeId={selection.selectedRouteNodeId || ""}
        selectedStateId={selection.selectedStateId || ""}
        previewMode={previewMode}
        surface={surface}
        visible={visible}
      />
    );
  };
  const shell = {
    root: root as Root,
    setHandlers: (nextHandlers: FlowToolReactShellHandlers) => {
      handlers = { ...handlers, ...nextHandlers };
      update(lastFlow, lastSelection);
    },
    update,
    unmount: () => {
      root.unmount();
      targetDocument.body?.classList?.remove("flow-react-preview-replace");
      host.remove();
    }
  };
  update(options.flow || null);
  if (targetDocument.defaultView) targetDocument.defaultView.PartyGameFlowReactShell = shell;
  return shell;
}
