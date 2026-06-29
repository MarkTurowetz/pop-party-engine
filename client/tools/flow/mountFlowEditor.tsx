import { createRoot, type Root } from "react-dom/client";
import type { FlowApi } from "../../api/flowApi";
import type { FlowActionTypeMeta } from "./flowSelectors";
import { createFlowEditorController, type FlowEditorController } from "./flowEditorController";
import { FlowEditor } from "./FlowEditor";

export interface MountFlowEditorOptions {
  api: FlowApi;
  document?: Document;
  surface?: string;
  /**
   * Whether to reveal #flowScreen by removing its `hidden` class. True for the
   * standalone /flow route (no legacy screen router). False on /tools, where the
   * legacy tool router toggles screen visibility per tab.
   */
  revealScreen?: boolean;
}

export interface MountedFlowEditor {
  controller: FlowEditorController;
  root: Root;
  unmount: () => void;
}

function toActionTypeMeta(values: unknown[]): FlowActionTypeMeta[] {
  return (values || [])
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((value) => ({
      ...value,
      id: String(value.id ?? value.type ?? ""),
      name: String(value.name ?? value.label ?? value.id ?? ""),
      category: value.category ? String(value.category) : undefined
    }));
}

/**
 * Mount the React-only Flow editor. Loads the flow from the API and drives the
 * {@link FlowEditor} directly — no legacy scripts, no `window.PartyGame*` bridge.
 */
export async function mountFlowEditor(options: MountFlowEditorOptions): Promise<MountedFlowEditor> {
  const doc = options.document || document;
  const response = await options.api.loadGameFlow();
  const actionTypes = toActionTypeMeta(response.availableActionTypes || []);
  const controller = createFlowEditorController({
    initialFlow: response.flow,
    api: options.api,
    hasLocalDraft: response.hasLocalDraft,
    actionTypes
  });

  const host = doc.createElement("div");
  host.id = "flowEditorRoot";
  // The legacy screen router (not booted on the standalone /flow route) is what
  // removes the `hidden` class from the active screen. Reveal the flow screen
  // ourselves so the editor is visible — unless a router will manage it (/tools).
  const flowScreen = doc.querySelector("#flowScreen");
  if (options.revealScreen !== false) {
    doc.body?.classList?.add("flow-react-preview-replace");
    flowScreen?.classList.remove("hidden");
  }
  // Hide the legacy flow markup that ships in #flowScreen so only the React editor
  // shows (its dead controls would otherwise appear alongside ours, e.g. on /tools).
  if (flowScreen) {
    for (const child of Array.from(flowScreen.children)) {
      if (child !== host) (child as HTMLElement).style.display = "none";
    }
  }
  (flowScreen || doc.body).appendChild(host);

  const root = createRoot(host);
  root.render(<FlowEditor controller={controller} flowActionTypes={actionTypes} surface={options.surface} />);

  return {
    controller,
    root,
    unmount: () => {
      root.unmount();
      doc.body?.classList?.remove("flow-react-preview-replace");
      host.remove();
    }
  };
}
