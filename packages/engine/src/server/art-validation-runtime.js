"use strict";

const { collectArtArchitectureIssues } = require("../shared/art-timeline-architecture");

function cleanId(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(text) ? text : "";
}

function architectureIssueKey(issue) {
  return [issue?.compositionId, issue?.code, issue?.message].map((value) => String(value || "")).join("\u0000");
}

function blockingArtArchitectureIssues(beforeCompositions, afterCompositions, touchedCompositionIds = []) {
  const previousIssueKeys = new Set(collectArtArchitectureIssues(beforeCompositions).map(architectureIssueKey));
  const touchedIds = new Set([...touchedCompositionIds].map(cleanId).filter(Boolean));
  return collectArtArchitectureIssues(afterCompositions).filter((issue) =>
    touchedIds.has(cleanId(issue?.compositionId)) || !previousIssueKeys.has(architectureIssueKey(issue))
  );
}

module.exports = Object.freeze({ architectureIssueKey, blockingArtArchitectureIssues });
