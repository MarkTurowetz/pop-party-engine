function createToolSourceStoresRuntime({
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalStageLayoutsSource,
  storageKind
}) {
  const normalizedStorageKind = storageKind === "github" ? "github" : "local";

  const gameFlowStore = {
    source: readLocalGameFlowSource(),
    remoteSha: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: "",
    ready: null
  };

  const gameConstantsStore = {
    source: readLocalGameConstantsSource(),
    remoteSha: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  const stageLayoutsStore = {
    source: readLocalStageLayoutsSource(),
    remoteSha: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  const controllerLayoutsStore = {
    source: readLocalControllerLayoutsSource(),
    remoteSha: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  return {
    controllerLayoutsStore,
    gameConstantsStore,
    gameFlowStore,
    stageLayoutsStore
  };
}

module.exports = { createToolSourceStoresRuntime };
