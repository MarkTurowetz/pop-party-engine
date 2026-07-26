"use strict";

function createToolDataReadRuntime({
  availableFlowActionTypes,
  availableFlowTransitions,
  controllerLayoutsPath,
  controllerLayoutsStore,
  gameConstantsPath,
  gameConstantsStore,
  gameFlowPath,
  gameFlowStore,
  githubBranch,
  githubRepo,
  hasGithubToken,
  hostAudiosPath,
  hostAudiosStore,
  loadControllerLayoutsSource,
  loadGameConstantsSource,
  loadGameFlowSource,
  loadHostAudiosSource,
  loadStageLayoutsSource,
  localDraftStore,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  sendJson,
  stageLayoutsPath,
  stageLayoutsStore,
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow
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

  function revisionPayload(store) {
    return store.revision ? { revision: store.revision } : {};
  }

  function shouldRefresh(store) {
    return store.storageKind === "github" || store.storageKind === "github-app-draft";
  }

  async function sendGameFlow(res) {
    const flow = await loadGameFlowSource({ refresh: shouldRefresh(gameFlowStore) });
    const responseFlow = localDraftStore.flow || flow;
    sendJson(res, 200, {
      ok: true,
      flow: responseFlow,
      savedFlow: flow,
      runtimeFlow: normalizeGameFlow(responseFlow),
      hasLocalDraft: Boolean(localDraftStore.flow),
      ...revisionPayload(gameFlowStore),
      storage: storagePayload(gameFlowStore, gameFlowPath),
      availableActionTypes: availableFlowActionTypes,
      availableTransitions: availableFlowTransitions
    });
  }

  async function sendGameConstants(res) {
    const constants = await loadGameConstantsSource({ refresh: shouldRefresh(gameConstantsStore) });
    const responseConstants = localDraftStore.constants || constants;
    sendJson(res, 200, {
      ok: true,
      constants: normalizeGameConstants(responseConstants),
      savedConstants: normalizeGameConstants(constants),
      hasLocalDraft: Boolean(localDraftStore.constants),
      ...revisionPayload(gameConstantsStore),
      storage: storagePayload(gameConstantsStore, gameConstantsPath)
    });
  }

  async function sendStageLayouts(res) {
    const layouts = await loadStageLayoutsSource({ refresh: shouldRefresh(stageLayoutsStore) });
    const flow = await loadGameFlowSource({ refresh: shouldRefresh(gameFlowStore) });
    const activeFlow = localDraftStore.flow || flow;
    const syncedLayouts = syncStageLayoutsWithFlow(layouts, activeFlow);
    const responseLayouts = localDraftStore.layouts ? syncStageLayoutsWithFlow(localDraftStore.layouts, activeFlow) : syncedLayouts;
    sendJson(res, 200, {
      ok: true,
      layouts: responseLayouts,
      savedLayouts: syncedLayouts,
      hasLocalDraft: Boolean(localDraftStore.layouts),
      ...revisionPayload(stageLayoutsStore),
      storage: storagePayload(stageLayoutsStore, stageLayoutsPath)
    });
  }

  async function sendControllerLayouts(res) {
    const layouts = await loadControllerLayoutsSource({ refresh: shouldRefresh(controllerLayoutsStore) });
    const flow = await loadGameFlowSource({ refresh: shouldRefresh(gameFlowStore) });
    const activeFlow = localDraftStore.flow || flow;
    const syncedLayouts = syncControllerLayoutsWithFlow(layouts, activeFlow);
    const responseLayouts = localDraftStore.controllerLayouts ? syncControllerLayoutsWithFlow(localDraftStore.controllerLayouts, activeFlow) : syncedLayouts;
    sendJson(res, 200, {
      ok: true,
      layouts: responseLayouts,
      savedLayouts: syncedLayouts,
      hasLocalDraft: Boolean(localDraftStore.controllerLayouts),
      ...revisionPayload(controllerLayoutsStore),
      storage: storagePayload(controllerLayoutsStore, controllerLayoutsPath)
    });
  }

  async function sendHostAudios(res) {
    const hostAudios = await loadHostAudiosSource({ refresh: shouldRefresh(hostAudiosStore) });
    const responseHostAudios = localDraftStore.hostAudios || hostAudios;
    sendJson(res, 200, {
      ok: true,
      hostAudios: normalizeHostAudios(responseHostAudios),
      savedHostAudios: normalizeHostAudios(hostAudios),
      hasLocalDraft: Boolean(localDraftStore.hostAudios),
      ...revisionPayload(hostAudiosStore),
      storage: storagePayload(hostAudiosStore, hostAudiosPath)
    });
  }

  return {
    sendControllerLayouts,
    sendGameConstants,
    sendGameFlow,
    sendHostAudios,
    sendStageLayouts
  };
}

module.exports = { createToolDataReadRuntime };
