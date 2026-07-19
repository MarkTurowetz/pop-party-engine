import { useEffect, useRef, useState } from "react";
import type { ArtAssetsController } from "./artAssetsController";
import type { ArtCompositionsController } from "./artCompositionsController";
import type { ArtOrganizationController } from "./artOrganizationController";
import { itemKey, type OrgSurface } from "./organizationModel";
import { ToolWorkspace } from "../common/ToolWorkspace";
import { ArtCompositionBrowser, type ArtBrowserSurface } from "./ArtCompositionBrowser";
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

export function isArtCompositionDuplicateShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "repeat" | "shiftKey">
): boolean {
  return event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey && !event.repeat && event.key.toLowerCase() === "d";
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest?.("input, textarea, select, [contenteditable='true']"));
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
  const [surfaceFilter, setSurfaceFilter] = useState<ArtBrowserSurface>(() => {
    const initialState = compositionsController.getState();
    const selectedComposition = initialState.compositions.find(
      (composition) => composition.id === initialState.selectedCompositionId
    );
    return selectedComposition ? surfaceForComposition(selectedComposition.surface) : "stage";
  });
  const openedWorkspace = useRef(false);
  const { assets } = useArtAssets(assetsController);
  const compositionsState = useArtCompositions(compositionsController);
  const organizationState = useArtOrganization(organizationController);
  useEffect(() => {
    if (openedWorkspace.current) return;
    openedWorkspace.current = true;
    if (surfaceFilter !== "all") compositionsController.selectWorkspace(surfaceFilter);
  }, [compositionsController, surfaceFilter]);
  useEffect(() => {
    organizationController.setSourceItems(compositionsState.compositions, assets);
  }, [assets, compositionsState.compositions, organizationController]);
  useEffect(() => {
    const duplicateSelectedComposition = (event: KeyboardEvent) => {
      if (!isArtCompositionDuplicateShortcut(event) || isEditableShortcutTarget(event.target)) return;
      const source = compositionsState.compositions.find(
        (composition) => composition.id === compositionsState.selectedCompositionId
      );
      if (!source) return;
      event.preventDefault();
      const sourceKey = itemKey(source);
      const sourceSurface = surfaceForComposition(source.surface);
      const organizationSurface = organizationState.organization[sourceSurface];
      const sourceIsOrganized =
        organizationSurface.order.includes(sourceKey) ||
        Object.values(organizationSurface.folderItems).some((keys) => keys.includes(sourceKey));
      const duplicate = compositionsController.duplicateComposition(source.id);
      if (!duplicate) return;
      if (sourceIsOrganized) {
        organizationController.moveBeside(sourceSurface, itemKey(duplicate), sourceKey, true);
      }
      setSurfaceFilter(sourceSurface);
    };
    window.addEventListener("keydown", duplicateSelectedComposition);
    return () => window.removeEventListener("keydown", duplicateSelectedComposition);
  }, [compositionsController, compositionsState.compositions, compositionsState.selectedCompositionId, organizationController, organizationState.organization]);
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
