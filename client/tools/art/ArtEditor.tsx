import { useEffect, useState } from "react";
import type { ArtAssetsController } from "./artAssetsController";
import type { ArtCompositionsController } from "./artCompositionsController";
import type { ArtOrganizationController } from "./artOrganizationController";
import type { OrgSurface } from "./organizationModel";
import { ToolWorkspace } from "../common/ToolWorkspace";
import { ArtCompositionBrowser } from "./ArtCompositionBrowser";
import { ArtCompositionEditor } from "./ArtCompositionEditor";
import { useArtAssets } from "./useArtAssets";
import { useArtCompositions } from "./useArtCompositions";
import { useArtOrganization } from "./useArtOrganization";

export interface ArtEditorProps {
  assetsController: ArtAssetsController;
  compositionsController: ArtCompositionsController;
  organizationController: ArtOrganizationController;
  surface?: string;
}

function surfaceForComposition(surface: unknown): OrgSurface {
  return surface === "controller" ? "controller" : "stage";
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
  void assetsController;
  const [surfaceFilter, setSurfaceFilter] = useState<OrgSurface>(() => {
    const initialState = compositionsController.getState();
    const selectedComposition = initialState.compositions.find(
      (composition) => composition.id === initialState.selectedCompositionId
    );
    return selectedComposition ? surfaceForComposition(selectedComposition.surface) : "stage";
  });
  const { assets } = useArtAssets(assetsController);
  const compositionsState = useArtCompositions(compositionsController);
  const organizationState = useArtOrganization(organizationController);
  useEffect(() => {
    organizationController.setSourceItems(compositionsState.compositions, assets);
  }, [assets, compositionsState.compositions, organizationController]);
  const sidebar = (
    <ArtCompositionBrowser
      compositionsController={compositionsController}
      organizationController={organizationController}
      surface={surfaceFilter}
      onSurfaceChange={setSurfaceFilter}
    />
  );

  return (
    <ToolWorkspace
      className="art-workspace"
      dataAttributes={{ "art-react-shell": "react", "surface": surface }}
      header={<h2>Art Manager</h2>}
      sidebar={sidebar}
      sidebarLabel="Compositions"
      storageKey="partyTemplate.artSidebarWidth"
      title="Art Manager"
      toolId="art"
      history={[
        {
          id: "art-organization",
          targetSelector: ".tool-workspace-sidebar",
          canUndo: organizationState.canUndo,
          canRedo: organizationState.canRedo,
          onUndo: () => organizationController.undo(),
          onRedo: () => organizationController.redo()
        },
        {
          id: "art-compositions",
          targetSelector: ".art-composition-editor",
          canUndo: compositionsState.canUndo,
          canRedo: compositionsState.canRedo,
          onUndo: () => compositionsController.undo(),
          onRedo: () => compositionsController.redo()
        }
      ]}
    >
      <div className="art-workspace-content">
        <ArtCompositionEditor controller={compositionsController} assets={assets} />
      </div>
    </ToolWorkspace>
  );
}
