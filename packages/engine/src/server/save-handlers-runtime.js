"use strict";

function createSaveHandlersRuntime({
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  controllerLayoutsPath,
  gameConstantsStore,
  gameConstantsPath,
  gameFlowStore,
  gameFlowPath,
  githubBranch,
  githubRepo,
  hasGithubToken,
  hostAudiosStore,
  hostAudiosPath,
  localDraftStore,
  normalizeHostAudios,
  normalizeGameFlow,
  onSaved = async () => {},
  preserveActiveRooms = false,
  readJson,
  resetCraftingTimer,
  rooms,
  sendJson,
  stageLayoutsStore,
  stageLayoutsPath,
  controllerLayoutsStore,
  writeControllerLayouts,
  writeGameConstants,
  writeGameFlow,
  writeHostAudios,
  writeStageLayouts
}) {
  function storagePayload(store, path) {
    const isGithub = store.storageKind === "github";
    const isRevisioned = store.storageKind === "github-app-draft";
    return {
      kind: store.storageKind,
      durable: isRevisioned || (isGithub && hasGithubToken()),
      error: store.error || "",
      repo: isGithub ? githubRepo : "",
      branch: isGithub ? githubBranch : "",
      path: isGithub || isRevisioned ? path : ""
    };
  }

  function writeMetadata(payload) {
    const metadata = {
      expectedRevision: String(payload?.revision || ""),
      idempotencyKey: String(payload?.idempotencyKey || "")
    };
    return metadata.expectedRevision || metadata.idempotencyKey ? metadata : null;
  }

  function writeValue(writer, value, payload) {
    const metadata = writeMetadata(payload);
    return metadata ? writer(value, metadata) : writer(value);
  }

  function revisionPayload(store) {
    return store.revision ? { revision: store.revision } : {};
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
      const status = error?.status === 409 ? 409 : 400;
      sendJson(res, status, {
        ok: false,
        error: `${options.label} could not be saved: ${error.message}`,
        ...(status === 409 ? { errorCode: error.code || "CONTENT_REVISION_CONFLICT" } : {})
      });
      return;
    }

    if (!preserveActiveRooms) options.afterSave?.(saved);
    await onSaved({ label: options.label, saved });
    sendJson(res, 200, options.response(saved));
  }

  async function handleSaveGameFlow(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 128 * 1024,
      label: "Game flow",
      save: async (payload) => {
        const flow = await writeValue(writeGameFlow, payload.flow || payload, payload);
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
        ...revisionPayload(gameFlowStore),
        storage: storagePayload(gameFlowStore, gameFlowPath)
      })
    });
  }

  async function handleSaveGameConstants(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 32 * 1024,
      label: "Game constants",
      save: async (payload) => {
        const constants = await writeValue(writeGameConstants, payload.constants || payload, payload);
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
        ...revisionPayload(gameConstantsStore),
        storage: storagePayload(gameConstantsStore, gameConstantsPath)
      })
    });
  }

  async function handleSaveStageLayouts(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 128 * 1024,
      label: "Stage layouts",
      save: async (payload) => {
        const layouts = await writeValue(writeStageLayouts, payload.layouts || payload, payload);
        localDraftStore.layouts = null;
        return layouts;
      },
      response: (layouts) => ({
        ok: true,
        layouts,
        ...revisionPayload(stageLayoutsStore),
        storage: storagePayload(stageLayoutsStore, stageLayoutsPath)
      })
    });
  }

  async function handleSaveControllerLayouts(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 128 * 1024,
      label: "Controller layouts",
      save: async (payload) => {
        const layouts = await writeValue(writeControllerLayouts, payload.layouts || payload, payload);
        localDraftStore.controllerLayouts = null;
        return layouts;
      },
      response: (layouts) => ({
        ok: true,
        layouts,
        ...revisionPayload(controllerLayoutsStore),
        storage: storagePayload(controllerLayoutsStore, controllerLayoutsPath)
      })
    });
  }

  async function handleSaveHostAudios(req, res) {
    await handleSaveRequest(req, res, {
      maxBytes: 256 * 1024,
      label: "Host audios",
      save: async (payload) => {
        const hostAudios = await writeValue(writeHostAudios, payload.hostAudios || payload, payload);
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
        ...revisionPayload(hostAudiosStore),
        storage: storagePayload(hostAudiosStore, hostAudiosPath)
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
