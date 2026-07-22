"use strict";

function cleanId(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(text) ? text : "";
}

function createArtCompositionCatalogRuntime({
  baseCompositions = [],
  createCustomDefinition = (id, record) => ({ id, ...record, isCustom: true }),
  normalizeComposition = (composition) => composition,
  now = () => new Date().toISOString(),
  readDraftCompositions = () => null
} = {}) {
  const knownCompositionIds = new Set(baseCompositions.map((composition) => cleanId(composition?.id)).filter(Boolean));

  function hasBaseComposition(compositionId) {
    return knownCompositionIds.has(cleanId(compositionId));
  }

  function deletedCompositionIds(manifest = {}) {
    return new Set(Array.isArray(manifest.deletedCompositionIds)
      ? manifest.deletedCompositionIds.map(cleanId).filter(Boolean)
      : []);
  }

  function artCompositionManifestRecord(composition, updatedAt = null) {
    return {
      name: composition.name,
      description: composition.description,
      surface: composition.surface,
      compositionKind: composition.compositionKind,
      isCustom: composition.isCustom,
      timelineArchitectureVersion: composition.timelineArchitectureVersion,
      canvas: composition.canvas,
      components: composition.components,
      ...(composition.timeline ? { timeline: composition.timeline } : {}),
      updatedAt: updatedAt || composition.updatedAt || now()
    };
  }

  function customArtCompositionDefinitions(manifest = {}) {
    const definitions = [];
    const manifestCompositions = manifest.compositions && typeof manifest.compositions === "object" && !Array.isArray(manifest.compositions)
      ? manifest.compositions
      : {};
    const deletedIds = deletedCompositionIds(manifest);
    for (const [compositionId, record] of Object.entries(manifestCompositions)) {
      const id = cleanId(compositionId);
      if (!id || knownCompositionIds.has(id) || deletedIds.has(id)) continue;
      definitions.push(createCustomDefinition(id, record));
    }
    return definitions;
  }

  function allPublicArtCompositions(manifest = {}) {
    const deletedIds = deletedCompositionIds(manifest);
    const compositions = [
      ...baseCompositions.filter((composition) => !deletedIds.has(cleanId(composition?.id))),
      ...customArtCompositionDefinitions(manifest)
    ].map((composition) => normalizeComposition(composition, manifest));
    const drafts = readDraftCompositions();
    if (!Array.isArray(drafts)) return compositions;
    const byId = new Map(compositions.map((composition) => [composition.id, composition]));
    for (const composition of drafts) {
      if (!composition?.id || deletedIds.has(cleanId(composition.id))) continue;
      byId.set(composition.id, composition);
    }
    return [...byId.values()];
  }

  return Object.freeze({
    allPublicArtCompositions,
    artCompositionManifestRecord,
    customArtCompositionDefinitions,
    deletedCompositionIds,
    hasBaseComposition
  });
}

module.exports = Object.freeze({ createArtCompositionCatalogRuntime });
