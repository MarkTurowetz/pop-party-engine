"use strict";

const surfaces = Object.freeze(["stage", "controller"]);

function cleanId(value, fallback = "") {
  const text = String(value || fallback || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(text) ? text : fallback;
}

function cleanText(value, fallback = "", maxLength = 120) {
  const text = String(value ?? fallback ?? "").trim();
  return text.slice(0, maxLength);
}

function normalizeOrganizationItemKey(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^(asset|composition):([a-z0-9][a-z0-9_-]{0,79})$/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function normalizeOrganizationKey(value, folderIds = new Set()) {
  const text = String(value || "").trim().toLowerCase();
  const itemKey = normalizeOrganizationItemKey(text);
  if (itemKey) return itemKey;
  if (!text.startsWith("folder:")) return "";
  const folderId = cleanId(text.slice(7));
  return folderId && folderIds.has(folderId) ? `folder:${folderId}` : "";
}

function folderContainsFolder(folderItems, folderId, descendantId, visited = new Set()) {
  if (!folderId || !descendantId || visited.has(folderId)) return false;
  visited.add(folderId);
  for (const key of folderItems[folderId] || []) {
    if (!String(key).startsWith("folder:")) continue;
    const childId = String(key).slice(7);
    if (childId === descendantId || folderContainsFolder(folderItems, childId, descendantId, visited)) return true;
  }
  return false;
}

function normalizeArtOrganization(source = {}) {
  const result = {};
  for (const surface of surfaces) {
    const incoming = source?.[surface] && typeof source[surface] === "object" ? source[surface] : {};
    const folders = [];
    const seenFolders = new Set();
    for (const folder of Array.isArray(incoming.folders) ? incoming.folders : []) {
      const id = cleanId(folder?.id);
      if (!id || seenFolders.has(id)) continue;
      folders.push({ id, name: cleanText(folder?.name, "Folder", 80) || "Folder" });
      seenFolders.add(id);
    }
    const folderIds = new Set(folders.map((folder) => folder.id));
    const order = [];
    const seenOrder = new Set();
    for (const rawKey of Array.isArray(incoming.order) ? incoming.order : []) {
      const key = normalizeOrganizationKey(rawKey, folderIds);
      if (!key || seenOrder.has(key)) continue;
      order.push(key);
      seenOrder.add(key);
    }
    const folderItems = {};
    const incomingFolderItems = incoming.folderItems && typeof incoming.folderItems === "object" ? incoming.folderItems : {};
    for (const folderId of folderIds) {
      const items = [];
      const seenItems = new Set();
      for (const rawKey of Array.isArray(incomingFolderItems[folderId]) ? incomingFolderItems[folderId] : []) {
        const key = normalizeOrganizationKey(rawKey, folderIds);
        if (!key || seenItems.has(key) || key === `folder:${folderId}`) continue;
        items.push(key);
        seenItems.add(key);
      }
      folderItems[folderId] = items;
    }
    for (const folderId of folderIds) {
      folderItems[folderId] = (folderItems[folderId] || []).filter((key) => {
        if (!String(key).startsWith("folder:")) return true;
        return !folderContainsFolder(folderItems, String(key).slice(7), folderId);
      });
    }
    const assignedKeys = new Set();
    for (const folderId of folderIds) {
      const uniqueItems = [];
      for (const key of folderItems[folderId] || []) {
        if (assignedKeys.has(key)) continue;
        assignedKeys.add(key);
        uniqueItems.push(key);
      }
      folderItems[folderId] = uniqueItems;
    }
    for (let index = order.length - 1; index >= 0; index -= 1) {
      if (assignedKeys.has(order[index])) order.splice(index, 1);
    }
    for (const folderId of folderIds) {
      const key = `folder:${folderId}`;
      if (!assignedKeys.has(key) && !order.includes(key)) order.push(key);
    }
    result[surface] = { folders, order, folderItems };
  }
  return result;
}

function removeDeletedCompositionOrganizationKeys(organization, deletedIds = []) {
  const deletedKeys = new Set([...deletedIds].map((id) => `composition:${id}`));
  const next = JSON.parse(JSON.stringify(organization || {}));
  for (const surface of surfaces) {
    const source = next[surface] || {};
    source.order = (source.order || []).filter((key) => !deletedKeys.has(String(key)));
    source.folderItems = Object.fromEntries(Object.entries(source.folderItems || {}).map(([folderId, keys]) => [
      folderId,
      (Array.isArray(keys) ? keys : []).filter((key) => !deletedKeys.has(String(key)))
    ]));
    next[surface] = source;
  }
  return normalizeArtOrganization(next);
}

module.exports = Object.freeze({ normalizeArtOrganization, removeDeletedCompositionOrganizationKeys });
