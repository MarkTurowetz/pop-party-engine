function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isCurrentControllerPlayerBanner(composition) {
  const components = Array.isArray(composition?.components) ? composition.components : [];
  const byId = new Map(components.map((component) => [component?.id, component]));
  return byId.get("player-avatar-mc")?.artCompositionId === "prefab-player-avatar-mc"
    && byId.get("player-name-mc")?.artCompositionId === "prefab-player-name-mc";
}

function controllerPlayerBannerOverride(defaultComposition, manifestCompositions = {}) {
  if (defaultComposition?.id !== "controller-player-banner") return null;
  const saved = manifestCompositions?.[defaultComposition.id];
  if (!saved) return null;
  if (isCurrentControllerPlayerBanner(saved)) return saved;
  return {
    ...saved,
    name: defaultComposition.name,
    description: defaultComposition.description,
    surface: defaultComposition.surface,
    compositionKind: defaultComposition.compositionKind || "gameObject",
    timelineArchitectureVersion: defaultComposition.timelineArchitectureVersion,
    canvas: cloneJson(defaultComposition.canvas),
    components: cloneJson(defaultComposition.components),
    timeline: cloneJson(defaultComposition.timeline)
  };
}

module.exports = { controllerPlayerBannerOverride, isCurrentControllerPlayerBanner };
