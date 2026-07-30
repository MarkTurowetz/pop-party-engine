"use strict";

function createLocalDraftRuntime({
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  localDraftStore,
  normalizeArtAssetReplacementsDraft,
  normalizeControllerLayouts,
  normalizeArtCompositionsDraft,
  normalizeArtOrganization,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  normalizeStageLayouts,
  onDraftChanged = null,
  readGameFlow,
  readJson,
  resetCraftingTimer,
  onArtAssetsChanged = () => {},
  preserveActiveRooms = false,
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
      artOrganization: localDraftStore.artOrganization,
      artAssetReplacements: localDraftStore.artAssetReplacements,
      artDeletedCompositionIds: localDraftStore.artDeletedCompositionIds,
      hasFlowDraft: Boolean(localDraftStore.flow),
      hasConstantsDraft: Boolean(localDraftStore.constants),
      hasLayoutDraft: Boolean(localDraftStore.layouts),
      hasControllerLayoutDraft: Boolean(localDraftStore.controllerLayouts),
      hasHostAudiosDraft: Boolean(localDraftStore.hostAudios),
      hasArtCompositionsDraft: Boolean(localDraftStore.artCompositions),
      hasArtOrganizationDraft: Boolean(localDraftStore.artOrganization),
      hasArtAssetReplacementsDraft: Boolean(localDraftStore.artAssetReplacements)
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
    if (preserveActiveRooms) return;
    for (const room of rooms.values()) {
      if (payload.flow || payload.clearFlow) {
        clearActionTimer(room);
        resetCraftingTimer(room);
        room.actionIndex = 0;
        room.subroutinePath = [];
        room.subroutineStack = [];
        room.localVariables = {};
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

    const previousDraft = { ...localDraftStore, binaryFiles: { ...(localDraftStore.binaryFiles || {}) } };
    if (payload.clearFlow) localDraftStore.flow = null;
    if (payload.clearConstants) localDraftStore.constants = null;
    if (payload.clearLayouts) localDraftStore.layouts = null;
    if (payload.clearControllerLayouts) localDraftStore.controllerLayouts = null;
    if (payload.clearHostAudios) localDraftStore.hostAudios = null;
    if (payload.clearArtCompositions) localDraftStore.artCompositions = null;
    if (payload.clearArtOrganization) localDraftStore.artOrganization = null;
    if (payload.clearArtAssetReplacements) localDraftStore.artAssetReplacements = null;
    if (payload.clearArtDeletedCompositionIds) localDraftStore.artDeletedCompositionIds = null;

    if (!applyDraftValue(res, "flow", payload.flow, normalizeGameFlow, "Local flow draft")) return;
    if (!applyDraftValue(res, "constants", payload.constants, normalizeGameConstants, "Local constants draft")) return;
    if (!applyDraftValue(res, "layouts", payload.layouts, normalizeStageLayouts, "Local layout draft")) return;
    if (!applyDraftValue(res, "controllerLayouts", payload.controllerLayouts, normalizeControllerLayouts, "Local controller layout draft")) return;
    if (!applyDraftValue(res, "hostAudios", payload.hostAudios, normalizeHostAudios, "Local host audio draft")) return;
    if (!applyDraftValue(res, "artCompositions", payload.artCompositions, normalizeArtCompositionsDraft, "Local art composition draft")) return;
    if (!applyDraftValue(res, "artOrganization", payload.artOrganization, normalizeArtOrganization, "Local art organization draft")) return;
    if (!applyDraftValue(res, "artAssetReplacements", payload.artAssetReplacements, normalizeArtAssetReplacementsDraft, "Local art asset replacement draft")) return;
    if (!applyDraftValue(
      res,
      "artDeletedCompositionIds",
      payload.artDeletedCompositionIds,
      (value) => {
        if (!Array.isArray(value)) throw new Error("must be an array");
        return [...new Set(value.map(String).filter((id) => /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)))];
      },
      "Local deleted art composition draft"
    )) return;

    syncDraftLayoutsToFlow();
    if (typeof onDraftChanged === "function") {
      try {
        await onDraftChanged({ payload, req });
      } catch (error) {
        Object.assign(localDraftStore, previousDraft);
        sendJson(res, error?.status || 400, {
          ok: false,
          error: `Working bundle is invalid: ${error.message}`,
          errorCode: error.code || "WORKING_BUNDLE_INVALID",
          diagnostics: error.diagnostics || []
        });
        return;
      }
    }
    broadcastDraftChange(payload);
    if (
      payload.artCompositions ||
      payload.clearArtCompositions ||
      payload.artOrganization ||
      payload.clearArtOrganization ||
      payload.artAssetReplacements ||
      payload.clearArtAssetReplacements
      || payload.artDeletedCompositionIds
      || payload.clearArtDeletedCompositionIds
    ) {
      onArtAssetsChanged({ type: "art-draft", updatedAt: new Date().toISOString() });
    }
    sendLocalDraft(res);
  }

  return {
    handleLocalDraft,
    sendLocalDraft
  };
}

module.exports = { createLocalDraftRuntime };
