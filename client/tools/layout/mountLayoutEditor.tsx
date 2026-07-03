import { createRoot, type Root } from "react-dom/client";
import type { ArtApi } from "../../api/artApi";
import type { LayoutApi } from "../../api/layoutApi";
import type { ToolDraftApi } from "../../api/toolDraftApi";
import { installSessionDraftLifecycle, type SessionDraftLifecycle } from "../common/sessionDraftLifecycle";
import { createLayoutController, type LayoutController } from "./layoutController";
import { LayoutEditor } from "./LayoutEditor";

export interface MountLayoutEditorOptions {
  api: LayoutApi;
  artApi?: ArtApi;
  draftApi?: ToolDraftApi;
  document?: Document;
  surface?: string;
  /** Reveal #layoutScreen (standalone /layout). False on /tools (router manages). */
  revealScreen?: boolean;
}

export interface MountedLayoutEditor {
  stageController: LayoutController;
  controllerController: LayoutController;
  root: Root;
  unmount: () => void;
}

export async function mountLayoutEditor(options: MountLayoutEditorOptions): Promise<MountedLayoutEditor> {
  const doc = options.document || document;
  const draftLifecycles: SessionDraftLifecycle[] = [];
  if (options.draftApi) {
    draftLifecycles.push(
      await installSessionDraftLifecycle({
        document: doc,
        clearMessage: { clearLayouts: true },
        postDraft: (message) => options.draftApi!.saveToolDraft(message)
      }),
      await installSessionDraftLifecycle({
        document: doc,
        clearMessage: { clearControllerLayouts: true },
        postDraft: (message) => options.draftApi!.saveToolDraft(message)
      })
    );
  }
  const [stage, controller, art] = await Promise.all([
    options.api.loadStageLayouts(),
    options.api.loadControllerLayouts(),
    options.artApi ? options.artApi.loadArtAssets() : Promise.resolve({ assets: [], compositions: [] })
  ]);
  const postDraft = options.draftApi ? (message: Parameters<ToolDraftApi["saveToolDraft"]>[0]) => options.draftApi!.saveToolDraft(message) : undefined;
  const stageController = createLayoutController({
    initialLayouts: stage.layouts,
    mode: "stage",
    api: options.api,
    postDraft
  });
  const controllerController = createLayoutController({
    initialLayouts: controller.layouts,
    mode: "controller",
    api: options.api,
    postDraft
  });

  const host = doc.createElement("div");
  host.id = "layoutEditorRoot";
  const screen = doc.querySelector("#layoutScreen");
  if (options.revealScreen !== false) {
    doc.body?.classList?.add("layout-react-replace");
    screen?.classList.remove("hidden");
  }
  if (screen) {
    for (const child of Array.from(screen.children)) {
      if (child !== host) (child as HTMLElement).style.display = "none";
    }
  }
  (screen || doc.body).appendChild(host);

  const root = createRoot(host);
  root.render(
    <LayoutEditor
      artAssets={art.assets}
      artCompositions={art.compositions}
      stageController={stageController}
      controllerController={controllerController}
      surface={options.surface}
    />
  );

  return {
    stageController,
    controllerController,
    root,
    unmount: () => {
      root.unmount();
      for (const draftLifecycle of draftLifecycles) draftLifecycle.dispose();
      doc.body?.classList?.remove("layout-react-replace");
      host.remove();
    }
  };
}
