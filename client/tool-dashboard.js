async function loadGameConstants() {
  const result = await getJson("/api/game-constants");
  gameConstants = normalizeClientGameConstants(result.constants);
  constantsSavedSnapshot = JSON.stringify(normalizeClientGameConstants(result.savedConstants || result.constants || gameConstants));
  updateConstantsStorageStatus(result.storage);
  renderConstantsTool();
}



function toolLabel(toolId) {
  if (toolId === "flow") return "Flow Tool";
  if (toolId === "host-audio") return "Host Audios";
  if (toolId === "constants") return "Game Constants";
  if (toolId === "art") return "Art Manager";
  if (toolId === "layout") return "Layout Tool";
  if (toolId === "controller-layout") return "Controller Layout Tool";
  return "Tool";
}

function isToolDirty(toolId) {
  if (toolId === "art") return Boolean(pendingArtReplacement) || isArtCompositionsDirty();
  if (toolId === "flow") return isFlowDirty();
  if (toolId === "host-audio") return isHostAudiosDirty();
  if (toolId === "constants") return constantsSavedSnapshot && JSON.stringify(gameConstants) !== constantsSavedSnapshot;
  if (toolId === "layout") return isLayoutDirty();
  if (toolId === "controller-layout") return isControllerLayoutDirty();
  return false;
}

function hasGlobalSaveWork() {
  return isToolDirty("art") || isToolDirty("flow") || isToolDirty("host-audio") || isToolDirty("constants") || isToolDirty("layout") || isToolDirty("controller-layout");
}

function updateGlobalSaveButton() {
  if (!globalSaveButton) return;
  globalSaveButton.disabled = !hasGlobalSaveWork();
}

async function saveTool(toolId) {
  if (toolId === "art") {
    if (pendingArtReplacement) await saveArtReplacement();
    if (isArtCompositionsDirty()) await saveArtCompositions();
    return;
  }
  if (toolId === "flow") {
    await saveGameFlow();
    return;
  }
  if (toolId === "host-audio") {
    await saveHostAudios();
    return;
  }
  if (toolId === "constants") {
    await saveGameConstants();
    return;
  }
  if (toolId === "layout") {
    await saveStageLayouts();
    return;
  }
  if (toolId === "controller-layout") {
    await saveControllerLayouts();
  }
}

async function saveAllTools() {
  if (!globalSaveButton) return;
  globalSaveButton.disabled = true;
  globalSaveButton.textContent = "Saving";
  try {
    if (pendingArtReplacement) await saveArtReplacement();
    if (isArtCompositionsDirty()) await saveArtCompositions();
    if (isFlowDirty()) await saveGameFlow();
    if (isHostAudiosDirty()) await saveHostAudios();
    if (isToolDirty("constants")) await saveGameConstants();
    if (isLayoutDirty()) await saveStageLayouts();
    if (isControllerLayoutDirty()) await saveControllerLayouts();
  } finally {
    globalSaveButton.textContent = "Save All";
    updateGlobalSaveButton();
  }
}

function showUnsafeChangesModal(toolId) {
  unsafeChangesCopy.textContent = `${toolLabel(toolId)} has unsaved changes. Save before switching tools.`;
  unsafeChangesModal.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingToolSwitch = resolve;
  });
}

function resolveUnsafeChangesModal(result) {
  unsafeChangesModal.classList.add("hidden");
  const resolve = pendingToolSwitch;
  pendingToolSwitch = null;
  if (resolve) resolve(result);
}

async function confirmToolSwitch() {
  return true;
}

function hideToolScreens() {
  artScreen.classList.add("hidden");
  flowScreen.classList.add("hidden");
  hostAudioScreen.classList.add("hidden");
  constantsScreen.classList.add("hidden");
  layoutScreen.classList.add("hidden");
}

async function activateTool(toolId, { force = false } = {}) {
  if (!force && toolId === activeToolId) return;
  if (!force && !(await confirmToolSwitch())) return;
  hideToolScreens();
  activeToolId = toolId;
  toolTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.toolTarget === toolId));
  if (toolId === "art") {
    await setupArtTool();
  } else if (toolId === "host-audio") {
    await setupHostAudioTool();
  } else if (toolId === "constants") {
    await setupConstantsTool();
  } else if (toolId === "layout") {
    await setupLayoutTool("stage");
  } else if (toolId === "controller-layout") {
    await setupLayoutTool("controller");
  } else {
    await setupFlowTool();
  }
}

function setupToolDashboard() {
  document.body.classList.add("tool-dashboard-mode");
  toolDashboardBar.classList.remove("hidden");
  globalSaveButton.addEventListener("click", saveAllTools);
  updateGlobalSaveButton();
  unsafeCancelButton.addEventListener("click", () => resolveUnsafeChangesModal("cancel"));
  unsafeSaveButton.addEventListener("click", () => resolveUnsafeChangesModal("save"));
  unsafeChangesModal.addEventListener("click", (event) => {
    if (event.target === unsafeChangesModal) resolveUnsafeChangesModal("cancel");
  });
  toolTabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTool(tab.dataset.toolTarget));
  });
  const initialTool = ["flow", "host-audio", "constants", "art", "layout", "controller-layout"].includes(params.get("tool")) ? params.get("tool") : "flow";
  activateTool(initialTool, { force: true });
}
