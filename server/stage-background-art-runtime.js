function stageBackgroundOverride(defaultComposition, manifestCompositions = {}) {
  if (!String(defaultComposition?.id || "").startsWith("stage-background")) return null;
  return manifestCompositions?.[defaultComposition.id] || null;
}

module.exports = { stageBackgroundOverride };
