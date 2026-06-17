const DEFAULT_NAMES = [
  "Ava",
  "Ben",
  "Cal",
  "Dee",
  "Eli",
  "Fia",
  "Gus",
  "Hal",
  "Ivy",
  "Jax"
];

const stageCodeInput = document.querySelector("#stageCodeInput");
const controllerCountInput = document.querySelector("#controllerCountInput");
const playerNamesInput = document.querySelector("#playerNamesInput");
const spawnButton = document.querySelector("#spawnButton");
const tapRandomButton = document.querySelector("#tapRandomButton");
const statusText = document.querySelector("#statusText");
const appOrigin = document.querySelector("#appOrigin");

let detectedOrigin = "";

function normalizeStageCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function parseNames() {
  return playerNamesInput.value
    .split(/\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function setStatus(message) {
  statusText.textContent = message;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function originFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch (error) {
    return "";
  }
}

async function loadState() {
  const activeTab = await getActiveTab();
  detectedOrigin = originFromUrl(activeTab?.url);
  const stored = await chrome.storage.local.get([
    "appOrigin",
    "stageCode",
    "controllerCount",
    "playerNames",
    "spawnedControllers"
  ]);

  detectedOrigin = detectedOrigin || stored.appOrigin || "";
  appOrigin.textContent = detectedOrigin ? `Target: ${detectedOrigin}` : "Open a Flip 7 page first";
  stageCodeInput.value = stored.stageCode || "";
  controllerCountInput.value = stored.controllerCount || "4";
  playerNamesInput.value = stored.playerNames || DEFAULT_NAMES.join("\n");
  setStatus(`${(stored.spawnedControllers || []).length} spawned controller tabs tracked.`);
}

async function persistInputs() {
  await chrome.storage.local.set({
    appOrigin: detectedOrigin,
    stageCode: normalizeStageCode(stageCodeInput.value),
    controllerCount: controllerCountInput.value,
    playerNames: playerNamesInput.value
  });
}

function controllerUrl({ origin, stageCode, playerName, index }) {
  const params = new URLSearchParams();
  params.set("stage", stageCode);
  params.set("name", playerName);
  params.set("autojoin", "1");
  params.set("player", `spawn-${stageCode.toLowerCase()}-${Date.now()}-${index}`);
  return `${origin}/controller?${params.toString()}`;
}

async function spawnControllers() {
  const stageCode = normalizeStageCode(stageCodeInput.value);
  const count = Math.max(1, Math.min(50, Number.parseInt(controllerCountInput.value, 10) || 1));
  const names = parseNames();

  if (!detectedOrigin) {
    setStatus("Open your Flip 7 app, then reopen this extension.");
    return;
  }
  if (!stageCode) {
    setStatus("Enter a stage code.");
    return;
  }
  if (names.length === 0) {
    setStatus("Add at least one player name.");
    return;
  }

  spawnButton.disabled = true;
  await persistInputs();

  const spawnedControllers = [];
  for (let index = 0; index < count; index += 1) {
    const playerName = names[index % names.length];
    const tab = await chrome.tabs.create({
      active: false,
      url: controllerUrl({ origin: detectedOrigin, stageCode, playerName, index })
    });
    spawnedControllers.push({
      tabId: tab.id,
      playerName,
      stageCode,
      createdAt: Date.now()
    });
  }

  await chrome.storage.local.set({ spawnedControllers });
  spawnButton.disabled = false;
  setStatus(`Spawned ${spawnedControllers.length} controller${spawnedControllers.length === 1 ? "" : "s"}.`);
}

function clickRandomVisibleButton() {
  const buttons = Array.from(document.querySelectorAll("button"))
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
      return !disabled &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.pointerEvents !== "none";
    });

  if (buttons.length === 0) return { clicked: false, count: 0 };
  const button = buttons[Math.floor(Math.random() * buttons.length)];
  button.click();
  return {
    clicked: true,
    count: buttons.length,
    label: button.textContent.trim() || button.getAttribute("aria-label") || "button"
  };
}

async function tapRandomButtonsInControllers() {
  const stored = await chrome.storage.local.get(["spawnedControllers"]);
  const controllers = stored.spawnedControllers || [];
  if (controllers.length === 0) {
    setStatus("No spawned controller tabs are tracked.");
    return;
  }

  tapRandomButton.disabled = true;
  let clicked = 0;
  let checked = 0;
  const stillOpen = [];

  for (const controller of controllers) {
    if (!controller.tabId) continue;
    try {
      await chrome.tabs.get(controller.tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: controller.tabId },
        func: clickRandomVisibleButton
      });
      const result = results?.[0]?.result;
      checked += 1;
      if (result?.clicked) clicked += 1;
      stillOpen.push(controller);
    } catch (error) {
      // The tab was closed or no longer accepts scripts.
    }
  }

  await chrome.storage.local.set({ spawnedControllers: stillOpen });
  tapRandomButton.disabled = false;
  setStatus(`Tapped ${clicked} of ${checked} open controller${checked === 1 ? "" : "s"}.`);
}

stageCodeInput.addEventListener("input", () => {
  stageCodeInput.value = normalizeStageCode(stageCodeInput.value);
  persistInputs();
});
controllerCountInput.addEventListener("input", persistInputs);
playerNamesInput.addEventListener("input", persistInputs);
spawnButton.addEventListener("click", spawnControllers);
tapRandomButton.addEventListener("click", tapRandomButtonsInControllers);

loadState();
