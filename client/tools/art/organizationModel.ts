import type { ArtAsset, ArtComposition, ArtOrganization, ArtOrganizationSurface } from "../../types/game-data";
import { normalizeArtCompositionSurface } from "./artCompositionModel";

/**
 * Typed port of the legacy art-organization key model + cleanArtOrganizationForSave.
 * Keys: `composition:{id}`, `asset:{id}`, `folder:{id}`. Each surface (stage/
 * controller) has folders, a top-level `order`, and `folderItems` per folder.
 */
export type OrgSurface = "stage" | "controller";

export interface OrgItem {
  key: string;
  type: "composition" | "asset";
  name: string;
}

export function itemKey(item: { id: string; currentUrl?: unknown }): string {
  if ((item as { currentUrl?: unknown }).currentUrl !== undefined) return `asset:${item.id}`;
  return `composition:${item.id}`;
}

export function folderKey(folderId: string): string {
  return `folder:${folderId}`;
}

export function folderIdFromKey(key: string): string {
  return String(key || "").startsWith("folder:") ? String(key).slice(7) : "";
}

export function isOrganizerKey(key: string): boolean {
  const value = String(key || "");
  return value.startsWith("composition:") || value.startsWith("asset:") || value.startsWith("folder:");
}

function isSharedComposition(composition: ArtComposition): boolean {
  return composition.surface === "shared" || composition.id === "layout-text-field";
}

export function emptyOrganization(): ArtOrganization {
  return {
    stage: { folders: [], order: [], folderItems: {} },
    controller: { folders: [], order: [], folderItems: {} }
  };
}

export function normalizeOrganization(source: Partial<ArtOrganization> | null | undefined): ArtOrganization {
  const surface = (input: Partial<ArtOrganizationSurface> | undefined): ArtOrganizationSurface => ({
    folders: Array.isArray(input?.folders) ? input!.folders : [],
    order: Array.isArray(input?.order) ? input!.order : [],
    folderItems: input?.folderItems && typeof input.folderItems === "object" ? input.folderItems : {}
  });
  return { stage: surface(source?.stage), controller: surface(source?.controller) };
}

/** Compositions (+ stage assets) that belong to a surface, as organizer items. */
export function surfaceItems(
  compositions: ArtComposition[],
  assets: ArtAsset[],
  surface: OrgSurface
): OrgItem[] {
  const normalized = normalizeArtCompositionSurface(surface);
  const items: OrgItem[] = compositions
    .filter((composition) => isSharedComposition(composition) || normalizeArtCompositionSurface(composition.surface) === normalized)
    .map((composition) => ({ key: itemKey(composition), type: "composition" as const, name: composition.name }));
  if (normalized === "stage") {
    for (const asset of assets || []) {
      if (asset.parent && ["player-avatar", "presentation-click-prompt"].includes(String(asset.parent))) continue;
      items.push({ key: itemKey(asset), type: "asset", name: asset.name });
    }
  }
  return items;
}

export function removeKeyFromSurface(state: ArtOrganizationSurface, key: string): void {
  state.order = (state.order || []).filter((item) => item !== key);
  for (const folderId of Object.keys(state.folderItems || {})) {
    state.folderItems[folderId] = (state.folderItems[folderId] || []).filter((item) => item !== key);
  }
}

function folderContainsFolder(state: ArtOrganizationSurface, folderId: string, candidateAncestorId: string): boolean {
  // Does `candidateAncestorId` (a folder) contain `folderId` somewhere below it?
  const children = state.folderItems?.[candidateAncestorId] || [];
  for (const key of children) {
    const childFolderId = folderIdFromKey(key);
    if (!childFolderId) continue;
    if (childFolderId === folderId) return true;
    if (folderContainsFolder(state, folderId, childFolderId)) return true;
  }
  return false;
}

/** Validate + dedupe the organization against the live items (legacy cleanArtOrganizationForSave). */
export function cleanOrganizationForSave(
  organization: ArtOrganization,
  itemsBySurface: Record<OrgSurface, OrgItem[]>
): ArtOrganization {
  const cleaned = emptyOrganization();
  for (const surface of ["stage", "controller"] as OrgSurface[]) {
    const state = normalizeOrganization(organization)[surface];
    const validItems = new Set(itemsBySurface[surface].map((entry) => entry.key));
    const seenFolders = new Set<string>();
    cleaned[surface].folders = (state.folders || [])
      .map((folder) => ({ id: String(folder.id || ""), name: String(folder.name || "Folder").trim() || "Folder" }))
      .filter((folder) => {
        if (!folder.id || seenFolders.has(folder.id)) return false;
        seenFolders.add(folder.id);
        return true;
      });
    const validFolderKeys = new Set(cleaned[surface].folders.map((folder) => folderKey(folder.id)));
    const validTopKeys = new Set([...validItems, ...validFolderKeys]);
    cleaned[surface].order = [...new Set(state.order || [])].filter((key) => validTopKeys.has(key));
    for (const folder of cleaned[surface].folders) {
      cleaned[surface].folderItems[folder.id] = [...new Set(state.folderItems?.[folder.id] || [])].filter((key) => {
        if (validItems.has(key)) return true;
        if (!validFolderKeys.has(key)) return false;
        return folderIdFromKey(key) !== folder.id;
      });
    }
    for (const folder of cleaned[surface].folders) {
      cleaned[surface].folderItems[folder.id] = cleaned[surface].folderItems[folder.id].filter((key) => {
        const nestedFolderId = folderIdFromKey(key);
        return !nestedFolderId || !folderContainsFolder(cleaned[surface], nestedFolderId, folder.id);
      });
    }
  }
  return cleaned;
}

export function organizationSnapshot(
  organization: ArtOrganization,
  itemsBySurface: Record<OrgSurface, OrgItem[]>
): string {
  return JSON.stringify(cleanOrganizationForSave(organization, itemsBySurface));
}
