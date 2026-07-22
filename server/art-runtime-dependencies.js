"use strict";

function artRuntimeReferences(semanticRoles = {}) {
  const semanticReferences = Object.entries(semanticRoles).map(([role, target]) => ({
    compositionId: String(target?.compositionId || ""),
    sourceId: `semantic-role:${role}`,
    sourceName: `Semantic role ${role}`
  })).filter((reference) => reference.compositionId);
  return [
    ...semanticReferences
  ];
}

module.exports = { artRuntimeReferences };
