function createLocalDraftRuntime({
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  localDraftStore,
  normalizeControllerLayouts,
  normalizeArtCompositionsDraft,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  normalizeStageLayouts,
  readGameFlow,
  readJson,
  resetCraftingTimer,
  onArtAssetsChanged = () => {},
  rooms,
  sendJson,
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow
}) {
  function sendLocalDraft(res) {
    sendJson(res, 200, {
      ok: true,
      flow: localDraftStore.flow,
      constants: localDraftStore.constants,
      layouts: localDraftStore.layouts,
      controllerLayouts: localDraftStore.controllerLayouts,
      hostAudios: localDraftStore.hostAudios,
      artCompositions: localDraftStore.artCompositions,
      hasFlowDraft: Boolean(localDraftStore.flow),
      hasConstantsDraft: Boolean(localDraftStore.constants),
      hasLayoutDraft: Boolean(localDraftStore.layouts),
      hasControllerLayoutDraft: Boolean(localDraftStore.controllerLayouts),
      hasHostAudiosDraft: Boolean(localDraftStore.hostAudios),
      hasArtCompositionsDraft: Boolean(localDraftStore.artCompositions)
    });
  }

  function applyDraftValue(res, key, value, normalize, errorLabel) {
    if (!value) return true;
    try {
      localDraftStore[key] = normalize(value);
      return true;
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `${errorLabel} is invalid: ${error.message}` });
      return false;
    }
  }

  function syncDraftLayoutsToFlow() {
    const flow = localDraftStore.flow || readGameFlow();
    if (localDraftStore.layouts) {
      localDraftStore.layouts = syncStageLayoutsWithFlow(localDraftStore.layouts, flow);
    }
    if (localDraftStore.controllerLayouts) {
      localDraftStore.controllerLayouts = syncControllerLayoutsWithFlow(localDraftStore.controllerLayouts, flow);
    }
  }

  function broadcastDraftChange(payload) {
    for (const room of rooms.values()) {
      if (payload.flow || payload.clearFlow) {
        clearActionTimer(room);
        resetCraftingTimer(room);
        room.actionIndex = 0;
        room.presentedAction = null;
        room.lastDecisionTrace = null;
        clearAppliedActionEffects(room);
      }
      broadcastLobby(room);
    }
  }

  async function handleLocalDraft(req, res) {
    let payload;
    try {
      payload = await readJson(req, 8 * 1024 * 1024);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    if (payload.clearFlow) localDraftStore.flow = null;
    if (payload.clearConstants) localDraftStore.constants = null;
    if (payload.clearLayouts) localDraftStore.layouts = null;
    if (payload.clearControllerLayouts) localDraftStore.controllerLayouts = null;
    if (payload.clearHostAudios) localDraftStore.hostAudios = null;
    if (payload.clearArtCompositions) localDraftStore.artCompositions = null;

    if (!applyDraftValue(res, "flow", payload.flow, normalizeGameFlow, "Local flow draft")) return;
    if (!applyDraftValue(res, "constants", payload.constants, normalizeGameConstants, "Local constants draft")) return;
    if (!applyDraftValue(res, "layouts", payload.layouts, normalizeStageLayouts, "Local layout draft")) return;
    if (!applyDraftValue(res, "controllerLayouts", payload.controllerLayouts, normalizeControllerLayouts, "Local controller layout draft")) return;
    if (!applyDraftValue(res, "hostAudios", payload.hostAudios, normalizeHostAudios, "Local host audio draft")) return;
    if (!applyDraftValue(res, "artCompositions", payload.artCompositions, normalizeArtCompositionsDraft, "Local art composition draft")) return;

    syncDraftLayoutsToFlow();
    broadcastDraftChange(payload);
    if (payload.artCompositions || payload.clearArtCompositions) {
      onArtAssetsChanged({ type: "art-compositions-draft", updatedAt: new Date().toISOString() });
    }
    sendLocalDraft(res);
  }

  return {
    handleLocalDraft,
    sendLocalDraft
  };
}

module.exports = { createLocalDraftRuntime };
