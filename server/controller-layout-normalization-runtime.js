function createControllerLayoutNormalizationRuntime({
  cloneJson,
  defaultControllerLayouts,
  normalizeLayoutNumber,
  normalizeLayoutState
}) {
  const legacyGlobalActionIds = new Set([
    "controllerglobalactionmessage",
    "controllerglobalactionbutton"
  ]);

  const localButtonContainerMigrations = {
    joinbutton: {
      id: "controllerjoinbuttoncontainer",
      name: "Join Button Container",
      selector: "#controllerJoinButtonContainer"
    },
    startgamebutton: {
      id: "controllerlobbybuttoncontainer",
      name: "Lobby Button Container",
      selector: "#controllerLobbyButtonContainer"
    },
    controllertextsubmitbutton: {
      id: "controllertextsubmitbuttoncontainer",
      name: "Text Submit Button Container",
      selector: "#controllerTextSubmitButtonContainer"
    },
    controllervoicebutton: {
      id: "controllervoicebuttoncontainer",
      name: "Voice Record Button Container",
      selector: "#controllerVoiceButtonContainer"
    },
    controllermicaccessbutton: {
      id: "controllermicaccessbuttoncontainer",
      name: "Microphone Access Button Container",
      selector: "#controllerMicAccessButtonContainer"
    }
  };
  const legacyControllerStateIds = new Set(["intro"]);

  function migrateControllerLocalButtonElement(element) {
    const migration = localButtonContainerMigrations[element?.id];
    if (!migration) return element;
    return {
      ...element,
      ...migration,
      kind: "art",
      artCompositionId: "",
      defaultAnimationState: "On",
      defaultText: ""
    };
  }

  function migrateControllerPlayerBannerElement(element) {
    const compactId = String(element?.id || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compactId !== "controllerplayerbanner") return element;
    const isCurrentWidget = Number(element.playerBannerWidgetVersion || 0) >= 1;
    return {
      ...element,
      kind: "art",
      artCompositionId: "controller-player-banner",
      defaultAnimationState: isCurrentWidget
        ? normalizeControllerInitialState(element.defaultAnimationState)
        : "On",
      playerBannerWidgetVersion: 1
    };
  }

  function migrateControllerActionElement(element, stateId) {
    if (!element) return element;
    if (element.id === "controllerglobalactionmessage") {
      return {
        ...element,
        id: stateId === "controller-paused" ? "controllerpausedmessage" : "controllerpresentationmessage",
        name: stateId === "controller-paused" ? "Paused Message" : "Presentation Message"
      };
    }
    if (element.id !== "controllerglobalactionbutton") return element;
    const isPaused = stateId === "controller-paused";
    return {
      ...element,
      id: isPaused ? "controllerpausedbuttoncontainer" : "controllerpresentationbuttoncontainer",
      name: isPaused ? "Paused Button Container" : "Presentation Button Container",
      selector: isPaused ? "#controllerPausedButtonContainer" : "#controllerPresentationButtonContainer",
      kind: "art",
      artCompositionId: "",
      defaultAnimationState: "On",
      defaultText: ""
    };
  }

  function migrateControllerActionState(state) {
    if (!state || !["controller-presentation", "controller-paused"].includes(state.id)) return state;
    return {
      ...state,
      elements: (state.elements || []).map((element) => migrateControllerActionElement(element, state.id))
    };
  }

  function normalizeControllerInitialState(value) {
    const state = String(value || "").trim().toLowerCase();
    return ["off", "park", "disappear", "hidden", "hide"].includes(state) ? "Off" : "On";
  }

  function normalizeControllerState(state, stateIndex) {
    const normalized = normalizeLayoutState(state, stateIndex);
    if (!normalized) return null;
    normalized.elements = (normalized.elements || []).map((element) => {
      const migratedElement = migrateControllerPlayerBannerElement(migrateControllerLocalButtonElement(element));
      return {
        ...migratedElement,
        defaultAnimationState: normalizeControllerInitialState(migratedElement.defaultAnimationState)
      };
    });
    return normalized;
  }

  function normalizeControllerLayouts(layouts) {
    const incomingCanvas = layouts?.canvas || defaultControllerLayouts.canvas;
    const canvas = {
      width: normalizeLayoutNumber(incomingCanvas.width, defaultControllerLayouts.canvas.width, 240, 2000),
      height: normalizeLayoutNumber(incomingCanvas.height, defaultControllerLayouts.canvas.height, 320, 3000)
    };
    const incomingStates = Array.isArray(layouts?.states) ? layouts.states : defaultControllerLayouts.states;
    const normalizedDefaultGlobal = normalizeControllerState(defaultControllerLayouts.global, -1);
    const normalizedDefaultStates = defaultControllerLayouts.states.map((state, index) => normalizeControllerState(state, index)).filter(Boolean);
    const defaultStatesById = new Map(normalizedDefaultStates.map((state) => [state.id, state]));
    const normalizedStates = incomingStates
      .map((state, stateIndex) => migrateControllerActionState(normalizeControllerState(state, stateIndex)))
      .filter((state) => state && !legacyControllerStateIds.has(state.id));
    for (const defaultState of normalizedDefaultStates) {
      if (!normalizedStates.some((state) => state.id === defaultState.id)) {
        normalizedStates.push(cloneJson(defaultState));
      }
    }
    const hasIncomingGlobal = layouts && Object.prototype.hasOwnProperty.call(layouts, "global");
    const incomingGlobal = normalizeControllerState(hasIncomingGlobal ? layouts.global : defaultControllerLayouts.global, -1);
    const globalElements = (incomingGlobal?.elements || []).filter((element) => !legacyGlobalActionIds.has(element.id));
    const globalElementIds = new Set(globalElements.map((element) => element.id));
    return {
      canvas,
      global: {
        ...normalizedDefaultGlobal,
        ...(incomingGlobal || {}),
        id: "global",
        name: incomingGlobal?.name || normalizedDefaultGlobal.name,
        elements: globalElements
      },
      states: normalizedStates.map((state) => {
        const defaultState = defaultStatesById.get(state.id);
        const hiddenGlobals = new Set(
          (Array.isArray(state.hiddenGlobals) ? state.hiddenGlobals : defaultState?.hiddenGlobals || [])
            .filter((id) => !legacyGlobalActionIds.has(id))
        );
        for (const element of state.elements || []) {
          if (globalElementIds.has(element.id)) hiddenGlobals.add(element.id);
        }
        return {
          ...state,
          hiddenGlobals: [...hiddenGlobals]
        };
      })
    };
  }

  return { normalizeControllerLayouts };
}

module.exports = { createControllerLayoutNormalizationRuntime };
