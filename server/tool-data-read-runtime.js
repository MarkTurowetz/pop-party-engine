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
  loadControllerLayoutsSource,
  loadGameConstantsSource,
  loadGameFlowSource,
  loadStageLayoutsSource,
  localDraftStore,
  normalizeGameConstants,
  normalizeGameFlow,
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

  return {
    sendControllerLayouts,
    sendGameConstants,
    sendGameFlow,
    sendStageLayouts
  };
}

module.exports = { createToolDataReadRuntime };
