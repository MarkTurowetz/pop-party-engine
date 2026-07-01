import { createRoot, type Root } from "react-dom/client";
import type { ConstantsApi } from "../../api/constantsApi";
import type { ToolDraftApi } from "../../api/toolDraftApi";
import { installSessionDraftLifecycle, type SessionDraftLifecycle } from "../common/sessionDraftLifecycle";
import { createConstantsController, type ConstantsController } from "./constantsController";
import { ConstantsEditor } from "./ConstantsEditor";

export interface MountConstantsEditorOptions {
  api: ConstantsApi;
  draftApi?: ToolDraftApi;
  document?: Document;
  surface?: string;
  /** Reveal #constantsScreen (standalone /constants). False on /tools where the router manages it. */
  revealScreen?: boolean;
}

export interface MountedConstantsEditor {
  controller: ConstantsController;
  root: Root;
  unmount: () => void;
}

/** Mount the React-only constants editor: loads from the API, no legacy bridge. */
export async function mountConstantsEditor(options: MountConstantsEditorOptions): Promise<MountedConstantsEditor> {
  const doc = options.document || document;
  const draftLifecycle: SessionDraftLifecycle | null = options.draftApi
    ? await installSessionDraftLifecycle({
        document: doc,
        clearMessage: { clearConstants: true },
        postDraft: (message) => options.draftApi!.saveToolDraft(message)
      })
    : null;
  const response = await options.api.loadGameConstants();
  const controller = createConstantsController({
    initialConstants: response.constants,
    api: options.api,
    postDraft: options.draftApi ? (message) => options.draftApi!.saveToolDraft(message) : undefined
  });

  const host = doc.createElement("div");
  host.id = "constantsEditorRoot";
  const screen = doc.querySelector("#constantsScreen");
  if (options.revealScreen !== false) {
    doc.body?.classList?.add("constants-react-replace");
    screen?.classList.remove("hidden");
  }
  if (screen) {
    for (const child of Array.from(screen.children)) {
      if (child !== host) (child as HTMLElement).style.display = "none";
    }
  }
  (screen || doc.body).appendChild(host);

  const root = createRoot(host);
  root.render(<ConstantsEditor controller={controller} surface={options.surface} />);

  return {
    controller,
    root,
    unmount: () => {
      root.unmount();
      draftLifecycle?.dispose();
      doc.body?.classList?.remove("constants-react-replace");
      host.remove();
    }
  };
}
