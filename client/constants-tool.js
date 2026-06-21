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
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "";
}

function normalizeClientGameConstants(constants = {}) {
  const colors = Array.isArray(constants.playerColors) ? constants.playerColors.map(normalizeUiColor).filter(Boolean) : [];
  return {
    playerColors: colors.length ? colors : ["#22d3ee", "#60d394", "#ffe156", "#ff9e2c", "#ff4fa3", "#7c3aed", "#2458ff", "#ef4444", "#f97316"],
    craftingTimerDuration: Math.max(1, Math.min(3600, Number(constants.craftingTimerDuration || 30))),
    startGameCountdownDuration: Math.max(1, Math.min(60, Number(constants.startGameCountdownDuration || 1))),
    pointsForCorrectAnswer: Math.max(0, Math.min(999999, Math.floor(Number(constants.pointsForCorrectAnswer ?? 200)))),
    gameTitle: String(constants.gameTitle || "Party Game Template").trim().slice(0, 80) || "Party Game Template",
    numberOfRounds: Math.max(1, Math.min(99, Math.floor(Number(constants.numberOfRounds || 3)))),
    randomChanceTest: Math.max(0, Math.min(1, Number(constants.randomChanceTest ?? 0.5))),
    overrideFirstGameOfSession: constants.overrideFirstGameOfSession === true
  };
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
  if (overrideFirstGameInput) overrideFirstGameInput.value = gameConstants.overrideFirstGameOfSession ? "true" : "false";
  playerColorCount.textContent = `${colors.length} ${colors.length === 1 ? "color" : "colors"}`;
  playerColorList.replaceChildren();
  colors.forEach((color, index) => {
    const row = document.createElement("div");
    row.className = "color-row";

    const picker = document.createElement("input");
    picker.className = "color-input";
    picker.type = "color";
    picker.value = normalizeUiColor(color) || "#22d3ee";
    picker.addEventListener("input", () => {
      gameConstants.playerColors[index] = picker.value;
      value.value = picker.value.toUpperCase();
      markConstantsChanged();
    });

    const value = document.createElement("input");
    value.className = "color-value";
    value.value = picker.value.toUpperCase();
    value.maxLength = 7;
    value.addEventListener("change", () => {
      const nextColor = normalizeUiColor(value.value);
      if (!nextColor) {
        value.value = picker.value.toUpperCase();
        return;
      }
      gameConstants.playerColors[index] = nextColor;
      picker.value = nextColor;
      value.value = nextColor.toUpperCase();
      markConstantsChanged();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "Remove";
    remove.disabled = colors.length <= 1;
    remove.addEventListener("click", () => {
      gameConstants.playerColors.splice(index, 1);
      renderConstantsTool();
      markConstantsChanged();
    });

    row.appendChild(picker);
    row.appendChild(value);
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
  gameConstants.playerColors = [...(gameConstants.playerColors || []), next];
  renderConstantsTool();
  markConstantsChanged();
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
  gameTitleInput?.addEventListener("input", () => {
    gameConstants.gameTitle = gameTitleInput.value || "Party Game Template";
    markConstantsChanged();
  });
  craftingTimerDurationInput?.addEventListener("change", () => {
    const value = Number(craftingTimerDurationInput.value || 30);
    gameConstants.craftingTimerDuration = Math.max(1, Math.min(3600, Number.isFinite(value) ? value : 30));
    craftingTimerDurationInput.value = String(gameConstants.craftingTimerDuration);
    markConstantsChanged();
  });
  startGameCountdownDurationInput?.addEventListener("change", () => {
    const value = Number(startGameCountdownDurationInput.value || 1);
    gameConstants.startGameCountdownDuration = Math.max(1, Math.min(60, Number.isFinite(value) ? value : 1));
    startGameCountdownDurationInput.value = String(gameConstants.startGameCountdownDuration);
    markConstantsChanged();
  });
  pointsForCorrectAnswerInput?.addEventListener("change", () => {
    const value = Math.floor(Number(pointsForCorrectAnswerInput.value || 0));
    gameConstants.pointsForCorrectAnswer = Math.max(0, Math.min(999999, Number.isFinite(value) ? value : 200));
    pointsForCorrectAnswerInput.value = String(gameConstants.pointsForCorrectAnswer);
    markConstantsChanged();
  });
  numberOfRoundsInput?.addEventListener("change", () => {
    const value = Math.floor(Number(numberOfRoundsInput.value || 3));
    gameConstants.numberOfRounds = Math.max(1, Math.min(99, Number.isFinite(value) ? value : 3));
    numberOfRoundsInput.value = String(gameConstants.numberOfRounds);
    markConstantsChanged();
  });
  randomChanceTestInput?.addEventListener("change", () => {
    const value = Number(randomChanceTestInput.value || 0.5);
    gameConstants.randomChanceTest = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
    randomChanceTestInput.value = String(gameConstants.randomChanceTest);
    markConstantsChanged();
  });
  overrideFirstGameInput?.addEventListener("change", () => {
    gameConstants.overrideFirstGameOfSession = overrideFirstGameInput.value === "true";
    markConstantsChanged();
  });
  try {
    await loadGameConstants();
  } catch (error) {
    constantsStorageStatus.textContent = error.message;
  }
}
