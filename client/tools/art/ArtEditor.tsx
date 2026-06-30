import { useState } from "react";
import type { ArtAssetsController } from "./artAssetsController";
import type { ArtCompositionsController } from "./artCompositionsController";
import type { ArtOrganizationController } from "./artOrganizationController";
import type { OrgSurface } from "./organizationModel";
import { ToolWorkspace } from "../common/ToolWorkspace";
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
  const sidebar = (
    <>
      <h3>Art Assets</h3>
      <div className="tool-sidebar-switcher" role="group" aria-label="Art organization surface">
        <button type="button" aria-pressed={orgSurface === "stage"} onClick={() => setOrgSurface("stage")}>
          Stage Org
        </button>
        <button type="button" aria-pressed={orgSurface === "controller"} onClick={() => setOrgSurface("controller")}>
          Controller Org
        </button>
      </div>
      <ArtOrganizationPanel controller={organizationController} surface={orgSurface} />
    </>
  );

  return (
    <ToolWorkspace
      className="art-workspace"
      dataAttributes={{ "art-react-shell": "react", "surface": surface }}
      header={<h2>Art Manager</h2>}
      sidebar={sidebar}
      sidebarLabel="Art organization"
      storageKey="partyTemplate.artSidebarWidth"
      title="Art Assets"
      toolId="art"
    >
      <div className="tool-main-columns art-workspace-content">
        <ArtCompositionEditor controller={compositionsController} />
        <ArtAssetManager controller={assetsController} />
      </div>
    </ToolWorkspace>
  );
}
