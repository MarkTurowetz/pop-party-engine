import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import type { ArtCompositionsController } from "./artCompositionsController";
import type { ArtOrganizationController } from "./artOrganizationController";
import { searchArtHierarchy } from "./artHierarchySearch";
import { folderIdFromKey, type OrgItem, type OrgSurface } from "./organizationModel";
import { useArtCompositions } from "./useArtCompositions";
import { useArtOrganization } from "./useArtOrganization";

export interface ArtCompositionBrowserProps {
  compositionsController: ArtCompositionsController;
  organizationController: ArtOrganizationController;
  surface: OrgSurface;
  onSurfaceChange(surface: OrgSurface): void;
}

const DND_TYPE = "application/x-art-composition-browser-key";
const COLLAPSED_STORAGE_KEY = "partyTemplate.artCompositionBrowserCollapsedFolders";

function compositionIdFromKey(key: string): string {
  return String(key || "").startsWith("composition:") ? String(key).slice("composition:".length) : "";
}

function collapsedKey(surface: OrgSurface, folderId: string): string {
  return `${surface}:${folderId}`;
}

function readCollapsedFolders(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value = JSON.parse(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch (_error) {
    return new Set();
  }
}

function writeCollapsedFolders(collapsed: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]));
}

export function ArtCompositionBrowser({
  compositionsController,
  organizationController,
  surface,
  onSurfaceChange
}: ArtCompositionBrowserProps) {
  const { selectedCompositionId } = useArtCompositions(compositionsController);
  const { organization, surfaceItems, dirty, saving, canUndo, canRedo } = useArtOrganization(organizationController);
  const [folderName, setFolderName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState(readCollapsedFolders);
  const state = organization[surface];
  const compositionItems = surfaceItems[surface].filter((item: OrgItem) => item.type === "composition");
  const validCompositionKeys = new Set(compositionItems.map((item) => item.key));
  const nameByKey = new Map(compositionItems.map((item) => [item.key, item.name]));
  const search = useMemo(
    () => searchArtHierarchy(state, compositionItems, searchQuery),
    [state, compositionItems, searchQuery]
  );
  const folderNameFor = (id: string) => state.folders.find((folder) => folder.id === id)?.name || "Folder";
  const visibleFolderIds = useMemo(
    () => state.folders.map((folder) => folder.id),
    [state.folders]
  );
  const allSurfaceFoldersCollapsed = visibleFolderIds.length > 0 && visibleFolderIds.every((folderId) =>
    collapsedFolders.has(collapsedKey(surface, folderId))
  );

  const placed = new Set<string>(state.order.filter((key) => validCompositionKeys.has(key)));
  for (const folderId of Object.keys(state.folderItems)) {
    for (const key of state.folderItems[folderId] || []) if (validCompositionKeys.has(key)) placed.add(key);
  }
  const unfiled = compositionItems.filter((item) => !placed.has(item.key));

  const onDragStart = (event: DragEvent, key: string) => {
    event.stopPropagation();
    event.dataTransfer.setData(DND_TYPE, key);
  };
  const dragKey = (event: DragEvent) => event.dataTransfer.getData(DND_TYPE);
  const onDropBeside = (event: DragEvent, targetKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = dragKey(event);
    if (dragged) organizationController.moveBeside(surface, dragged, targetKey, false);
  };
  const onDropIntoFolder = (event: DragEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = dragKey(event);
    if (dragged) organizationController.moveIntoFolder(surface, dragged, folderId);
  };
  const onDropRoot = (event: DragEvent) => {
    event.preventDefault();
    const dragged = dragKey(event);
    if (dragged) organizationController.moveIntoFolder(surface, dragged, "");
  };
  const updateCollapsedFolders = (apply: (draft: Set<string>) => void) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      apply(next);
      writeCollapsedFolders(next);
      return next;
    });
  };
  const toggleFolder = (event: MouseEvent<HTMLButtonElement>, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      updateCollapsedFolders((draft) => {
        for (const id of visibleFolderIds) {
          const key = collapsedKey(surface, id);
          if (allSurfaceFoldersCollapsed) draft.delete(key);
          else draft.add(key);
        }
      });
      return;
    }
    updateCollapsedFolders((draft) => {
      const key = collapsedKey(surface, folderId);
      if (draft.has(key)) draft.delete(key);
      else draft.add(key);
    });
  };

  const renderCompositionItem = (key: string) => {
    const compositionId = compositionIdFromKey(key);
    if (!compositionId || !validCompositionKeys.has(key)) return null;
    if (search.active && !search.visibleKeys.has(key)) return null;
    return (
      <li
        className="art-browser-item"
        data-art-browser-composition={compositionId}
        key={key}
        draggable
        onDragStart={(event) => onDragStart(event, key)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDropBeside(event, key)}
      >
        <button
          type="button"
          aria-current={compositionId === selectedCompositionId ? "true" : undefined}
          onClick={() => compositionsController.selectComposition(compositionId)}
        >
          <span>{nameByKey.get(key) || compositionId}</span>
        </button>
      </li>
    );
  };

  const renderFolder = (folderId: string) => {
    if (search.active && !search.visibleKeys.has(`folder:${folderId}`)) return null;
    const collapsed = search.active
      ? !search.expandedFolderIds.has(folderId)
      : collapsedFolders.has(collapsedKey(surface, folderId));
    return (
    <li
      className={`art-browser-folder${collapsed ? " is-collapsed" : ""}`}
      data-art-browser-folder={folderId}
      key={`folder:${folderId}`}
    >
      <header
        draggable
        onDragStart={(event) => onDragStart(event, `folder:${folderId}`)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDropIntoFolder(event, folderId)}
      >
        <button
          type="button"
          className={`disclosure-button${collapsed ? " is-collapsed" : ""}`}
          aria-label={`${collapsed ? "Open" : "Close"} ${folderNameFor(folderId)}`}
          aria-expanded={!collapsed}
          onClick={(event) => toggleFolder(event, folderId)}
          onDragStart={(event) => event.preventDefault()}
        />
        <input
          type="text"
          key={`${folderId}-name`}
          defaultValue={folderNameFor(folderId)}
          aria-label="Folder name"
          onBlur={(event) => organizationController.renameFolder(surface, folderId, event.target.value)}
        />
        <button type="button" onClick={() => organizationController.deleteFolder(surface, folderId)}>
          Delete
        </button>
      </header>
      <ol className="art-browser-list">
        {(state.folderItems[folderId] || []).map((key) =>
          key.startsWith("folder:") ? renderFolder(folderIdFromKey(key)) : renderCompositionItem(key)
        )}
      </ol>
    </li>
    );
  };

  return (
    <>
      <h3>Compositions</h3>
      <div className="tool-sidebar-switcher" role="group" aria-label="Composition surface">
        <button type="button" aria-pressed={surface === "stage"} onClick={() => onSurfaceChange("stage")}>
          Stage
        </button>
        <button type="button" aria-pressed={surface === "controller"} onClick={() => onSurfaceChange("controller")}>
          Controller
        </button>
      </div>
      <div className="art-browser-search">
        <input
          type="search"
          placeholder="Search assets"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search art assets"
          data-art-hierarchy-search
        />
        {searchQuery ? (
          <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear art asset search">
            Clear
          </button>
        ) : null}
      </div>
      <div className="art-browser-folder-tools">
        <input
          type="text"
          placeholder="Folder name"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            organizationController.createFolder(surface, folderName || "New Folder");
            setFolderName("");
          }}
        >
          Add Folder
        </button>
      </div>
      <div className="art-browser-save-row">
        <button type="button" disabled={!canUndo} onClick={() => organizationController.undo()}>
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => organizationController.redo()}>
          Redo
        </button>
        <button type="button" disabled={!dirty || saving} onClick={() => void organizationController.save()}>
          {saving ? "Saving..." : "Save Folders"}
        </button>
        <span>{dirty ? "Unsaved" : "Saved"}</span>
      </div>
      <ol className="art-browser-list art-browser-root" onDragOver={(event) => event.preventDefault()} onDrop={onDropRoot}>
        {state.order.map((key) => (key.startsWith("folder:") ? renderFolder(folderIdFromKey(key)) : renderCompositionItem(key)))}
        {unfiled.filter((item) => !search.active || search.visibleKeys.has(item.key)).length ? (
          <li className="art-browser-unfiled">
            <small>Unfiled</small>
            <ol className="art-browser-list">
              {unfiled
                .filter((item) => !search.active || search.visibleKeys.has(item.key))
                .map((item) => renderCompositionItem(item.key))}
            </ol>
          </li>
        ) : null}
        {search.active && !search.matchCount ? <li className="art-browser-empty">No matching assets.</li> : null}
      </ol>
    </>
  );
}
