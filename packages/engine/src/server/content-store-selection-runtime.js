"use strict";

function selectApplicationContentStores(options = {}) {
  const environmentStore = options.environmentStore || null;
  const gameStore = options.gameStore || null;
  const fallbackStore = options.fallbackStore || null;
  const authoritative = environmentStore || gameStore || fallbackStore;
  return Object.freeze({
    authoringStore: environmentStore || gameStore,
    roomStore: authoritative,
    source: environmentStore ? "deployment" : gameStore ? "game" : fallbackStore ? "fallback" : "none"
  });
}

module.exports = Object.freeze({ selectApplicationContentStores });
