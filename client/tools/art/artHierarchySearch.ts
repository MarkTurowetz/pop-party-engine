import type { ArtOrganizationSurface } from "../../types/game-data";
import { folderIdFromKey, folderKey, type OrgItem } from "./organizationModel";

export interface ArtHierarchySearchResult {
  active: boolean;
  visibleKeys: Set<string>;
  expandedFolderIds: Set<string>;
  matchCount: number;
}

function compactSearchText(value: string): string {
  return normalizeArtHierarchySearchQuery(value).replace(/\s+/g, "");
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor += 1;
    if (cursor >= needle.length) return true;
  }
  return false;
}

export function normalizeArtHierarchySearchQuery(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function fuzzyMatchesArtHierarchyText(text: unknown, query: unknown): boolean {
  const normalizedQuery = normalizeArtHierarchySearchQuery(query);
  if (!normalizedQuery) return true;

  const normalizedText = normalizeArtHierarchySearchQuery(text);
  if (!normalizedText) return false;
  if (normalizedText.includes(normalizedQuery)) return true;

  const compactText = compactSearchText(normalizedText);
  return normalizedQuery
    .split(" ")
    .every((token) => compactText.includes(token) || isSubsequence(token, compactText));
}

function keyMatches(key: string, label: string, query: string): boolean {
  return fuzzyMatchesArtHierarchyText(label, query) || fuzzyMatchesArtHierarchyText(key, query);
}

export function searchArtHierarchy(
  state: ArtOrganizationSurface,
  items: OrgItem[],
  query: unknown
): ArtHierarchySearchResult {
  const normalizedQuery = normalizeArtHierarchySearchQuery(query);
  const visibleKeys = new Set<string>();
  const expandedFolderIds = new Set<string>();
  const matchedKeys = new Set<string>();
  const itemNames = new Map(items.map((item) => [item.key, item.name]));
  const folderNames = new Map((state.folders || []).map((folder) => [folder.id, folder.name]));

  if (!normalizedQuery) {
    return { active: false, visibleKeys, expandedFolderIds, matchCount: 0 };
  }

  const includeSubtree = (key: string): void => {
    visibleKeys.add(key);
    const folderId = folderIdFromKey(key);
    if (!folderId) return;
    expandedFolderIds.add(folderId);
    for (const childKey of state.folderItems?.[folderId] || []) includeSubtree(childKey);
  };

  const visitKey = (key: string): boolean => {
    const folderId = folderIdFromKey(key);
    if (folderId) return visitFolder(folderId);

    const matched = keyMatches(key, itemNames.get(key) || "", normalizedQuery);
    if (matched) {
      visibleKeys.add(key);
      matchedKeys.add(key);
    }
    return matched;
  };

  const visitFolder = (folderId: string): boolean => {
    const key = folderKey(folderId);
    const matched = keyMatches(key, folderNames.get(folderId) || "", normalizedQuery);
    if (matched) {
      includeSubtree(key);
      matchedKeys.add(key);
      return true;
    }

    let childMatched = false;
    for (const childKey of state.folderItems?.[folderId] || []) {
      if (visitKey(childKey)) childMatched = true;
    }
    if (childMatched) {
      visibleKeys.add(key);
      expandedFolderIds.add(folderId);
    }
    return childMatched;
  };

  for (const key of state.order || []) visitKey(key);
  for (const item of items) {
    if (!visibleKeys.has(item.key) && keyMatches(item.key, item.name, normalizedQuery)) {
      visibleKeys.add(item.key);
      matchedKeys.add(item.key);
    }
  }

  return { active: true, visibleKeys, expandedFolderIds, matchCount: matchedKeys.size };
}
