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
const sortControllersButton = document.querySelector("#sortControllersButton");
const tapRandomButton = document.querySelector("#tapRandomButton");
const closeControllersButton = document.querySelector("#closeControllersButton");
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

function readActivePageStageCode() {
  function normalize(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  const visibleStageCode = normalize(document.querySelector("#stageCodeText")?.textContent);
  if (visibleStageCode && visibleStageCode !== "----") return visibleStageCode;

  const controllerInputCode = normalize(document.querySelector("#stageCodeInput")?.value);
  if (controllerInputCode) return controllerInputCode;

  const params = new URLSearchParams(window.location.search);
  return normalize(params.get("stage") || params.get("code"));
}

async function getStageCodeFromActiveTab(activeTab) {
  if (!activeTab?.id || !originFromUrl(activeTab.url)) return "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: readActivePageStageCode
    });
    return normalizeStageCode(results?.[0]?.result);
  } catch (error) {
    return "";
  }
}

async function loadState() {
  const activeTab = await getActiveTab();
  detectedOrigin = originFromUrl(activeTab?.url);
  const activeStageCode = await getStageCodeFromActiveTab(activeTab);
  const stored = await chrome.storage.local.get([
    "appOrigin",
    "stageCode",
    "controllerCount",
    "playerNames",
    "spawnedControllers"
  ]);

  detectedOrigin = detectedOrigin || stored.appOrigin || "";
  appOrigin.textContent = detectedOrigin ? `Target: ${detectedOrigin}` : "Open a Flip 7 page first";
  stageCodeInput.value = activeStageCode || stored.stageCode || "";
  controllerCountInput.value = stored.controllerCount || "4";
  playerNamesInput.value = stored.playerNames || DEFAULT_NAMES.join("\n");
  setStatus(`${(stored.spawnedControllers || []).length} spawned controller windows tracked.`);
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

function distanceBetweenPoints(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function getActiveDisplayWorkArea() {
  const currentWindow = await chrome.windows.getCurrent();
  const fallback = {
    left: currentWindow.left || 0,
    top: currentWindow.top || 0,
    width: currentWindow.width || 1280,
    height: currentWindow.height || 800
  };

  if (!chrome.system?.display?.getInfo) return fallback;

  try {
    const displays = await chrome.system.display.getInfo();
    const windowCenter = {
      x: fallback.left + fallback.width / 2,
      y: fallback.top + fallback.height / 2
    };
    const containingDisplay = displays.find((display) => {
      const bounds = display.bounds;
      return windowCenter.x >= bounds.left &&
        windowCenter.x <= bounds.left + bounds.width &&
        windowCenter.y >= bounds.top &&
        windowCenter.y <= bounds.top + bounds.height;
    });
    const nearestDisplay = containingDisplay || displays
      .map((display) => ({
        display,
        distance: distanceBetweenPoints(windowCenter, {
          x: display.bounds.left + display.bounds.width / 2,
          y: display.bounds.top + display.bounds.height / 2
        })
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.display;
    return nearestDisplay?.workArea || nearestDisplay?.bounds || fallback;
  } catch (error) {
    return fallback;
  }
}

function controllerGrid(totalControllers) {
  if (totalControllers > 6) return { columns: 3, rows: 3 };
  if (totalControllers > 4) return { columns: 2, rows: 3 };
  return { columns: 2, rows: 2 };
}

async function getControllerWindowLayout(index, totalControllers = 4) {
  const workArea = await getActiveDisplayWorkArea();
  const gap = 14;
  const { columns, rows } = controllerGrid(totalControllers);
  const availableWidth = Math.max(720, workArea.width);
  const availableHeight = Math.max(640, workArea.height);
  const clusterWidthRatio = rows === 3 ? 0.34 : 0.42;
  const clusterMaxWidth = Math.min(availableWidth - 36, availableWidth * clusterWidthRatio);
  const controllerHeight = Math.max(250, Math.floor((availableHeight - (rows - 1) * gap - 36) / rows));
  const controllerWidth = Math.max(230, Math.min(330, Math.floor((clusterMaxWidth - (columns - 1) * gap) / columns)));
  const slot = index % (columns * rows);
  const cycle = Math.floor(index / (columns * rows));
  const column = slot % columns;
  const row = Math.floor(slot / columns);
  const clusterWidth = columns * controllerWidth + (columns - 1) * gap;
  const startLeft = Math.max(
    workArea.left,
    workArea.left + workArea.width - clusterWidth - 18
  );
  const startTop = Math.max(workArea.top, workArea.top + 18);
  const cycleOffset = Math.min(48, cycle * 18);

  return {
    width: controllerWidth,
    height: controllerHeight,
    left: Math.round(startLeft + column * (controllerWidth + gap) + cycleOffset),
    top: Math.round(startTop + row * (controllerHeight + gap) + cycleOffset)
  };
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
    const layout = await getControllerWindowLayout(index, count);
    const controllerWindow = await chrome.windows.create({
      focused: true,
      type: "popup",
      url: controllerUrl({ origin: detectedOrigin, stageCode, playerName, index }),
      ...layout
    });
    if (controllerWindow.id) {
      await chrome.windows.update(controllerWindow.id, { focused: true });
    }
    const tab = controllerWindow.tabs?.[0];
    spawnedControllers.push({
      windowId: controllerWindow.id,
      tabId: tab?.id,
      playerName,
      stageCode,
      spawnIndex: index,
      createdAt: Date.now()
    });
  }

  await chrome.storage.local.set({ spawnedControllers });
  spawnButton.disabled = false;
  setStatus(`Spawned ${spawnedControllers.length} controller window${spawnedControllers.length === 1 ? "" : "s"}.`);
}

function nameOrderMap(names) {
  const order = new Map();
  names.forEach((name, index) => {
    const key = name.toLowerCase();
    if (!order.has(key)) order.set(key, index);
  });
  return order;
}

async function sortControllers() {
  const stored = await chrome.storage.local.get(["spawnedControllers"]);
  const controllers = stored.spawnedControllers || [];
  if (controllers.length === 0) {
    setStatus("No spawned controller windows are tracked.");
    return;
  }

  sortControllersButton.disabled = true;
  const names = parseNames();
  const order = nameOrderMap(names);
  const stillOpen = [];

  for (const controller of controllers) {
    try {
      if (controller.windowId) {
        await chrome.windows.get(controller.windowId);
      } else if (controller.tabId) {
        await chrome.tabs.get(controller.tabId);
      } else {
        continue;
      }
      stillOpen.push(controller);
    } catch (error) {
      // Window or tab is gone.
    }
  }

  stillOpen.sort((a, b) => {
    const orderA = order.get(String(a.playerName || "").toLowerCase());
    const orderB = order.get(String(b.playerName || "").toLowerCase());
    const valueA = orderA ?? a.spawnIndex ?? 9999;
    const valueB = orderB ?? b.spawnIndex ?? 9999;
    return valueA - valueB;
  });

  for (let index = 0; index < stillOpen.length; index += 1) {
    const controller = stillOpen[index];
    if (!controller.windowId) continue;
    try {
      await chrome.windows.update(controller.windowId, {
        focused: false,
        ...(await getControllerWindowLayout(index, stillOpen.length))
      });
    } catch (error) {
      // Ignore windows that closed mid-sort.
    }
  }

  await chrome.storage.local.set({ spawnedControllers: stillOpen });
  sortControllersButton.disabled = false;
  setStatus(`Sorted ${stillOpen.length} controller window${stillOpen.length === 1 ? "" : "s"}.`);
}

function clickRandomVisibleButton() {
  const blockedLabels = new Set(["start game", "leave lobby", "leave", "back", "close", "log out", "logout", "disconnect"]);
  const buttons = Array.from(document.querySelectorAll("button"))
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
      const label = (button.textContent || button.getAttribute("aria-label") || "").trim().toLowerCase();
      return !disabled &&
        !blockedLabels.has(label) &&
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
    setStatus("No spawned controller windows are tracked.");
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

async function closeAllControllers() {
  const stored = await chrome.storage.local.get(["spawnedControllers"]);
  const controllers = stored.spawnedControllers || [];
  if (controllers.length === 0) {
    setStatus("No spawned controller windows are tracked.");
    return;
  }

  closeControllersButton.disabled = true;
  let closed = 0;

  for (const controller of controllers) {
    try {
      if (controller.windowId) {
        await chrome.windows.remove(controller.windowId);
        closed += 1;
        continue;
      }
      if (controller.tabId) {
        await chrome.tabs.remove(controller.tabId);
        closed += 1;
      }
    } catch (error) {
      // Already closed or no longer accessible.
    }
  }

  await chrome.storage.local.set({ spawnedControllers: [] });
  closeControllersButton.disabled = false;
  setStatus(`Closed ${closed} controller window${closed === 1 ? "" : "s"}.`);
}

stageCodeInput.addEventListener("input", () => {
  stageCodeInput.value = normalizeStageCode(stageCodeInput.value);
  persistInputs();
});
controllerCountInput.addEventListener("input", persistInputs);
playerNamesInput.addEventListener("input", persistInputs);
spawnButton.addEventListener("click", spawnControllers);
sortControllersButton.addEventListener("click", sortControllers);
tapRandomButton.addEventListener("click", tapRandomButtonsInControllers);
closeControllersButton.addEventListener("click", closeAllControllers);

loadState();
