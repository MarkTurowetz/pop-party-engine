import { useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { ArtCompositionsController } from "./artCompositionsController";
import type { ArtOrganizationController } from "./artOrganizationController";
import { searchArtHierarchy } from "./artHierarchySearch";
import { folderIdFromKey, type OrgItem, type OrgSurface } from "./organizationModel";
import { useArtCompositions } from "./useArtCompositions";
import { useArtOrganization } from "./useArtOrganization";
import { artWorkspaceId } from "./artWorkspaceModel";
import { artCompositionCleanupSummary, artCompositionDependencyLabel } from "./artCompositionUsage";

export type ArtBrowserSurface = OrgSurface | "all";

export function allArtCompositionItems(
  compositions: Array<{ id: string; name: string; compositionKind?: string }>
): OrgItem[] {
  return compositions.map((composition) => ({
    key: `composition:${composition.id}`,
    type: "composition",
    name: composition.name,
    compositionKind: String(composition.compositionKind || "gameObject")
  }));
}

export interface ArtCompositionBrowserProps {
  compositionsController: ArtCompositionsController;
  organizationController: ArtOrganizationController;
  surface: ArtBrowserSurface;
  onSurfaceChange(surface: ArtBrowserSurface): void;
}

export const ART_COMPOSITION_BROWSER_DND_TYPE = "application/x-art-composition-browser-key";
const COLLAPSED_STORAGE_KEY = "partyTemplate.artCompositionBrowserCollapsedFolders";

export function compositionIdFromBrowserKey(key: string): string {
  return String(key || "").startsWith("composition:") ? String(key).slice("composition:".length) : "";
}

export interface BrowserCompositionSelection {
  ids: Set<string>;
  primaryId: string;
}

export interface BrowserCompositionSelectionModifiers {
  additive: boolean;
  orderedIds?: Iterable<string>;
  range: boolean;
}

export function browserCompositionSelectionAfterClick(
  currentIds: Iterable<string>,
  primaryId: string,
  clickedId: string,
  modifiers: BrowserCompositionSelectionModifiers
): BrowserCompositionSelection {
  const { additive, range } = modifiers;
  if (range) {
    const orderedIds = [...new Set([...(modifiers.orderedIds || [])].map(String).filter(Boolean))];
    const anchorIndex = orderedIds.indexOf(primaryId);
    const clickedIndex = orderedIds.indexOf(clickedId);
    if (anchorIndex >= 0 && clickedIndex >= 0) {
      const ids = new Set(additive ? currentIds : []);
      const start = Math.min(anchorIndex, clickedIndex);
      const end = Math.max(anchorIndex, clickedIndex);
      for (const id of orderedIds.slice(start, end + 1)) ids.add(id);
      return { ids, primaryId: clickedId };
    }
  }
  if (!additive) return { ids: new Set([clickedId]), primaryId: clickedId };
  const ids = new Set(currentIds);
  if (!ids.has(clickedId)) {
    ids.add(clickedId);
    return { ids, primaryId: clickedId };
  }
  if (ids.size === 1) return { ids, primaryId: clickedId };
  ids.delete(clickedId);
  return {
    ids,
    primaryId: primaryId === clickedId || !ids.has(primaryId) ? [...ids][0] || "" : primaryId
  };
}

export function browserDragKeys(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return [...new Set(parsed.map(String).filter(Boolean))];
  } catch (_error) {
    // Older drags store one plain organizer key.
  }
  return value ? [value] : [];
}

function collapsedKey(surface: ArtBrowserSurface, folderId: string): string {
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
  const {
    compositions,
    workspaces,
    selectedCompositionId,
    trashedCompositionIds,
    dependencyReport,
    saving: savingCompositions
  } = useArtCompositions(compositionsController);
  const { organization, surfaceItems, dirty, saving, canUndo, canRedo } = useArtOrganization(organizationController);
  const [folderName, setFolderName] = useState("");
  const [compositionName, setCompositionName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [compositionSelectionState, setCompositionSelectionState] = useState<{
    surface: ArtBrowserSurface;
    primaryId: string;
    ids: Set<string>;
  }>({ surface, primaryId: "", ids: new Set() });
  const [cleanupMode, setCleanupMode] = useState(false);
  const [cleanupSelection, setCleanupSelection] = useState<Set<string>>(new Set());
  const [reviewTrash, setReviewTrash] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState(readCollapsedFolders);
  const browserListRef = useRef<HTMLOListElement | null>(null);
  const pendingSelectionScrollTopRef = useRef<number | null>(null);
  const organizationSurface = surface === "all" ? null : surface;
  const state = useMemo(
    () => organizationSurface
      ? organization[organizationSurface]
      : { folders: [], order: [], folderItems: {} },
    [organization, organizationSurface]
  );
  const compositionItems = (organizationSurface
    ? surfaceItems[organizationSurface]
    : allArtCompositionItems(compositions))
    .filter((item: OrgItem) => item.type === "composition");
  const activeCompositionItems = compositionItems.filter((item) => !trashedCompositionIds.has(compositionIdFromBrowserKey(item.key)));
  const validCompositionKeys = new Set(activeCompositionItems.map((item) => item.key));
  const nameByKey = new Map(compositionItems.map((item) => [item.key, item.name]));
  const kindByKey = new Map(compositionItems.map((item) => [item.key, item.compositionKind || "gameObject"]));
  const artDocuments = useMemo(() => [...compositions, ...Object.values(workspaces)], [compositions, workspaces]);
  const cleanupSummaryById = useMemo(
    () => new Map(compositions.map((composition) => [
      composition.id,
      artCompositionCleanupSummary(composition.id, artDocuments, dependencyReport[composition.id], trashedCompositionIds)
    ])),
    [artDocuments, compositions, dependencyReport, trashedCompositionIds]
  );
  const search = useMemo(
    () => searchArtHierarchy(state, activeCompositionItems, searchQuery),
    [state, activeCompositionItems, searchQuery]
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
  const unfiled = activeCompositionItems.filter((item) => !placed.has(item.key));
  const compositionSelection = compositionSelectionState.surface === surface && compositionSelectionState.primaryId === selectedCompositionId
    ? compositionSelectionState.ids
    : surface !== "all" && selectedCompositionId === artWorkspaceId(surface)
      ? new Set<string>()
      : new Set([selectedCompositionId]);

  const visualCompositionKeys = (() => {
    const keys: string[] = [];
    const visitedFolders = new Set<string>();
    const visit = (key: string) => {
      if (validCompositionKeys.has(key)) {
        keys.push(key);
        return;
      }
      const folderId = folderIdFromKey(key);
      if (!folderId || visitedFolders.has(folderId)) return;
      visitedFolders.add(folderId);
      for (const childKey of state.folderItems[folderId] || []) visit(childKey);
    };
    for (const key of state.order) visit(key);
    for (const item of unfiled) if (!keys.includes(item.key)) keys.push(item.key);
    return keys;
  })();

  const folderIsCollapsed = (folderId: string): boolean => search.active
    ? !search.expandedFolderIds.has(folderId)
    : collapsedFolders.has(collapsedKey(surface, folderId));
  const selectableCompositionIds = (() => {
    const ids: string[] = [];
    const visitedFolders = new Set<string>();
    const visit = (key: string) => {
      if (validCompositionKeys.has(key)) {
        if (!search.active || search.visibleKeys.has(key)) ids.push(compositionIdFromBrowserKey(key));
        return;
      }
      const folderId = folderIdFromKey(key);
      if (!folderId || visitedFolders.has(folderId) || folderIsCollapsed(folderId)) return;
      if (search.active && !search.visibleKeys.has(`folder:${folderId}`)) return;
      visitedFolders.add(folderId);
      for (const childKey of state.folderItems[folderId] || []) visit(childKey);
    };
    for (const key of state.order) visit(key);
    for (const item of unfiled) {
      if (!search.active || search.visibleKeys.has(item.key)) ids.push(compositionIdFromBrowserKey(item.key));
    }
    return ids.filter(Boolean);
  })();

  useLayoutEffect(() => {
    const scrollTop = pendingSelectionScrollTopRef.current;
    const list = browserListRef.current;
    if (scrollTop === null || !list) return;
    const restoreScrollPosition = () => {
      list.scrollTop = Math.min(scrollTop, Math.max(0, list.scrollHeight - list.clientHeight));
    };
    restoreScrollPosition();
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        restoreScrollPosition();
        pendingSelectionScrollTopRef.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [compositionSelectionState, selectedCompositionId]);

  const selectedCompositionKeys = () => visualCompositionKeys.filter((key) => compositionSelection.has(compositionIdFromBrowserKey(key)));
  const selectCompositionFromClick = (event: MouseEvent<HTMLButtonElement>, compositionId: string): void => {
    pendingSelectionScrollTopRef.current = browserListRef.current?.scrollTop ?? null;
    const next = browserCompositionSelectionAfterClick(
      compositionSelection,
      selectedCompositionId,
      compositionId,
      {
        additive: event.metaKey || event.ctrlKey,
        orderedIds: selectableCompositionIds,
        range: event.shiftKey
      }
    );
    setCompositionSelectionState({ surface, primaryId: next.primaryId, ids: next.ids });
    if (next.primaryId && next.primaryId !== selectedCompositionId) compositionsController.selectComposition(next.primaryId);
    browserListRef.current?.focus({ preventScroll: true });
  };
  const moveCompositionIdsToTrash = (compositionIds: Iterable<string>): void => {
    const ids = [...new Set([...compositionIds].map(String).filter(Boolean))];
    if (!ids.length) return;
    compositionsController.trashCompositions(ids);
    setCompositionSelectionState(ids.includes(selectedCompositionId)
      ? { surface, primaryId: "", ids: new Set() }
      : { surface, primaryId: selectedCompositionId, ids: new Set([selectedCompositionId]) });
  };
  const deleteCompositionSelectionFromKey = (event: KeyboardEvent<HTMLOListElement>): void => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.preventDefault();
    moveCompositionIdsToTrash(compositionSelection);
  };

  const onDragStart = (event: DragEvent, key: string) => {
    event.stopPropagation();
    const compositionId = compositionIdFromBrowserKey(key);
    let draggedKeys = [key];
    if (compositionId) {
      if (compositionSelection.has(compositionId)) draggedKeys = selectedCompositionKeys();
      else {
        setCompositionSelectionState({ surface, primaryId: compositionId, ids: new Set([compositionId]) });
        compositionsController.selectComposition(compositionId);
      }
    }
    event.dataTransfer.setData(ART_COMPOSITION_BROWSER_DND_TYPE, JSON.stringify(draggedKeys));
  };
  const dragKeys = (event: DragEvent) => browserDragKeys(event.dataTransfer.getData(ART_COMPOSITION_BROWSER_DND_TYPE));
  const onDropBeside = (event: DragEvent, targetKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!organizationSurface) return;
    const dragged = dragKeys(event);
    if (dragged.length) organizationController.moveManyBeside(organizationSurface, dragged, targetKey, false);
  };
  const onDropIntoFolder = (event: DragEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!organizationSurface) return;
    const dragged = dragKeys(event);
    if (dragged.length) organizationController.moveManyIntoFolder(organizationSurface, dragged, folderId);
  };
  const onDropRoot = (event: DragEvent) => {
    event.preventDefault();
    if (!organizationSurface) return;
    const dragged = dragKeys(event);
    if (dragged.length) organizationController.moveManyIntoFolder(organizationSurface, dragged, "");
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
  const createComposition = (kind: "gameObject" | "prefab") => {
    if (!organizationSurface) return;
    compositionsController.createComposition(kind, organizationSurface, compositionName);
    setCompositionName("");
  };
  const toggleCleanupSelection = (compositionId: string): void => {
    setCleanupSelection((current) => {
      const next = new Set(current);
      if (next.has(compositionId)) next.delete(compositionId);
      else next.add(compositionId);
      return next;
    });
  };
  const surfaceCompositionIds = activeCompositionItems.map((item) => compositionIdFromBrowserKey(item.key)).filter(Boolean);
  const unusedSurfaceCompositionIds = surfaceCompositionIds.filter((id) => cleanupSummaryById.get(id)?.total === 0);
  const trashedCompositions = compositions.filter((composition) => trashedCompositionIds.has(composition.id));
  const blockedTrashedCompositions = trashedCompositions.filter((composition) => (cleanupSummaryById.get(composition.id)?.total || 0) > 0);
  const moveCleanupSelectionToTrash = (): void => {
    compositionsController.trashCompositions(cleanupSelection);
    setCleanupSelection(new Set());
  };

  const renderCompositionItem = (key: string) => {
    const compositionId = compositionIdFromBrowserKey(key);
    if (!compositionId || !validCompositionKeys.has(key)) return null;
    if (search.active && !search.visibleKeys.has(key)) return null;
    const usage = cleanupSummaryById.get(compositionId) || artCompositionCleanupSummary(compositionId, artDocuments, undefined);
    const dependencyTitle = [
      `Art: ${usage.artReferences}`,
      `Stage Layout: ${usage.stageLayoutReferences}`,
      `Controller Layout: ${usage.controllerLayoutReferences}`,
      `Flow: ${usage.flowReferences}`,
      `Runtime: ${usage.runtimeReferences}`
    ].join(" · ");
    const deleteCompositionFromKey = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      event.stopPropagation();
      moveCompositionIdsToTrash(compositionSelection.has(compositionId) ? compositionSelection : [compositionId]);
    };
    const selected = compositionSelection.has(compositionId);
    return (
      <li
        className={`art-browser-item${cleanupMode ? " is-cleanup-mode" : ""}${selected ? " is-selected" : ""}`}
        data-art-browser-composition={compositionId}
        data-art-browser-selected={selected ? "true" : "false"}
        key={key}
        draggable={Boolean(organizationSurface)}
        onDragStart={(event) => onDragStart(event, key)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDropBeside(event, key)}
      >
        {cleanupMode ? (
          <input
            type="checkbox"
            checked={cleanupSelection.has(compositionId)}
            aria-label={`Select ${nameByKey.get(key) || compositionId} for cleanup`}
            onChange={() => toggleCleanupSelection(compositionId)}
          />
        ) : null}
        <button
          type="button"
          aria-current={compositionId === selectedCompositionId ? "true" : undefined}
          aria-pressed={selected}
          title="Select composition. Command-click adds or removes it; Shift-click selects a range. Option+Command+D duplicates the active composition."
          onClick={(event) => selectCompositionFromClick(event, compositionId)}
          onKeyDown={deleteCompositionFromKey}
        >
          <span>{nameByKey.get(key) || compositionId}</span>
          <span className="art-browser-item-meta">
            <small>{kindByKey.get(key) === "prefab" ? "Prefab" : "Game Object"}</small>
            <small
              className="art-browser-composition-usage"
              data-art-composition-usage={usage.total}
              data-art-composition-unused={usage.total === 0 ? "true" : "false"}
              title={dependencyTitle}
            >
              {artCompositionDependencyLabel(usage)}
            </small>
          </span>
        </button>
        {!cleanupMode ? <button
          type="button"
          className="art-browser-composition-delete"
          aria-label={`Move ${nameByKey.get(key) || compositionId} to Trash`}
          title="Move composition to Trash"
          onClick={(event) => {
            event.stopPropagation();
            moveCompositionIdsToTrash(compositionSelection.has(compositionId) ? compositionSelection : [compositionId]);
          }}
        >
          Trash
        </button> : null}
      </li>
    );
  };

  const renderFolder = (folderId: string) => {
    if (search.active && !search.visibleKeys.has(`folder:${folderId}`)) return null;
    const collapsed = folderIsCollapsed(folderId);
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
          onBlur={(event) => organizationSurface && organizationController.renameFolder(organizationSurface, folderId, event.target.value)}
        />
        <button type="button" onClick={() => organizationSurface && organizationController.deleteFolder(organizationSurface, folderId)}>
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
      {surface === "all" ? (
        <div className="art-browser-stage-button" data-art-all-assets>
          <span>All Assets</span>
          <small>Shared Library</small>
        </div>
      ) : (
        <button
          type="button"
          className="art-browser-stage-button"
          aria-current={selectedCompositionId === artWorkspaceId(surface) ? "true" : undefined}
          onClick={() => {
            setCompositionSelectionState({ surface, primaryId: artWorkspaceId(surface), ids: new Set() });
            compositionsController.selectWorkspace(surface);
          }}
        >
          <span>{surface === "controller" ? "Controller Stage" : "Stage"}</span>
          <small>Workspace</small>
        </button>
      )}
      <div className="tool-sidebar-switcher" role="group" aria-label="Composition surface">
        <button type="button" aria-pressed={surface === "stage"} onClick={() => {
          setCompositionSelectionState({ surface: "stage", primaryId: artWorkspaceId("stage"), ids: new Set() });
          onSurfaceChange("stage");
          compositionsController.selectWorkspace("stage");
        }}>
          Stage
        </button>
        <button type="button" aria-pressed={surface === "controller"} onClick={() => {
          setCompositionSelectionState({ surface: "controller", primaryId: artWorkspaceId("controller"), ids: new Set() });
          onSurfaceChange("controller");
          compositionsController.selectWorkspace("controller");
        }}>
          Controller
        </button>
        <button type="button" aria-pressed={surface === "all"} onClick={() => {
          const selectedIsComposition = compositions.some((composition) => composition.id === selectedCompositionId);
          setCompositionSelectionState({
            surface: "all",
            primaryId: selectedIsComposition ? selectedCompositionId : "",
            ids: new Set(selectedIsComposition ? [selectedCompositionId] : [])
          });
          onSurfaceChange("all");
        }}>
          All
        </button>
      </div>
      <div className="art-browser-cleanup-tools">
        <button type="button" aria-pressed={cleanupMode} onClick={() => {
          setCleanupMode((current) => !current);
          setCleanupSelection(new Set());
        }}>
          {cleanupMode ? "Exit Cleanup" : "Cleanup Mode"}
        </button>
        {cleanupMode ? (
          <>
            <button type="button" disabled={!unusedSurfaceCompositionIds.length} onClick={() => setCleanupSelection(new Set(unusedSurfaceCompositionIds))}>
              Select Unused
            </button>
            <button type="button" disabled={!cleanupSelection.size} onClick={moveCleanupSelectionToTrash}>
              Move {cleanupSelection.size || ""} to Trash
            </button>
          </>
        ) : null}
        {trashedCompositions.length ? (
          <button type="button" data-art-review-trash onClick={() => setReviewTrash(true)}>
            Review Trash ({trashedCompositions.length})
          </button>
        ) : null}
      </div>
      {trashedCompositions.length ? (
        <section className="art-browser-trash" aria-label="Art Trash">
          <strong>Trash</strong>
          <small>Pending until reviewed and permanently deleted.</small>
          <ol>
            {trashedCompositions.map((composition) => (
              <li key={composition.id}>
                <span>{composition.name}</span>
                <small>{artCompositionDependencyLabel(cleanupSummaryById.get(composition.id) || artCompositionCleanupSummary(composition.id, artDocuments, undefined))}</small>
                <button type="button" onClick={() => compositionsController.restoreTrashedComposition(composition.id)}>Restore</button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
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
      {organizationSurface ? <div className="art-browser-create-tools">
        <input
          type="text"
          placeholder="New asset name"
          value={compositionName}
          onChange={(event) => setCompositionName(event.target.value)}
          aria-label="New art asset name"
        />
        <button type="button" onClick={() => createComposition("gameObject")}>
          Add Game Object
        </button>
        <button type="button" onClick={() => createComposition("prefab")}>
          Add Prefab
        </button>
      </div> : null}
      {organizationSurface ? <div className="art-browser-folder-tools">
        <input
          type="text"
          placeholder="Folder name"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            organizationController.createFolder(organizationSurface, folderName || "New Folder");
            setFolderName("");
          }}
        >
          Add Folder
        </button>
      </div> : null}
      {organizationSurface ? <div className="art-browser-save-row">
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
      </div> : null}
      <ol
        ref={browserListRef}
        className="art-browser-list art-browser-root"
        tabIndex={-1}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDropRoot}
        onKeyDown={deleteCompositionSelectionFromKey}
      >
        {state.order.map((key) => (key.startsWith("folder:") ? renderFolder(folderIdFromKey(key)) : renderCompositionItem(key)))}
        {unfiled.filter((item) => !search.active || search.visibleKeys.has(item.key)).length ? (
          <li className="art-browser-unfiled">
            <small>{surface === "all" ? "All Assets" : "Unfiled"}</small>
            <ol className="art-browser-list">
              {unfiled
                .filter((item) => !search.active || search.visibleKeys.has(item.key))
                .map((item) => renderCompositionItem(item.key))}
            </ol>
          </li>
        ) : null}
        {search.active && !search.matchCount ? <li className="art-browser-empty">No matching assets.</li> : null}
      </ol>
      {reviewTrash ? (
        <div className="art-prefab-dialog-backdrop" role="presentation" onMouseDown={() => setReviewTrash(false)}>
          <section
            className="flow-react-panel art-prefab-dialog art-trash-review-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Review trashed art assets"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3>Review Trash</h3>
            <p>{trashedCompositions.length} {trashedCompositions.length === 1 ? "asset is" : "assets are"} staged for permanent deletion.</p>
            <ol>
              {trashedCompositions.map((composition) => {
                const summary = cleanupSummaryById.get(composition.id) || artCompositionCleanupSummary(composition.id, artDocuments, undefined);
                return (
                  <li key={composition.id} data-art-trash-blocked={summary.total ? "true" : "false"}>
                    <strong>{composition.name}</strong>
                    <span>{artCompositionDependencyLabel(summary)}</span>
                    {summary.details.map((detail, index) => (
                      <small key={`${composition.id}-${detail.kind}-${index}`}>
                        {detail.kind}: {detail.sourceName || detail.sourcePath || detail.sourceId || detail.sourceCompositionId || "Referenced"}
                      </small>
                    ))}
                  </li>
                );
              })}
            </ol>
            {blockedTrashedCompositions.length ? (
              <p role="alert">Remove the listed references before deleting these assets.</p>
            ) : (
              <p>This permanently updates the Art Manifest in one atomic operation.</p>
            )}
            <div className="flow-editor-controls">
              <button type="button" onClick={() => setReviewTrash(false)}>Cancel</button>
              <button
                type="button"
                disabled={Boolean(blockedTrashedCompositions.length) || savingCompositions}
                onClick={() => void compositionsController.save({ commitTrash: true }).then((saved) => {
                  if (saved) setReviewTrash(false);
                })}
              >
                {savingCompositions ? "Deleting..." : `Delete ${trashedCompositions.length} Permanently`}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
