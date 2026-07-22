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
    return {
      kind: store.storageKind,
      durable: isGithub && hasGithubToken(),
      error: store.error || "",
      repo: isGithub ? githubRepo : "",
      branch: isGithub ? githubBranch : "",
      path: isGithub ? path : ""
    };
  }

  async function sendGameFlow(res) {
    const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
    const responseFlow = localDraftStore.flow || flow;
    sendJson(res, 200, {
      ok: true,
      flow: responseFlow,
      savedFlow: flow,
      runtimeFlow: normalizeGameFlow(responseFlow),
      hasLocalDraft: Boolean(localDraftStore.flow),
      storage: storagePayload(gameFlowStore, gameFlowPath),
      availableActionTypes: availableFlowActionTypes,
      availableTransitions: availableFlowTransitions
    });
  }

  async function sendGameConstants(res) {
    const constants = await loadGameConstantsSource({ refresh: gameConstantsStore.storageKind === "github" });
    const responseConstants = localDraftStore.constants || constants;
    sendJson(res, 200, {
      ok: true,
      constants: normalizeGameConstants(responseConstants),
      savedConstants: normalizeGameConstants(constants),
      hasLocalDraft: Boolean(localDraftStore.constants),
      storage: storagePayload(gameConstantsStore, gameConstantsPath)
    });
  }

  async function sendStageLayouts(res) {
    const layouts = await loadStageLayoutsSource({ refresh: stageLayoutsStore.storageKind === "github" });
    const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
    const activeFlow = localDraftStore.flow || flow;
    const syncedLayouts = syncStageLayoutsWithFlow(layouts, activeFlow);
    const responseLayouts = localDraftStore.layouts ? syncStageLayoutsWithFlow(localDraftStore.layouts, activeFlow) : syncedLayouts;
    sendJson(res, 200, {
      ok: true,
      layouts: responseLayouts,
      savedLayouts: syncedLayouts,
      hasLocalDraft: Boolean(localDraftStore.layouts),
      storage: storagePayload(stageLayoutsStore, stageLayoutsPath)
    });
  }

  async function sendControllerLayouts(res) {
    const layouts = await loadControllerLayoutsSource({ refresh: controllerLayoutsStore.storageKind === "github" });
    const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
    const activeFlow = localDraftStore.flow || flow;
    const syncedLayouts = syncControllerLayoutsWithFlow(layouts, activeFlow);
    const responseLayouts = localDraftStore.controllerLayouts ? syncControllerLayoutsWithFlow(localDraftStore.controllerLayouts, activeFlow) : syncedLayouts;
    sendJson(res, 200, {
      ok: true,
      layouts: responseLayouts,
      savedLayouts: syncedLayouts,
      hasLocalDraft: Boolean(localDraftStore.controllerLayouts),
      storage: storagePayload(controllerLayoutsStore, controllerLayoutsPath)
    });
  }

  async function sendHostAudios(res) {
    const hostAudios = await loadHostAudiosSource({ refresh: hostAudiosStore.storageKind === "github" });
    const responseHostAudios = localDraftStore.hostAudios || hostAudios;
    sendJson(res, 200, {
      ok: true,
      hostAudios: normalizeHostAudios(responseHostAudios),
      savedHostAudios: normalizeHostAudios(hostAudios),
      hasLocalDraft: Boolean(localDraftStore.hostAudios),
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
