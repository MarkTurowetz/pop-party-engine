"use strict";

const crypto = require("crypto");
const { compositionRevision } = require("./art-composition-dependency-runtime");

function manifestRevision(manifest) {
  return crypto.createHash("sha256").update(JSON.stringify(manifest || {})).digest("hex");
}

function revisionMatches(payload, manifest) {
  const expected = String(payload?.revision ?? "").trim().slice(0, 128);
  return !expected || expected === manifestRevision(manifest);
}

function compositionSaveConflict({ payload, manifest, compositionIds = [], currentCompositions = [] } = {}) {
  if (revisionMatches(payload, manifest)) return null;
  const expected = payload?.expectedCompositionRevisions && typeof payload.expectedCompositionRevisions === "object"
    ? payload.expectedCompositionRevisions
    : null;
  const currentById = new Map(currentCompositions.map((composition) => [composition.id, composition]));
  const currentRevisions = Object.fromEntries(compositionIds.map((id) => {
    const current = currentById.get(id);
    return [id, current ? compositionRevision(current) : ""];
  }));
  const conflicts = compositionIds.filter((id) =>
    !expected || !Object.prototype.hasOwnProperty.call(expected, id) || String(expected[id] || "") !== currentRevisions[id]
  );
  if (!conflicts.length) return null;
  return {
    ok: false,
    error: conflicts.length === 1
      ? "Art composition changed; reload before saving"
      : "Art compositions changed; reload before saving",
    conflictCompositionIds: conflicts,
    compositionRevisions: currentRevisions,
    revision: manifestRevision(manifest)
  };
}

module.exports = Object.freeze({ compositionSaveConflict, manifestRevision, revisionMatches });
