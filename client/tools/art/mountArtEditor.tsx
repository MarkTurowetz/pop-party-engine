import { createRoot, type Root } from "react-dom/client";
import type { ArtApi } from "../../api/artApi";
import type { ToolDraftApi } from "../../api/toolDraftApi";
import { installSessionDraftLifecycle, type SessionDraftLifecycle } from "../common/sessionDraftLifecycle";
import { createArtAssetsController, type ArtAssetsController } from "./artAssetsController";
import { createArtCompositionsController, type ArtCompositionsController } from "./artCompositionsController";
import { createArtOrganizationController, type ArtOrganizationController } from "./artOrganizationController";
import { normalizeOrganization } from "./organizationModel";
import { ArtEditor } from "./ArtEditor";

export interface MountArtEditorOptions {
  api: ArtApi;
  draftApi?: ToolDraftApi;
  document?: Document;
  initialCompositionId?: string;
  surface?: string;
  /** Reveal #artScreen (standalone /art). False on /tools (router manages). */
  revealScreen?: boolean;
}

export interface MountedArtEditor {
  assetsController: ArtAssetsController;
  compositionsController: ArtCompositionsController;
  organizationController: ArtOrganizationController;
  root: Root;
  unmount: () => void;
}

export async function mountArtEditor(options: MountArtEditorOptions): Promise<MountedArtEditor> {
  const doc = options.document || document;
  const draftLifecycles: SessionDraftLifecycle[] = [];
  if (options.draftApi) {
    draftLifecycles.push(
      await installSessionDraftLifecycle({
        document: doc,
        clearMessage: { clearArtAssetReplacements: true },
        postDraft: (message) => options.draftApi!.saveToolDraft(message)
      }),
      await installSessionDraftLifecycle({
        document: doc,
        clearMessage: { clearArtCompositions: true },
        postDraft: (message) => options.draftApi!.saveToolDraft(message)
      }),
      await installSessionDraftLifecycle({
        document: doc,
        clearMessage: { clearArtOrganization: true },
        postDraft: (message) => options.draftApi!.saveToolDraft(message)
      })
    );
  }
  const response = await options.api.loadArtAssets();
  const postDraft = options.draftApi ? (message: Parameters<ToolDraftApi["saveToolDraft"]>[0]) => options.draftApi!.saveToolDraft(message) : undefined;
  const assetsController = createArtAssetsController({
    initialAssets: response.assets || [],
    api: options.api,
    postDraft
  });
  const compositionsController = createArtCompositionsController({
    initialCompositions: response.compositions || [],
    api: options.api,
    postDraft
  });
  const initialCompositionId = String(options.initialCompositionId || "");
  if (initialCompositionId && (response.compositions || []).some((composition) => composition.id === initialCompositionId)) {
    compositionsController.selectComposition(initialCompositionId);
  }
  const organizationController = createArtOrganizationController({
    initialOrganization: normalizeOrganization(response.organization),
    compositions: response.compositions || [],
    assets: response.assets || [],
    api: options.api,
    postDraft
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
    <ArtEditor
      assetsController={assetsController}
      compositionsController={compositionsController}
      organizationController={organizationController}
      surface={options.surface}
    />
  );

  return {
    assetsController,
    compositionsController,
    organizationController,
    root,
    unmount: () => {
      root.unmount();
      for (const draftLifecycle of draftLifecycles) draftLifecycle.dispose();
      doc.body?.classList?.remove("art-react-replace");
      host.remove();
    }
  };
}
