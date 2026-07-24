"use strict";

const {
  createStageLayoutNormalizationRuntime: createEngineStageLayoutNormalizationRuntime
} = require("../stage-layout-normalization-runtime");

function createStageLayoutNormalizationRuntime(options) {
  const { cloneJson, defaultStageLayouts } = options;

  function migrateStageLayoutStates({ states, global, defaultGlobal, hasExplicitGlobal }) {
    const migratedGlobal = global ? cloneJson(global) : cloneJson(defaultGlobal);
    migratedGlobal.id = "global";
    migratedGlobal.name = migratedGlobal.name || "Global Layout";
    migratedGlobal.elements = Array.isArray(migratedGlobal.elements) ? migratedGlobal.elements : [];
    const lobby = states.find((state) => state.id === "lobby");
    const starting = states.find((state) => state.id === "starting");
    const countdown = starting?.elements?.find((element) => element.id === "startpopup");
    if (lobby && countdown && !lobby.elements.some((element) => element.id === "startpopup")) {
      lobby.elements.unshift({
        ...countdown,
        id: "startpopup",
        name: countdown.name || "Countdown Popup",
        selector: countdown.selector || "#startPopup"
      });
    }
    const globalElementIds = new Set((defaultGlobal.elements || []).map((element) => element.id));
    for (const state of states) {
      state.elements = (state.elements || []).filter((element) => {
        if (!globalElementIds.has(element.id)) return true;
        const existingIndex = migratedGlobal.elements.findIndex((item) => item.id === element.id);
        if (existingIndex === -1) {
          migratedGlobal.elements.push(cloneJson(element));
        } else if (!hasExplicitGlobal) {
          migratedGlobal.elements[existingIndex] = cloneJson(element);
        }
        return false;
      });
    }
    return { states, global: migratedGlobal };
  }

  function normalizeGlobalElements({ defaultGlobal, globalElements }) {
    const defaultBackgroundElements = (defaultGlobal.elements || []).filter((element) => element.layoutLayer === "background");
    if (!globalElements.some((element) => element.layoutLayer === "background")) {
      for (const backgroundElement of [...defaultBackgroundElements].reverse()) {
        const existingIndex = globalElements.findIndex((element) => element.id === backgroundElement.id);
        if (existingIndex >= 0) globalElements[existingIndex] = { ...globalElements[existingIndex], layoutLayer: "background" };
        else globalElements.push(cloneJson(backgroundElement));
      }
    }
    return globalElements;
  }

  const runtime = createEngineStageLayoutNormalizationRuntime({
    ...options,
    includeMissingDefaultStates: true,
    migrateStageLayoutStates,
    normalizeGlobalElements
  });

  return {
    ...runtime,
    migrateStageLayoutStates: (states, global, defaultGlobal, hasExplicitGlobal = false) =>
      migrateStageLayoutStates({ states, global, defaultGlobal, hasExplicitGlobal })
  };
}

module.exports = { createStageLayoutNormalizationRuntime };
