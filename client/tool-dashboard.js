async function loadGameConstants() {
  const result = await getJson("/api/game-constants");
  gameConstants = normalizeClientGameConstants(result.constants);
  constantsSavedSnapshot = JSON.stringify(normalizeClientGameConstants(result.savedConstants || result.constants || gameConstants));
  if (typeof getConstantsHistoryManager === "function") getConstantsHistoryManager()?.clear();
  updateConstantsStorageStatus(result.storage);
  renderConstantsTool();
}

const TOOL_DEFINITIONS = [
  {
    id: "flow",
    label: "Flow Tool",
    screen: () => flowScreen,
    isDirty: () => isFlowDirty(),
    save: () => saveGameFlow(),
    setup: () => setupFlowTool()
  },
  {
    id: "host-audio",
    label: "Host Audios",
    screen: () => hostAudioScreen,
    isDirty: () => isHostAudiosDirty(),
    save: () => saveHostAudios(),
    setup: () => setupHostAudioTool()
  },
  {
    id: "constants",
    label: "Game Constants",
    screen: () => constantsScreen,
    isDirty: () => constantsSavedSnapshot && JSON.stringify(gameConstants) !== constantsSavedSnapshot,
    save: () => saveGameConstants(),
    setup: () => setupConstantsTool()
  },
  {
    id: "art",
    label: "Art Manager",
    screen: () => artScreen,
    isDirty: () => Boolean(pendingArtReplacement) || isArtCompositionsDirty(),
    save: async () => {
      if (pendingArtReplacement) await saveArtReplacement();
      if (isArtCompositionsDirty()) await saveArtCompositions();
    },
    setup: () => setupArtTool()
  },
  {
    id: "layout",
    label: "Layout Tool",
    screen: () => layoutScreen,
    isDirty: () => isLayoutDirty(),
    save: () => saveStageLayouts(),
    setup: () => setupLayoutTool("stage")
  },
  {
    id: "controller-layout",
    label: "Controller Layout Tool",
    screen: () => layoutScreen,
    isDirty: () => isControllerLayoutDirty(),
    save: () => saveControllerLayouts(),
    setup: () => setupLayoutTool("controller")
  }
];

function toolDefinition(toolId) {
  return TOOL_DEFINITIONS.find((definition) => definition.id === toolId) || null;
}

function toolLabel(toolId) {
  return toolDefinition(toolId)?.label || "Tool";
}

function isToolDirty(toolId) {
  return Boolean(toolDefinition(toolId)?.isDirty());
}

function hasGlobalSaveWork() {
  return TOOL_DEFINITIONS.some((definition) => isToolDirty(definition.id));
}

function updateGlobalSaveButton() {
  if (!globalSaveButton) return;
  globalSaveButton.disabled = !hasGlobalSaveWork();
}

async function saveTool(toolId) {
  const definition = toolDefinition(toolId);
  if (definition) await definition.save();
}

async function saveAllTools() {
  if (!globalSaveButton) return;
  const pendingDeleteCount = typeof artCompositionsPendingDeleteCount === "function"
    ? artCompositionsPendingDeleteCount()
    : 0;
  if (pendingDeleteCount > 0) {
    const confirmed = window.confirm(`Save All will permanently delete ${pendingDeleteCount} art asset${pendingDeleteCount === 1 ? "" : "s"} and any layout instances that use them. This action cannot be undone.`);
    if (!confirmed) return;
  }
  globalSaveButton.disabled = true;
  globalSaveButton.textContent = "Saving";
  try {
    for (const definition of TOOL_DEFINITIONS) {
      if (isToolDirty(definition.id)) await definition.save();
    }
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
  new Set(TOOL_DEFINITIONS.map((definition) => definition.screen()).filter(Boolean)).forEach((screen) => {
    screen.classList.add("hidden");
  });
}

async function activateTool(toolId, { force = false } = {}) {
  const definition = toolDefinition(toolId) || toolDefinition("flow");
  if (!force && definition.id === activeToolId) return;
  if (!force && !(await confirmToolSwitch())) return;
  hideToolScreens();
  activeToolId = definition.id;
  toolTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.toolTarget === definition.id));
  await definition.setup();
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
  const initialTool = toolDefinition(params.get("tool"))?.id || "flow";
  activateTool(initialTool, { force: true });
}
