import type { ArtAssetsController } from "./artAssetsController";
import type { ArtCompositionsController } from "./artCompositionsController";
import { ArtAssetManager } from "./ArtAssetManager";
import { ArtCompositionEditor } from "./ArtCompositionEditor";

export interface ArtEditorProps {
  assetsController: ArtAssetsController;
  compositionsController: ArtCompositionsController;
  surface?: string;
}

/**
 * React-only Art tool: the composition editor (list + canvas + component tree +
 * inspector) and the asset manager, both driven by typed controllers.
 */
export function ArtEditor({ assetsController, compositionsController, surface = "art" }: ArtEditorProps) {
  return (
    <section className="layout-react-shell" data-art-react-shell="react" data-surface={surface}>
      <ArtCompositionEditor controller={compositionsController} />
      <ArtAssetManager controller={assetsController} />
    </section>
  );
}
