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
    return manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : {};
  }

  async function loadArtManifestSource({ refresh = false } = {}) {
    if (artManifestStore.storageKind !== "github") {
      artManifestStore.source = readLocalArtManifestSource();
      artManifestStore.loadedAt = Date.now();
      artManifestStore.error = "";
      return readArtManifestSource();
    }

    if (!refresh && artManifestStore.loadedAt) return readArtManifestSource();
    if (!githubToken) {
      artManifestStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
      return readArtManifestSource();
    }

    try {
      const remote = await readGithubJsonSource(artManifestGithubPath);
      if (remote?.data) {
        artManifestStore.source = normalizeArtManifest(remote.data);
        artManifestStore.remoteSha = remote.sha || "";
      } else {
        const seeded = await writeGithubJsonSource(readArtManifestSource(), "", artManifestGithubPath, "Save art manifest");
        artManifestStore.source = normalizeArtManifest(seeded.data);
        artManifestStore.remoteSha = seeded.sha || "";
      }
      artManifestStore.loadedAt = Date.now();
      artManifestStore.error = "";
    } catch (error) {
      artManifestStore.error = `GitHub art manifest storage unavailable: ${error.message}`;
    }

    return readArtManifestSource();
  }

  async function loadGameConstantsSource({ refresh = false } = {}) {
    if (gameConstantsStore.storageKind !== "github") {
      gameConstantsStore.source = readLocalGameConstantsSource();
      gameConstantsStore.loadedAt = Date.now();
      gameConstantsStore.error = "";
      return readGameConstantsSource();
    }

    if (!refresh && gameConstantsStore.loadedAt) return readGameConstantsSource();
    if (!githubToken) {
      gameConstantsStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
      return readGameConstantsSource();
    }

    try {
      const remote = await readGithubJsonSource(gameConstantsGithubPath);
      if (remote?.data) {
        gameConstantsStore.source = normalizeGameConstants(remote.data);
        gameConstantsStore.remoteSha = remote.sha || "";
      } else {
        const seeded = await writeGithubJsonSource(readGameConstantsSource(), "", gameConstantsGithubPath, "Save game constants");
        gameConstantsStore.source = normalizeGameConstants(seeded.data);
        gameConstantsStore.remoteSha = seeded.sha || "";
      }
      gameConstantsStore.loadedAt = Date.now();
      gameConstantsStore.error = "";
    } catch (error) {
      gameConstantsStore.error = `GitHub constants storage unavailable: ${error.message}`;
    }

    return readGameConstantsSource();
  }

  async function loadStageLayoutsSource({ refresh = false } = {}) {
    if (stageLayoutsStore.storageKind !== "github") {
      stageLayoutsStore.source = readLocalStageLayoutsSource();
      stageLayoutsStore.loadedAt = Date.now();
      stageLayoutsStore.error = "";
      return readStageLayoutsSource();
    }

    if (!refresh && stageLayoutsStore.loadedAt) return readStageLayoutsSource();
    if (!githubToken) {
      stageLayoutsStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
      return readStageLayoutsSource();
    }

    try {
      const remote = await readGithubJsonSource(stageLayoutsGithubPath);
      if (remote?.data) {
        stageLayoutsStore.source = normalizeStageLayouts(remote.data);
        stageLayoutsStore.remoteSha = remote.sha || "";
      } else {
        const seeded = await writeGithubJsonSource(readStageLayoutsSource(), "", stageLayoutsGithubPath, "Save stage layouts");
        stageLayoutsStore.source = normalizeStageLayouts(seeded.data);
        stageLayoutsStore.remoteSha = seeded.sha || "";
      }
      stageLayoutsStore.loadedAt = Date.now();
      stageLayoutsStore.error = "";
    } catch (error) {
      stageLayoutsStore.error = `GitHub layout storage unavailable: ${error.message}`;
    }

    return readStageLayoutsSource();
  }

  async function loadControllerLayoutsSource({ refresh = false } = {}) {
    if (controllerLayoutsStore.storageKind !== "github") {
      controllerLayoutsStore.source = readLocalControllerLayoutsSource();
      controllerLayoutsStore.loadedAt = Date.now();
      controllerLayoutsStore.error = "";
      return readControllerLayoutsSource();
    }

    if (!refresh && controllerLayoutsStore.loadedAt) return readControllerLayoutsSource();
    if (!githubToken) {
      controllerLayoutsStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
      return readControllerLayoutsSource();
    }

    try {
      const remote = await readGithubJsonSource(controllerLayoutsGithubPath);
      if (remote?.data) {
        controllerLayoutsStore.source = normalizeControllerLayouts(remote.data);
        controllerLayoutsStore.remoteSha = remote.sha || "";
      } else {
        const seeded = await writeGithubJsonSource(readControllerLayoutsSource(), "", controllerLayoutsGithubPath, "Save controller layouts");
        controllerLayoutsStore.source = normalizeControllerLayouts(seeded.data);
        controllerLayoutsStore.remoteSha = seeded.sha || "";
      }
      controllerLayoutsStore.loadedAt = Date.now();
      controllerLayoutsStore.error = "";
    } catch (error) {
      controllerLayoutsStore.error = `GitHub controller layout storage unavailable: ${error.message}`;
    }

    return readControllerLayoutsSource();
  }

  async function loadGameFlowSource({ refresh = false } = {}) {
    if (gameFlowStore.storageKind !== "github") {
      gameFlowStore.source = readLocalGameFlowSource();
      gameFlowStore.loadedAt = Date.now();
      gameFlowStore.error = "";
      return readGameFlowSource();
    }

    if (!refresh && gameFlowStore.loadedAt) return readGameFlowSource();
    if (!githubToken) {
      gameFlowStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
      return readGameFlowSource();
    }

    try {
      const remote = await readGithubGameFlowSource();
      if (remote?.flow) {
        gameFlowStore.source = remote.flow;
        gameFlowStore.remoteSha = remote.sha || "";
      } else {
        const seeded = await writeGithubGameFlowSource(readGameFlowSource(), "");
        gameFlowStore.source = seeded.flow;
        gameFlowStore.remoteSha = seeded.sha || "";
      }
      gameFlowStore.loadedAt = Date.now();
      gameFlowStore.error = "";
    } catch (error) {
      gameFlowStore.error = `GitHub flow storage unavailable: ${error.message}`;
    }

    return readGameFlowSource();
  }

  async function loadHostAudiosSource({ refresh = false } = {}) {
    if (hostAudiosStore.storageKind !== "github") {
      hostAudiosStore.source = readLocalHostAudiosSource();
      hostAudiosStore.loadedAt = Date.now();
      hostAudiosStore.error = "";
      return readHostAudiosSource();
    }

    if (!refresh && hostAudiosStore.loadedAt) return readHostAudiosSource();
    if (!githubToken) {
      hostAudiosStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
      return readHostAudiosSource();
    }

    try {
      const remote = await readGithubJsonSource(hostAudiosGithubPath);
      if (remote?.data) {
        hostAudiosStore.source = normalizeHostAudios(remote.data);
        hostAudiosStore.remoteSha = remote.sha || "";
      } else {
        const seeded = await writeGithubJsonSource(readHostAudiosSource(), "", hostAudiosGithubPath, "Save host audios");
        hostAudiosStore.source = normalizeHostAudios(seeded.data);
        hostAudiosStore.remoteSha = seeded.sha || "";
      }
      hostAudiosStore.loadedAt = Date.now();
      hostAudiosStore.error = "";
    } catch (error) {
      hostAudiosStore.error = `GitHub host audio storage unavailable: ${error.message}`;
    }

    return readHostAudiosSource();
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
    normalizeGameFlow(merged);
    backupJsonFile(gameFlowFile, gameFlowBackupDir, "game-flow");
    if (gameFlowStore.storageKind === "github") {
      if (!githubToken) {
        throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
      }
      const saved = await writeGithubGameFlowSource(merged, gameFlowStore.remoteSha);
      gameFlowStore.source = saved.flow;
      gameFlowStore.remoteSha = saved.sha || "";
      gameFlowStore.loadedAt = Date.now();
      gameFlowStore.error = "";
      mirrorJsonFile(gameFlowFile, saved.flow);
      return saved.flow;
    }
    writeJsonFile(gameFlowFile, merged);
    gameFlowStore.source = merged;
    gameFlowStore.loadedAt = Date.now();
    return merged;
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

module.exports = { createToolPersistenceRuntime };
