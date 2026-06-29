import { useState } from "react";
import type { ArtAssetsController } from "./artAssetsController";
import type { ArtCompositionsController } from "./artCompositionsController";
import type { ArtOrganizationController } from "./artOrganizationController";
import type { OrgSurface } from "./organizationModel";
import { ArtAssetManager } from "./ArtAssetManager";
import { ArtCompositionEditor } from "./ArtCompositionEditor";
import { ArtOrganizationPanel } from "./ArtOrganizationPanel";

export interface ArtEditorProps {
  assetsController: ArtAssetsController;
  compositionsController: ArtCompositionsController;
  organizationController: ArtOrganizationController;
  surface?: string;
}

/**
 * React-only Art tool: the composition editor (list + canvas + component tree +
 * inspector), the drag-drop organizer, and the asset manager — all driven by typed
 * controllers.
 */
export function ArtEditor({
  assetsController,
  compositionsController,
  organizationController,
  surface = "art"
}: ArtEditorProps) {
  const [orgSurface, setOrgSurface] = useState<OrgSurface>("stage");
  return (
    <section className="layout-react-shell" data-art-react-shell="react" data-surface={surface}>
      <ArtCompositionEditor controller={compositionsController} />
      <section className="flow-react-panel" data-art-react-component="organization-wrap">
        <div className="flow-editor-controls">
          <button type="button" aria-pressed={orgSurface === "stage"} onClick={() => setOrgSurface("stage")}>
            Stage Org
          </button>
          <button type="button" aria-pressed={orgSurface === "controller"} onClick={() => setOrgSurface("controller")}>
            Controller Org
          </button>
        </div>
        <ArtOrganizationPanel controller={organizationController} surface={orgSurface} />
      </section>
      <ArtAssetManager controller={assetsController} />
    </section>
  );
}
