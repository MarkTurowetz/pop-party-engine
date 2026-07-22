"use strict";

function createToolSourceStoresRuntime({
  readLocalArtManifestSource,
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalHostAudiosSource,
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

  const hostAudiosStore = {
    source: readLocalHostAudiosSource(),
    remoteSha: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  const artManifestStore = {
    source: readLocalArtManifestSource(),
    remoteSha: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  return {
    artManifestStore,
    controllerLayoutsStore,
    gameConstantsStore,
    gameFlowStore,
    hostAudiosStore,
    stageLayoutsStore
  };
}

module.exports = { createToolSourceStoresRuntime };
