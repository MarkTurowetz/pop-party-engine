function createSaveHandlersRuntime({
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  gameConstantsStore,
  gameFlowStore,
  hasGithubToken,
  hostAudiosStore,
  localDraftStore,
  normalizeHostAudios,
  normalizeGameFlow,
  readJson,
  resetCraftingTimer,
  rooms,
  sendJson,
  stageLayoutsStore,
  controllerLayoutsStore,
  writeControllerLayouts,
  writeGameConstants,
  writeGameFlow,
  writeHostAudios,
  writeStageLayouts
}) {
  function storagePayload(store) {
    return {
      kind: store.storageKind,
      durable: store.storageKind === "github" && hasGithubToken(),
      error: store.error || ""
    };
  }

  async function readSavePayload(req, maxBytes) {
    try {
      return await readJson(req, maxBytes);
    } catch (error) {
      return null;
    }
  }

  async function handleSaveRequest(req, res, options) {
    const payload = await readSavePayload(req, options.maxBytes);
    if (!payload) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    let saved;
    try {
      saved = await options.save(payload);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `${options.label} could not be saved: ${error.message}` });
      return;
    }

    options.afterSave?.(saved);
    sendJson(res, 200, options.response(saved));
  }

  async function handleSaveGameFlow(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 128 * 1024,
      label: "Game flow",
      save: async (payload) => {
        const flow = await writeGameFlow(payload.flow || payload);
        localDraftStore.flow = null;
        return flow;
      },
      afterSave: () => {
        for (const room of rooms.values()) {
          clearActionTimer(room);
          resetCraftingTimer(room);
          room.actionIndex = 0;
          room.subroutinePath = [];
          room.subroutineStack = [];
          room.presentedAction = null;
          room.lastDecisionTrace = null;
          clearAppliedActionEffects(room);
          broadcastLobby(room);
        }
      },
      response: (flow) => ({
        ok: true,
        flow,
        runtimeFlow: normalizeGameFlow(flow),
        storage: storagePayload(gameFlowStore)
      })
    });
  }

  async function handleSaveGameConstants(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 32 * 1024,
      label: "Game constants",
      save: async (payload) => {
        const constants = await writeGameConstants(payload.constants || payload);
        localDraftStore.constants = null;
        return constants;
      },
      afterSave: () => {
        for (const room of rooms.values()) {
          broadcastLobby(room);
        }
      },
      response: (constants) => ({
        ok: true,
        constants,
        storage: storagePayload(gameConstantsStore)
      })
    });
  }

  async function handleSaveStageLayouts(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 128 * 1024,
      label: "Stage layouts",
      save: async (payload) => {
        const layouts = await writeStageLayouts(payload.layouts || payload);
        localDraftStore.layouts = null;
        return layouts;
      },
      response: (layouts) => ({
        ok: true,
        layouts,
        storage: storagePayload(stageLayoutsStore)
      })
    });
  }

  async function handleSaveControllerLayouts(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 128 * 1024,
      label: "Controller layouts",
      save: async (payload) => {
        const layouts = await writeControllerLayouts(payload.layouts || payload);
        localDraftStore.controllerLayouts = null;
        return layouts;
      },
      response: (layouts) => ({
        ok: true,
        layouts,
        storage: storagePayload(controllerLayoutsStore)
      })
    });
  }

  async function handleSaveHostAudios(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 256 * 1024,
      label: "Host audios",
      save: async (payload) => {
        const hostAudios = await writeHostAudios(payload.hostAudios || payload);
        localDraftStore.hostAudios = null;
        return hostAudios;
      },
      afterSave: () => {
        for (const room of rooms.values()) {
          broadcastLobby(room);
        }
      },
      response: (hostAudios) => ({
        ok: true,
        hostAudios: normalizeHostAudios(hostAudios),
        storage: storagePayload(hostAudiosStore)
      })
    });
  }

  return {
    handleSaveControllerLayouts,
    handleSaveGameConstants,
    handleSaveGameFlow,
    handleSaveHostAudios,
    handleSaveStageLayouts
  };
}

module.exports = { createSaveHandlersRuntime };
