import { createRoot, type Root } from "react-dom/client";
import type { LayoutApi } from "../../api/layoutApi";
import { createLayoutController, type LayoutController } from "./layoutController";
import { LayoutEditor } from "./LayoutEditor";

export interface MountLayoutEditorOptions {
  api: LayoutApi;
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
  const [stage, controller] = await Promise.all([options.api.loadStageLayouts(), options.api.loadControllerLayouts()]);
  const stageController = createLayoutController({ initialLayouts: stage.layouts, mode: "stage", api: options.api });
  const controllerController = createLayoutController({
    initialLayouts: controller.layouts,
    mode: "controller",
    api: options.api
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
    <LayoutEditor stageController={stageController} controllerController={controllerController} surface={options.surface} />
  );

  return {
    stageController,
    controllerController,
    root,
    unmount: () => {
      root.unmount();
      doc.body?.classList?.remove("layout-react-replace");
      host.remove();
    }
  };
}
