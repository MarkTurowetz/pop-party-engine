function updateConstantsStorageStatus(storage) {
  if (!constantsStorageStatus) return;
  if (!storage) {
    constantsStorageStatus.textContent = "Constants storage: unknown";
    return;
  }
  if (storage.durable) {
    constantsStorageStatus.textContent = `Constants storage: GitHub ${storage.repo || ""}${storage.branch ? ` / ${storage.branch}` : ""}`;
    return;
  }
  constantsStorageStatus.textContent = storage.error || "Constants storage: local fallback only";
}

function normalizeUiColor(value) {
  return window.PartyGameColorUtils?.normalizeColor?.(value) || window.PartyGameColorControl?.normalize?.(value) || "";
}

function normalizeEditableColor(value) {
  return window.PartyGameColorControl?.normalize?.(value) || normalizeUiColor(value);
}

function normalizeClientGameConstants(constants = {}) {
  const colors = Array.isArray(constants.playerColors) ? constants.playerColors.map(normalizeEditableColor).filter(Boolean) : [];
  return {
    playerColors: colors.length ? colors : ["#22d3ee", "#60d394", "#ffe156", "#ff9e2c", "#ff4fa3", "#7c3aed", "#2458ff", "#ef4444", "#f97316"],
    craftingTimerDuration: Math.max(1, Math.min(3600, Number(constants.craftingTimerDuration || 30))),
    startGameCountdownDuration: Math.max(1, Math.min(60, Number(constants.startGameCountdownDuration || 1))),
    pointsForCorrectAnswer: Math.max(0, Math.min(999999, Math.floor(Number(constants.pointsForCorrectAnswer ?? 200)))),
    gameTitle: String(constants.gameTitle || "Party Game Template").trim().slice(0, 80) || "Party Game Template",
    numberOfRounds: Math.max(1, Math.min(99, Math.floor(Number(constants.numberOfRounds || 3)))),
    randomChanceTest: Math.max(0, Math.min(1, Number(constants.randomChanceTest ?? 0.5))),
    speechToTextSendInputBuffer: Math.max(0, Math.min(10, Number(constants.speechToTextSendInputBuffer ?? 1))),
    overrideFirstGameOfSession: constants.overrideFirstGameOfSession === true
  };
}

function constantsHistorySnapshot() {
  return JSON.stringify(normalizeClientGameConstants(gameConstants));
}

function getConstantsHistoryManager() {
  if (!constantsHistoryManager && window.PartyGameToolHistory) {
    constantsHistoryManager = window.PartyGameToolHistory.createHistory({
      snapshot: constantsHistorySnapshot,
      restore: restoreConstantsHistory,
      limit: 30
    });
  }
  return constantsHistoryManager;
}

function pushConstantsHistory() {
  getConstantsHistoryManager()?.push();
}

function restoreConstantsHistory(snapshot) {
  gameConstants = normalizeClientGameConstants(JSON.parse(snapshot));
  renderConstantsTool();
  publishRuntimeLocalChanges();
  updateGlobalSaveButton();
}

function undoConstantsChange() {
  getConstantsHistoryManager()?.undo();
}

function redoConstantsChange() {
  getConstantsHistoryManager()?.redo();
}

function handleConstantsHotkeys(event) {
  if (constantsScreen.classList.contains("hidden")) return;
  window.PartyGameToolAffordances?.handleToolHistoryHotkey(event, {
    onUndo: undoConstantsChange,
    onRedo: redoConstantsChange
  });
}

function commitGameConstants(nextConstants, { captureHistory = true, render = false } = {}) {
  const current = normalizeClientGameConstants(gameConstants);
  const normalized = normalizeClientGameConstants(nextConstants);
  if (JSON.stringify(current) === JSON.stringify(normalized)) return false;
  if (captureHistory) pushConstantsHistory();
  gameConstants = normalized;
  if (render) {
    renderConstantsTool();
  } else {
    markConstantsChanged();
  }
  return true;
}

function updatePlayerColor(index, color, { captureHistory = true } = {}) {
  const nextColor = normalizeEditableColor(color);
  if (!nextColor || nextColor === gameConstants.playerColors[index]) return;
  if (captureHistory) pushConstantsHistory();
  const nextColors = [...gameConstants.playerColors];
  nextColors[index] = nextColor;
  commitGameConstants({ ...gameConstants, playerColors: nextColors }, { captureHistory: false });
}

function renderConstantsTool() {
  gameConstants = normalizeClientGameConstants(gameConstants);
  const colors = Array.isArray(gameConstants.playerColors) ? gameConstants.playerColors : [];
  document.querySelectorAll("[data-constant-target]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.constantTarget === selectedGameConstantId);
  });
  document.querySelectorAll("[data-constant-detail]").forEach((detail) => {
    detail.classList.toggle("hidden", detail.dataset.constantDetail !== selectedGameConstantId);
  });
  addPlayerColorButton?.classList.toggle("hidden", selectedGameConstantId !== "playerColors");
  if (gameTitleInput) gameTitleInput.value = gameConstants.gameTitle;
  if (craftingTimerDurationInput) {
    craftingTimerDurationInput.value = String(Math.max(1, Number(gameConstants.craftingTimerDuration || 30)));
  }
  if (startGameCountdownDurationInput) {
    startGameCountdownDurationInput.value = String(Math.max(1, Number(gameConstants.startGameCountdownDuration || 1)));
  }
  if (pointsForCorrectAnswerInput) {
    pointsForCorrectAnswerInput.value = String(Math.max(0, Number(gameConstants.pointsForCorrectAnswer || 0)));
  }
  if (numberOfRoundsInput) numberOfRoundsInput.value = String(gameConstants.numberOfRounds);
  if (randomChanceTestInput) randomChanceTestInput.value = String(gameConstants.randomChanceTest);
  if (speechToTextSendInputBufferInput) speechToTextSendInputBufferInput.value = String(gameConstants.speechToTextSendInputBuffer);
  if (overrideFirstGameInput) overrideFirstGameInput.value = gameConstants.overrideFirstGameOfSession ? "true" : "false";
  playerColorCount.textContent = `${colors.length} ${colors.length === 1 ? "color" : "colors"}`;
  window.PartyGameToolAffordances?.bindScrollStableControls?.(playerColorList);
  playerColorList.replaceChildren();
  colors.forEach((color, index) => {
    const row = document.createElement("div");
    row.className = "color-row";

    const picker = window.PartyGameColorControl?.create?.({
      document,
      label: `Color ${index + 1}`,
      value: color,
      className: "player-color-control",
      normalizeColor: normalizeEditableColor,
      onChange: (nextColor, meta) => updatePlayerColor(index, nextColor, { captureHistory: meta.captureHistory })
    }) || document.createElement("input");
    if (picker.tagName === "INPUT") {
      picker.className = "color-value";
      picker.value = (normalizeUiColor(color) || "#22d3ee").toUpperCase();
      picker.maxLength = 9;
      picker.addEventListener("change", () => updatePlayerColor(index, picker.value));
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "Remove";
    remove.disabled = colors.length <= 1;
    remove.addEventListener("click", () => {
      commitGameConstants({
        ...gameConstants,
        playerColors: gameConstants.playerColors.filter((_, colorIndex) => colorIndex !== index)
      }, { render: true });
    });

    row.appendChild(picker);
    row.appendChild(remove);
    playerColorList.appendChild(row);
  });
  updateGlobalSaveButton();
}

function markConstantsChanged() {
  publishRuntimeLocalChanges();
  updateGlobalSaveButton();
}

function addPlayerColor() {
  const nextColors = ["#22d3ee", "#60d394", "#ffe156", "#ff9e2c", "#ff4fa3", "#7c3aed", "#2458ff", "#ef4444", "#f97316"];
  const used = new Set(gameConstants.playerColors || []);
  const next = nextColors.find((color) => !used.has(color)) || "#ffffff";
  commitGameConstants({
    ...gameConstants,
    playerColors: [...(gameConstants.playerColors || []), next]
  }, { render: true });
}

async function saveGameConstants() {
  const result = await postJson("/api/game-constants", { constants: gameConstants });
  gameConstants = normalizeClientGameConstants(result.constants || gameConstants);
  constantsSavedSnapshot = JSON.stringify(gameConstants);
  updateConstantsStorageStatus(result.storage);
  renderConstantsTool();
}

async function setupConstantsTool() {
  constantsScreen.classList.remove("hidden");
  if (constantsToolInitialized) return;
  constantsToolInitialized = true;
  document.querySelectorAll("[data-constant-target]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedGameConstantId = button.dataset.constantTarget || "gameTitle";
      renderConstantsTool();
    });
  });
  addPlayerColorButton.addEventListener("click", addPlayerColor);
  let gameTitleHistoryCaptured = false;
  gameTitleInput?.addEventListener("focus", () => {
    gameTitleHistoryCaptured = false;
  });
  gameTitleInput?.addEventListener("input", () => {
    const nextTitle = gameTitleInput.value || "Party Game Template";
    if (!gameTitleHistoryCaptured && nextTitle !== gameConstants.gameTitle) {
      pushConstantsHistory();
      gameTitleHistoryCaptured = true;
    }
    commitGameConstants({ ...gameConstants, gameTitle: nextTitle }, { captureHistory: false });
  });
  craftingTimerDurationInput?.addEventListener("change", () => {
    const value = Number(craftingTimerDurationInput.value || 30);
    commitGameConstants({
      ...gameConstants,
      craftingTimerDuration: Math.max(1, Math.min(3600, Number.isFinite(value) ? value : 30))
    });
    craftingTimerDurationInput.value = String(gameConstants.craftingTimerDuration);
  });
  startGameCountdownDurationInput?.addEventListener("change", () => {
    const value = Number(startGameCountdownDurationInput.value || 1);
    commitGameConstants({
      ...gameConstants,
      startGameCountdownDuration: Math.max(1, Math.min(60, Number.isFinite(value) ? value : 1))
    });
    startGameCountdownDurationInput.value = String(gameConstants.startGameCountdownDuration);
  });
  pointsForCorrectAnswerInput?.addEventListener("change", () => {
    const value = Math.floor(Number(pointsForCorrectAnswerInput.value || 0));
    commitGameConstants({
      ...gameConstants,
      pointsForCorrectAnswer: Math.max(0, Math.min(999999, Number.isFinite(value) ? value : 200))
    });
    pointsForCorrectAnswerInput.value = String(gameConstants.pointsForCorrectAnswer);
  });
  numberOfRoundsInput?.addEventListener("change", () => {
    const value = Math.floor(Number(numberOfRoundsInput.value || 3));
    commitGameConstants({
      ...gameConstants,
      numberOfRounds: Math.max(1, Math.min(99, Number.isFinite(value) ? value : 3))
    });
    numberOfRoundsInput.value = String(gameConstants.numberOfRounds);
  });
  randomChanceTestInput?.addEventListener("change", () => {
    const value = Number(randomChanceTestInput.value || 0.5);
    commitGameConstants({
      ...gameConstants,
      randomChanceTest: Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5))
    });
    randomChanceTestInput.value = String(gameConstants.randomChanceTest);
  });
  speechToTextSendInputBufferInput?.addEventListener("change", () => {
    const value = Number(speechToTextSendInputBufferInput.value || 1);
    commitGameConstants({
      ...gameConstants,
      speechToTextSendInputBuffer: Math.max(0, Math.min(10, Number.isFinite(value) ? value : 1))
    });
    speechToTextSendInputBufferInput.value = String(gameConstants.speechToTextSendInputBuffer);
  });
  overrideFirstGameInput?.addEventListener("change", () => {
    commitGameConstants({
      ...gameConstants,
      overrideFirstGameOfSession: overrideFirstGameInput.value === "true"
    });
  });
  window.addEventListener("keydown", handleConstantsHotkeys);
  try {
    await loadGameConstants();
  } catch (error) {
    constantsStorageStatus.textContent = error.message;
  }
}
