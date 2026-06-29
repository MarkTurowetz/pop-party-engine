import { createRoot, type Root } from "react-dom/client";
import type { ArtApi } from "../../api/artApi";
import { createArtAssetsController, type ArtAssetsController } from "./artAssetsController";
import { createArtCompositionsController, type ArtCompositionsController } from "./artCompositionsController";
import { ArtEditor } from "./ArtEditor";

export interface MountArtEditorOptions {
  api: ArtApi;
  document?: Document;
  surface?: string;
  /** Reveal #artScreen (standalone /art). False on /tools (router manages). */
  revealScreen?: boolean;
}

export interface MountedArtEditor {
  assetsController: ArtAssetsController;
  compositionsController: ArtCompositionsController;
  root: Root;
  unmount: () => void;
}

export async function mountArtEditor(options: MountArtEditorOptions): Promise<MountedArtEditor> {
  const doc = options.document || document;
  const response = await options.api.loadArtAssets();
  const assetsController = createArtAssetsController({ initialAssets: response.assets || [], api: options.api });
  const compositionsController = createArtCompositionsController({
    initialCompositions: response.compositions || [],
    api: options.api
  });

  const host = doc.createElement("div");
  host.id = "artEditorRoot";
  const screen = doc.querySelector("#artScreen");
  if (options.revealScreen !== false) {
    doc.body?.classList?.add("art-react-replace");
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
    <ArtEditor assetsController={assetsController} compositionsController={compositionsController} surface={options.surface} />
  );

  return {
    assetsController,
    compositionsController,
    root,
    unmount: () => {
      root.unmount();
      doc.body?.classList?.remove("art-react-replace");
      host.remove();
    }
  };
}
