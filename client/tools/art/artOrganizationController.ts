import type { ArtApi } from "../../api/artApi";
import type { ArtAsset, ArtComposition, ArtOrganization, JsonObject } from "../../types/game-data";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";
import { requestLivePrototypeSave } from "../common/livePrototypeWorkspace";
import {
  cleanOrganizationForSave,
  folderIdFromKey,
  folderKey,
  normalizeOrganization,
  organizationSnapshot,
  removeKeyFromSurface,
  surfaceItems,
  type OrgItem,
  type OrgSurface
} from "./organizationModel";

export interface ArtOrganizationEditorState {
  organization: ArtOrganization;
  surfaceItems: Record<OrgSurface, OrgItem[]>;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
}

export interface ArtOrganizationControllerOptions {
  initialOrganization: ArtOrganization;
  compositions: ArtComposition[];
  assets: ArtAsset[];
  api: ArtApi;
  postDraft?: (message: JsonObject) => Promise<unknown>;
  draftPublishDelayMs?: number;
}

export interface ArtOrganizationController {
  getState(): ArtOrganizationEditorState;
  subscribe(listener: () => void): () => void;
  setSourceItems(compositions: ArtComposition[], assets?: ArtAsset[]): void;
  createFolder(surface: OrgSurface, name: string): void;
  renameFolder(surface: OrgSurface, folderId: string, name: string): void;
  deleteFolder(surface: OrgSurface, folderId: string): void;
  /** Drop `draggedKey` before/after `targetKey` (in the target's parent list). */
  moveBeside(surface: OrgSurface, draggedKey: string, targetKey: string, placeAfter: boolean): void;
  /** Drop multiple keys before/after `targetKey` as one ordered group. */
  moveManyBeside(surface: OrgSurface, draggedKeys: Iterable<string>, targetKey: string, placeAfter: boolean): void;
  /** Drop `draggedKey` into a folder (or root if folderId is ""). */
  moveIntoFolder(surface: OrgSurface, draggedKey: string, folderId: string): void;
  /** Drop multiple keys into a folder (or root) as one ordered group. */
  moveManyIntoFolder(surface: OrgSurface, draggedKeys: Iterable<string>, folderId: string): void;
  undo(): void;
  redo(): void;
  acceptWorkspaceSave(): void;
  save(): Promise<boolean>;
}

function makeFolderId(): string {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  const token = cryptoObj?.randomUUID ? cryptoObj.randomUUID().replace(/-/g, "").slice(0, 10) : Math.random().toString(36).slice(2, 12);
  return `folder-${token}`;
}

export function createArtOrganizationController(
  options: ArtOrganizationControllerOptions
): ArtOrganizationController {
  const { api } = options;
  let sourceCompositions = options.compositions || [];
  let sourceAssets = options.assets || [];
  let items = buildSurfaceItems(sourceCompositions, sourceAssets);
  const listeners = new Set<() => void>();
  let organization = normalizeOrganization(options.initialOrganization);
  let savedSnapshot = organizationSnapshot(organization, items);
  const sessionDraftPublisher = options.postDraft
    ? createSessionDraftPublisher({
        postDraft: options.postDraft,
        savedSnapshot,
        delayMs: options.draftPublishDelayMs,
        clearMessage: { clearArtOrganization: true },
        draftMessage: (snapshot) => ({ artOrganization: JSON.parse(snapshot) as ArtOrganization })
      })
    : null;
  const undoStack: ArtOrganization[] = [];
  const redoStack: ArtOrganization[] = [];
  let saving = false;
  let error: string | null = null;
  let cachedState = buildState();

  function buildState(): ArtOrganizationEditorState {
    return {
      organization,
      surfaceItems: items,
      dirty: organizationSnapshot(organization, items) !== savedSnapshot,
      saving,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      error
    };
  }

  function buildSurfaceItems(compositions: ArtComposition[], assets: ArtAsset[]): Record<OrgSurface, OrgItem[]> {
    return {
      stage: surfaceItems(compositions, assets, "stage"),
      controller: surfaceItems(compositions, assets, "controller")
    };
  }

  function emit(): void {
    cachedState = buildState();
    listeners.forEach((listener) => listener());
  }

  function scheduleDraft(): void {
    sessionDraftPublisher?.schedule(organizationSnapshot(organization, items));
  }

  function mutate(apply: (org: ArtOrganization) => void): void {
    undoStack.push(JSON.parse(JSON.stringify(organization)) as ArtOrganization);
    redoStack.length = 0;
    const draft = JSON.parse(JSON.stringify(organization)) as ArtOrganization;
    apply(draft);
    organization = normalizeOrganization(draft);
    emit();
    scheduleDraft();
  }

  return {
    getState: () => cachedState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setSourceItems: (compositions, assets = sourceAssets) => {
      sourceCompositions = compositions || [];
      sourceAssets = assets || [];
      items = buildSurfaceItems(sourceCompositions, sourceAssets);
      emit();
    },

    createFolder: (surface, name) =>
      mutate((org) => {
        const id = makeFolderId();
        org[surface].folders = [...org[surface].folders, { id, name: name.trim() || "New Folder" }];
        org[surface].folderItems[id] = org[surface].folderItems[id] || [];
        org[surface].order = [...org[surface].order, folderKey(id)];
      }),
    renameFolder: (surface, folderId, name) =>
      mutate((org) => {
        org[surface].folders = org[surface].folders.map((folder) =>
          folder.id === folderId ? { ...folder, name: name.trim() || folder.name } : folder
        );
      }),
    deleteFolder: (surface, folderId) =>
      mutate((org) => {
        const state = org[surface];
        // Move the folder's items up to root order, then drop the folder.
        const orphans = state.folderItems[folderId] || [];
        removeKeyFromSurface(state, folderKey(folderId));
        delete state.folderItems[folderId];
        state.folders = state.folders.filter((folder) => folder.id !== folderId);
        state.order = [...state.order, ...orphans.filter((key) => key !== folderKey(folderId))];
      }),
    moveBeside: (surface, draggedKey, targetKey, placeAfter) =>
      mutate((org) => {
        if (draggedKey === targetKey) return;
        const state = org[surface];
        const targetFolderId = Object.keys(state.folderItems).find((id) =>
          (state.folderItems[id] || []).includes(targetKey)
        );
        removeKeyFromSurface(state, draggedKey);
        const list = targetFolderId ? state.folderItems[targetFolderId] : state.order;
        const targetIndex = list.indexOf(targetKey);
        list.splice(Math.max(0, targetIndex + (placeAfter ? 1 : 0)), 0, draggedKey);
      }),
    moveManyBeside: (surface, draggedKeys, targetKey, placeAfter) => {
      const keys = [...new Set([...draggedKeys].map(String).filter(Boolean))];
      if (!keys.length || keys.includes(targetKey)) return;
      mutate((org) => {
        const state = org[surface];
        const targetFolderId = Object.keys(state.folderItems).find((id) =>
          (state.folderItems[id] || []).includes(targetKey)
        );
        for (const key of keys) removeKeyFromSurface(state, key);
        const list = targetFolderId ? state.folderItems[targetFolderId] : state.order;
        const targetIndex = list.indexOf(targetKey);
        list.splice(Math.max(0, targetIndex + (placeAfter ? 1 : 0)), 0, ...keys);
      });
    },
    moveIntoFolder: (surface, draggedKey, folderId) =>
      mutate((org) => {
        const state = org[surface];
        const draggedFolderId = folderIdFromKey(draggedKey);
        if (draggedFolderId && draggedFolderId === folderId) return; // can't drop a folder into itself
        removeKeyFromSurface(state, draggedKey);
        if (folderId) {
          state.folderItems[folderId] = state.folderItems[folderId] || [];
          state.folderItems[folderId].push(draggedKey);
        } else {
          state.order.push(draggedKey);
        }
      }),
    moveManyIntoFolder: (surface, draggedKeys, folderId) => {
      const keys = [...new Set([...draggedKeys].map(String).filter(Boolean))];
      if (!keys.length) return;
      mutate((org) => {
        const state = org[surface];
        const safeKeys = keys.filter((key) => {
          const draggedFolderId = folderIdFromKey(key);
          return !draggedFolderId || draggedFolderId !== folderId;
        });
        for (const key of safeKeys) removeKeyFromSurface(state, key);
        if (folderId) {
          state.folderItems[folderId] = state.folderItems[folderId] || [];
          state.folderItems[folderId].push(...safeKeys);
        } else {
          state.order.push(...safeKeys);
        }
      });
    },

    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(JSON.parse(JSON.stringify(organization)) as ArtOrganization);
      organization = previous;
      emit();
      scheduleDraft();
    },
    redo: () => {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(JSON.parse(JSON.stringify(organization)) as ArtOrganization);
      organization = next;
      emit();
      scheduleDraft();
    },
    acceptWorkspaceSave: () => {
      savedSnapshot = organizationSnapshot(organization, items);
      sessionDraftPublisher?.markSaved(savedSnapshot);
      error = null;
      emit();
    },
    save: async () => {
      if (requestLivePrototypeSave()) return true;
      saving = true;
      error = null;
      emit();
      try {
        const payload = cleanOrganizationForSave(organization, items);
        const response = await api.saveArtOrganization(payload);
        organization = normalizeOrganization(response.organization || payload);
        savedSnapshot = organizationSnapshot(organization, items);
        sessionDraftPublisher?.markSaved(savedSnapshot);
        saving = false;
        emit();
        return true;
      } catch (caught) {
        saving = false;
        error = caught instanceof Error ? caught.message : String(caught);
        emit();
        return false;
      }
    }
  };
}
