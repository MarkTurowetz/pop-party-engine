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
  const normalizedStorageKind = ["github", "github-app-draft"].includes(storageKind)
    ? storageKind
    : "local";

  const gameFlowStore = {
    source: readLocalGameFlowSource(),
    remoteSha: "",
    revision: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: "",
    ready: null
  };

  const gameConstantsStore = {
    source: readLocalGameConstantsSource(),
    remoteSha: "",
    revision: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  const stageLayoutsStore = {
    source: readLocalStageLayoutsSource(),
    remoteSha: "",
    revision: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  const controllerLayoutsStore = {
    source: readLocalControllerLayoutsSource(),
    remoteSha: "",
    revision: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  const hostAudiosStore = {
    source: readLocalHostAudiosSource(),
    remoteSha: "",
    revision: "",
    storageKind: normalizedStorageKind,
    loadedAt: 0,
    error: ""
  };

  const artManifestStore = {
    source: readLocalArtManifestSource(),
    remoteSha: "",
    revision: "",
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
