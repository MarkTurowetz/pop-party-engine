"use strict";

// Extracts the async load*/write* persistence functions.
// Reader shims (readGameFlowSource, readGameFlow, gameConstants, etc.) stay in server.js
// as hoisted function declarations so early module constructions can reference them.

function createToolPersistenceRuntime({
  artManifestFile,
  artManifestGithubPath,
  artManifestStore,
  backupJsonFile,
  controllerLayoutsBackupDir,
  controllerLayoutsFile,
  controllerLayoutsGithubPath,
  controllerLayoutsStore,
  gameConstantsBackupDir,
  gameConstantsFile,
  gameConstantsGithubPath,
  gameConstantsStore,
  gameFlowBackupDir,
  gameFlowFile,
  gameFlowGithubPath,
  gameFlowStore,
  githubToken,
  hostAudiosBackupDir,
  hostAudiosFile,
  hostAudiosGithubPath,
  hostAudiosStore,
  mergeFlowWithExistingSubActions,
  mirrorJsonFile,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  normalizeStageLayouts,
  readArtManifestSource,
  readControllerLayoutsSource,
  readGameConstantsSource,
  readGameFlowSource,
  readGithubGameFlowSource,
  readGithubJsonSource,
  readLocalArtManifestSource,
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalHostAudiosSource,
  readLocalStageLayoutsSource,
  readHostAudiosSource,
  readStageLayoutsSource,
  stageLayoutsBackupDir,
  stageLayoutsFile,
  stageLayoutsGithubPath,
  stageLayoutsStore,
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow,
  writeGithubGameFlowSource,
  writeGithubJsonSource,
  writeJsonFile,
}) {
  function normalizeArtManifest(manifest) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("Art manifest must be a JSON object.");
    }
    return manifest;
  }

  async function loadSource({
    label,
    normalize = (value) => value,
    path,
    readCurrent,
    readLocal,
    readRemote,
    refresh,
    selectRemoteSource,
    store
  }) {
    if (store.storageKind !== "github") {
      store.source = normalize(readLocal());
      store.loadedAt = Date.now();
      store.error = "";
      return readCurrent();
    }
    if (!refresh && store.loadedAt) return readCurrent();
    if (!githubToken) {
      const error = new Error(`GAME_FLOW_GITHUB_TOKEN is not configured for authoritative GitHub ${label} storage.`);
      store.error = error.message;
      throw error;
    }

    try {
      const remote = await readRemote();
      const source = selectRemoteSource(remote);
      if (source === undefined || source === null) {
        throw new Error(`Required GitHub ${label} source is missing at ${path}. Bootstrap it explicitly before starting the game.`);
      }
      store.source = normalize(source);
      store.remoteSha = remote.sha || "";
      store.loadedAt = Date.now();
      store.error = "";
      return readCurrent();
    } catch (cause) {
      const error = new Error(`GitHub ${label} storage unavailable: ${cause.message}`, { cause });
      store.error = error.message;
      throw error;
    }
  }

  function loadArtManifestSource({ refresh = false } = {}) {
    return loadSource({
      label: "art manifest",
      normalize: normalizeArtManifest,
      path: artManifestGithubPath,
      readCurrent: readArtManifestSource,
      readLocal: readLocalArtManifestSource,
      readRemote: () => readGithubJsonSource(artManifestGithubPath),
      refresh,
      selectRemoteSource: (remote) => remote?.data,
      store: artManifestStore
    });
  }

  function loadGameConstantsSource({ refresh = false } = {}) {
    return loadSource({
      label: "game constants",
      normalize: normalizeGameConstants,
      path: gameConstantsGithubPath,
      readCurrent: readGameConstantsSource,
      readLocal: readLocalGameConstantsSource,
      readRemote: () => readGithubJsonSource(gameConstantsGithubPath),
      refresh,
      selectRemoteSource: (remote) => remote?.data,
      store: gameConstantsStore
    });
  }

  function loadStageLayoutsSource({ refresh = false } = {}) {
    return loadSource({
      label: "stage layouts",
      normalize: normalizeStageLayouts,
      path: stageLayoutsGithubPath,
      readCurrent: readStageLayoutsSource,
      readLocal: readLocalStageLayoutsSource,
      readRemote: () => readGithubJsonSource(stageLayoutsGithubPath),
      refresh,
      selectRemoteSource: (remote) => remote?.data,
      store: stageLayoutsStore
    });
  }

  function loadControllerLayoutsSource({ refresh = false } = {}) {
    return loadSource({
      label: "controller layouts",
      normalize: normalizeControllerLayouts,
      path: controllerLayoutsGithubPath,
      readCurrent: readControllerLayoutsSource,
      readLocal: readLocalControllerLayoutsSource,
      readRemote: () => readGithubJsonSource(controllerLayoutsGithubPath),
      refresh,
      selectRemoteSource: (remote) => remote?.data,
      store: controllerLayoutsStore
    });
  }

  function loadGameFlowSource({ refresh = false } = {}) {
    return loadSource({
      label: "game flow",
      path: gameFlowGithubPath,
      readCurrent: readGameFlowSource,
      readLocal: readLocalGameFlowSource,
      readRemote: readGithubGameFlowSource,
      refresh,
      selectRemoteSource: (remote) => remote?.flow,
      store: gameFlowStore
    });
  }

  function loadHostAudiosSource({ refresh = false } = {}) {
    return loadSource({
      label: "host audio",
      normalize: normalizeHostAudios,
      path: hostAudiosGithubPath,
      readCurrent: readHostAudiosSource,
      readLocal: readLocalHostAudiosSource,
      readRemote: () => readGithubJsonSource(hostAudiosGithubPath),
      refresh,
      selectRemoteSource: (remote) => remote?.data,
      store: hostAudiosStore
    });
  }

  async function writeGameConstants(constants) {
    const normalized = normalizeGameConstants(constants);
    backupJsonFile(gameConstantsFile, gameConstantsBackupDir, "game-constants");
    if (gameConstantsStore.storageKind === "github") {
      if (!githubToken) {
        throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
      }
      const saved = await writeGithubJsonSource(normalized, gameConstantsStore.remoteSha, gameConstantsGithubPath, "Save game constants");
      gameConstantsStore.source = normalizeGameConstants(saved.data);
      gameConstantsStore.remoteSha = saved.sha || "";
      gameConstantsStore.loadedAt = Date.now();
      gameConstantsStore.error = "";
      mirrorJsonFile(gameConstantsFile, gameConstantsStore.source);
      return readGameConstantsSource();
    }
    writeJsonFile(gameConstantsFile, normalized);
    gameConstantsStore.source = normalized;
    gameConstantsStore.loadedAt = Date.now();
    return readGameConstantsSource();
  }

  async function writeStageLayouts(layouts) {
    const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
    const normalized = syncStageLayoutsWithFlow(layouts, flow);
    backupJsonFile(stageLayoutsFile, stageLayoutsBackupDir, "stage-layouts");
    if (stageLayoutsStore.storageKind === "github") {
      if (!githubToken) {
        throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
      }
      const saved = await writeGithubJsonSource(normalized, stageLayoutsStore.remoteSha, stageLayoutsGithubPath, "Save stage layouts");
      stageLayoutsStore.source = normalizeStageLayouts(saved.data);
      stageLayoutsStore.remoteSha = saved.sha || "";
      stageLayoutsStore.loadedAt = Date.now();
      stageLayoutsStore.error = "";
      mirrorJsonFile(stageLayoutsFile, stageLayoutsStore.source);
      return readStageLayoutsSource();
    }
    writeJsonFile(stageLayoutsFile, normalized);
    stageLayoutsStore.source = normalized;
    stageLayoutsStore.loadedAt = Date.now();
    return readStageLayoutsSource();
  }

  async function writeControllerLayouts(layouts) {
    const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
    const normalized = syncControllerLayoutsWithFlow(layouts, flow);
    backupJsonFile(controllerLayoutsFile, controllerLayoutsBackupDir, "controller-layouts");
    if (controllerLayoutsStore.storageKind === "github") {
      if (!githubToken) {
        throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
      }
      const saved = await writeGithubJsonSource(normalized, controllerLayoutsStore.remoteSha, controllerLayoutsGithubPath, "Save controller layouts");
      controllerLayoutsStore.source = normalizeControllerLayouts(saved.data);
      controllerLayoutsStore.remoteSha = saved.sha || "";
      controllerLayoutsStore.loadedAt = Date.now();
      controllerLayoutsStore.error = "";
      mirrorJsonFile(controllerLayoutsFile, controllerLayoutsStore.source);
      return readControllerLayoutsSource();
    }
    writeJsonFile(controllerLayoutsFile, normalized);
    controllerLayoutsStore.source = normalized;
    controllerLayoutsStore.loadedAt = Date.now();
    return readControllerLayoutsSource();
  }

  async function writeGameFlow(flow) {
    const existingFlow = await loadGameFlowSource({ refresh: true });
    const merged = mergeFlowWithExistingSubActions(flow, existingFlow);
    assertUniqueGameFlowIds(merged);
    const normalized = normalizeGameFlow(merged);
    assertUniqueGameFlowIds(normalized);
    backupJsonFile(gameFlowFile, gameFlowBackupDir, "game-flow");
    if (gameFlowStore.storageKind === "github") {
      if (!githubToken) {
        throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
      }
      const saved = await writeGithubGameFlowSource(normalized, gameFlowStore.remoteSha);
      gameFlowStore.source = saved.flow;
      gameFlowStore.remoteSha = saved.sha || "";
      gameFlowStore.loadedAt = Date.now();
      gameFlowStore.error = "";
      mirrorJsonFile(gameFlowFile, saved.flow);
      return saved.flow;
    }
    writeJsonFile(gameFlowFile, normalized);
    gameFlowStore.source = normalized;
    gameFlowStore.loadedAt = Date.now();
    return normalized;
  }

  async function writeHostAudios(hostAudios) {
    const normalized = normalizeHostAudios(hostAudios);
    backupJsonFile(hostAudiosFile, hostAudiosBackupDir, "host-audios");
    if (hostAudiosStore.storageKind === "github") {
      if (!githubToken) {
        throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
      }
      const saved = await writeGithubJsonSource(normalized, hostAudiosStore.remoteSha, hostAudiosGithubPath, "Save host audios");
      hostAudiosStore.source = normalizeHostAudios(saved.data);
      hostAudiosStore.remoteSha = saved.sha || "";
      hostAudiosStore.loadedAt = Date.now();
      hostAudiosStore.error = "";
      mirrorJsonFile(hostAudiosFile, hostAudiosStore.source);
      return readHostAudiosSource();
    }
    writeJsonFile(hostAudiosFile, normalized);
    hostAudiosStore.source = normalized;
    hostAudiosStore.loadedAt = Date.now();
    return readHostAudiosSource();
  }

  async function writeArtManifest(manifest) {
    const normalized = normalizeArtManifest(manifest);
    if (artManifestStore.storageKind === "github") {
      if (!githubToken) {
        throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
      }
      const saved = await writeGithubJsonSource(normalized, artManifestStore.remoteSha, artManifestGithubPath, "Save art manifest");
      artManifestStore.source = normalizeArtManifest(saved.data);
      artManifestStore.remoteSha = saved.sha || "";
      artManifestStore.loadedAt = Date.now();
      artManifestStore.error = "";
      mirrorJsonFile(artManifestFile, artManifestStore.source);
      return readArtManifestSource();
    }
    writeJsonFile(artManifestFile, normalized);
    artManifestStore.source = normalized;
    artManifestStore.loadedAt = Date.now();
    return readArtManifestSource();
  }

  return {
    loadArtManifestSource,
    loadControllerLayoutsSource,
    loadGameConstantsSource,
    loadGameFlowSource,
    loadHostAudiosSource,
    loadStageLayoutsSource,
    writeControllerLayouts,
    writeGameConstants,
    writeGameFlow,
    writeHostAudios,
    writeArtManifest,
    writeStageLayouts,
  };
}

function assertUniqueGameFlowIds(flow) {
  const stateIds = new Map();
  const actionIds = new Map();
  const routeNodeIds = new Map();

  function remember(map, id, path, kind) {
    if (!id) return;
    const previousPath = map.get(id);
    if (previousPath) throw new Error(`Duplicate ${kind} id "${id}" at ${path}; first used at ${previousPath}.`);
    map.set(id, path);
  }

  function visitActions(actions, path) {
    for (const [index, action] of (Array.isArray(actions) ? actions : []).entries()) {
      const actionPath = `${path}[${index}]`;
      remember(actionIds, action?.id, `${actionPath}.id`, "flow action");
      visitActions(action?.actions, `${actionPath}.actions`);
      visitActions(action?.subActions, `${actionPath}.subActions`);
    }
  }

  for (const [index, state] of (Array.isArray(flow?.states) ? flow.states : []).entries()) {
    const statePath = `flow.states[${index}]`;
    remember(stateIds, state?.id, `${statePath}.id`, "flow state");
    visitActions(state?.actions, `${statePath}.actions`);
  }
  for (const [index, node] of (Array.isArray(flow?.routeNodes) ? flow.routeNodes : []).entries()) {
    remember(routeNodeIds, node?.id, `flow.routeNodes[${index}].id`, "route node");
  }
}

module.exports = { assertUniqueGameFlowIds, createToolPersistenceRuntime };
