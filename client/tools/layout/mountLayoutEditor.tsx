import { createRoot, type Root } from "react-dom/client";
import type { ArtApi } from "../../api/artApi";
import type { LayoutApi } from "../../api/layoutApi";
import type { ToolDraftApi } from "../../api/toolDraftApi";
import type { ArtAsset, ArtComposition } from "../../types/game-data";
import {
  installSessionDraftLifecycle,
  type SessionDraftLifecycle
} from "../common/sessionDraftLifecycle";
import { createLayoutController, type LayoutController } from "./layoutController";
import { LayoutEditor } from "./LayoutEditor";
import type {
  GamePluginInputManifest,
  GamePluginRendererManifest
} from "./LayoutCollectionPreview";
import type { LayoutMode } from "./layoutModel";

export interface MountLayoutEditorOptions {
  api: LayoutApi;
  artApi?: ArtApi;
  draftApi?: ToolDraftApi;
  document?: Document;
  onOpenArtComposition?: (compositionId: string) => void;
  surface?: string;
  initialMode?: LayoutMode;
  /** Reveal #layoutScreen (standalone /layout). False on /tools (router manages). */
  revealScreen?: boolean;
}

export interface MountedLayoutEditor {
  stageController: LayoutController;
  controllerController: LayoutController;
  root: Root;
  setMode: (mode: LayoutMode) => void;
  setArtCatalog: (assets: ArtAsset[], compositions: ArtComposition[]) => void;
  unmount: () => void;
}

export async function mountLayoutEditor(
  options: MountLayoutEditorOptions
): Promise<MountedLayoutEditor> {
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
  const [stage, controller, loadedArt] = await Promise.all([
    options.api.loadStageLayouts(),
    options.api.loadControllerLayouts(),
    options.artApi
      ? options.artApi.loadArtAssets()
      : Promise.resolve({ assets: [], compositions: [] })
  ]);
  const postDraft = options.draftApi
    ? (message: Parameters<ToolDraftApi["saveToolDraft"]>[0]) =>
        options.draftApi!.saveToolDraft(message)
    : undefined;
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
  let requestedMode = options.initialMode || "stage";
  let renderVersion = 0;
  let artAssets = loadedArt.assets || [];
  let artCompositions = loadedArt.compositions || [];
  let gamePluginInputs: GamePluginInputManifest[] = [];
  let gamePluginRenderers: GamePluginRendererManifest[] = [];
  try {
    const config = JSON.parse(doc.getElementById("pop-party-runtime-config")?.textContent || "{}");
    gamePluginInputs = [
      ...(Array.isArray(config?.gamePlugin?.inputs) ? config.gamePlugin.inputs : []),
      ...(Array.isArray(config?.gamePlugin?.controllerInteractions) ? config.gamePlugin.controllerInteractions : [])
    ];
    gamePluginRenderers = Array.isArray(config?.gamePlugin?.renderers) ? config.gamePlugin.renderers : [];
  } catch {
    gamePluginInputs = [];
    gamePluginRenderers = [];
  }
  const render = () => {
    root.render(
      <LayoutEditor
        key={`${requestedMode}-${renderVersion}`}
        artAssets={artAssets}
        artCompositions={artCompositions}
        onOpenArtComposition={options.onOpenArtComposition}
        stageController={stageController}
        controllerController={controllerController}
        initialMode={requestedMode}
        surface={options.surface}
        gamePluginInputs={gamePluginInputs}
        gamePluginRenderers={gamePluginRenderers}
      />
    );
  };
  render();

  return {
    stageController,
    controllerController,
    root,
    setMode: (mode) => {
      requestedMode = mode;
      renderVersion += 1;
      render();
    },
    setArtCatalog: (assets, compositions) => {
      artAssets = [...assets];
      artCompositions = [...compositions];
      renderVersion += 1;
      render();
    },
    unmount: () => {
      root.unmount();
      for (const draftLifecycle of draftLifecycles) draftLifecycle.dispose();
      doc.body?.classList?.remove("layout-react-replace");
      host.remove();
    }
  };
}
