import { createRoot, type Root } from "react-dom/client";
import type { StageLayoutCollection } from "../../types/game-data";
import { LayoutToolApp, type LayoutToolHandlers, type LayoutToolSelection } from "./LayoutToolApp";

export interface LayoutToolReactShell {
  root: Root;
  setHandlers: (handlers: LayoutToolHandlers) => void;
  update: (layouts?: StageLayoutCollection | null, selection?: LayoutToolSelection) => void;
  unmount: () => void;
}

export interface MountLayoutToolAppOptions {
  createRoot?: (container: Element) => Pick<Root, "render" | "unmount">;
  document?: Document;
  layouts?: StageLayoutCollection | null;
  surface?: string;
  visible?: boolean;
}

declare global {
  interface Window {
    PartyGameLayoutReactShell?: LayoutToolReactShell;
  }
}

export function mountLayoutToolApp(options: MountLayoutToolAppOptions = {}): LayoutToolReactShell | null {
  const targetDocument = options.document || document;
  const visible = options.visible ?? targetDocument.defaultView?.location?.search.includes("reactLayoutPreview=1") ?? false;
  const host = targetDocument.createElement("div");
  host.id = "layoutReactShell";
  host.hidden = !visible;
  (targetDocument.querySelector?.("#layoutScreen") || targetDocument.body).appendChild(host);
  const root = (options.createRoot || createRoot)(host);
  const surface = options.surface || "layout";
  let handlers: LayoutToolHandlers = {};
  let lastLayouts: StageLayoutCollection | null = options.layouts || null;
  let lastSelection: LayoutToolSelection = {};

  const update = (layouts: StageLayoutCollection | null = null, selection: LayoutToolSelection = {}) => {
    lastLayouts = layouts;
    lastSelection = selection;
    root.render(
      <LayoutToolApp
        handlers={handlers}
        layouts={layouts}
        mode={selection.mode || "stage"}
        selectedElementIds={selection.selectedElementIds || []}
        selectedStateId={selection.selectedStateId || "global"}
        surface={surface}
        visible={visible}
      />
    );
  };
  const shell = {
    root: root as Root,
    setHandlers: (nextHandlers: LayoutToolHandlers) => {
      handlers = { ...handlers, ...nextHandlers };
      update(lastLayouts, lastSelection);
    },
    update,
    unmount: () => {
      root.unmount();
      host.remove();
    }
  };
  update(options.layouts || null);
  if (targetDocument.defaultView) targetDocument.defaultView.PartyGameLayoutReactShell = shell;
  return shell;
}
