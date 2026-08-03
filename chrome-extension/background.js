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

const commandHandlers = {
  "spawn-controllers": spawnControllersFromCommand,
  "tap-random-option": tapRandomOptionsFromCommand,
  "submit-random-text": submitRandomTextFromCommand
};
let lastCommandRun = { command: "", at: 0 };

function normalizeStageCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function parseNames(value) {
  return String(value || DEFAULT_NAMES.join("\n"))
    .split(/\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
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

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
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

async function getCommandContext() {
  const activeTab = await getActiveTab();
  const stored = await chrome.storage.local.get([
    "appOrigin",
    "stageCode",
    "controllerCount",
    "playerNames",
    "spawnedControllers"
  ]);
  const detectedOrigin = originFromUrl(activeTab?.url) || stored.appOrigin || "";
  const activeStageCode = await getStageCodeFromActiveTab(activeTab);
  return {
    appOrigin: detectedOrigin,
    controllerCount: Math.max(1, Math.min(50, Number.parseInt(stored.controllerCount, 10) || 4)),
    playerNames: parseNames(stored.playerNames),
    spawnedControllers: stored.spawnedControllers || [],
    stageCode: normalizeStageCode(activeStageCode || stored.stageCode)
  };
}

function controllerUrl({ origin, stageCode, playerName, index }) {
  const params = new URLSearchParams();
  params.set("stage", stageCode);
  params.set("name", playerName);
  params.set("autojoin", "1");
  params.set("player", `spawn-${stageCode.toLowerCase()}-${Date.now()}-${index}`);
  return `${origin}/controller?${params.toString()}`;
}

function controllerGrid(totalControllers) {
  if (totalControllers > 6) return { columns: 3, rows: 3 };
  if (totalControllers > 4) return { columns: 2, rows: 3 };
  return { columns: 2, rows: 2 };
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
  const startLeft = Math.max(workArea.left, workArea.left + workArea.width - clusterWidth - 18);
  const startTop = Math.max(workArea.top, workArea.top + 18);
  const cycleOffset = Math.min(48, cycle * 18);
  return {
    width: controllerWidth,
    height: controllerHeight,
    left: Math.round(startLeft + column * (controllerWidth + gap) + cycleOffset),
    top: Math.round(startTop + row * (controllerHeight + gap) + cycleOffset)
  };
}

async function closeTrackedControllers({ silent = false } = {}) {
  const { spawnedControllers } = await getCommandContext();
  if (!spawnedControllers.length) return;
  for (const controller of spawnedControllers) {
    try {
      if (controller.windowId) await chrome.windows.remove(controller.windowId);
      else if (controller.tabId) await chrome.tabs.remove(controller.tabId);
    } catch (error) {
      // Already closed.
    }
  }
  if (!silent) await chrome.storage.local.set({ spawnedControllers: [] });
}

async function spawnControllersFromCommand() {
  const context = await getCommandContext();
  if (!context.appOrigin || !context.stageCode || !context.playerNames.length) return;
  await closeTrackedControllers({ silent: true });
  const spawnedControllers = [];
  for (let index = 0; index < context.controllerCount; index += 1) {
    const playerName = context.playerNames[index % context.playerNames.length];
    const controllerWindow = await chrome.windows.create({
      focused: true,
      type: "popup",
      url: controllerUrl({ origin: context.appOrigin, stageCode: context.stageCode, playerName, index }),
      ...(await getControllerWindowLayout(index, context.controllerCount))
    });
    const tab = controllerWindow.tabs?.[0];
    spawnedControllers.push({
      windowId: controllerWindow.id,
      tabId: tab?.id,
      playerName,
      stageCode: context.stageCode,
      spawnIndex: index,
      createdAt: Date.now()
    });
  }
  await chrome.storage.local.set({
    appOrigin: context.appOrigin,
    stageCode: context.stageCode,
    spawnedControllers
  });
}

function findRandomVisibleOption() {
  const options = Array.from(document.querySelectorAll("[data-controller-option]"))
    .filter((option) => {
      const rect = option.getBoundingClientRect();
      const style = window.getComputedStyle(option);
      const disabled = option.disabled || option.getAttribute("aria-disabled") === "true";
      return !disabled &&
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.pointerEvents !== "none";
    });
  if (!options.length) return { found: false };
  const option = options[Math.floor(Math.random() * options.length)];
  const rect = option.getBoundingClientRect();
  return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function dispatchTrustedClick(tabId, x, y) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function tapRandomOptionsFromCommand() {
  const { spawnedControllers } = await getCommandContext();
  const stillOpen = [];
  for (const controller of spawnedControllers) {
    if (!controller.tabId) continue;
    try {
      await chrome.tabs.get(controller.tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: controller.tabId },
        func: findRandomVisibleOption
      });
      const result = results?.[0]?.result;
      if (result?.found) {
        if (controller.windowId) await chrome.windows.update(controller.windowId, { focused: true }).catch(() => {});
        await chrome.tabs.update(controller.tabId, { active: true }).catch(() => {});
        await dispatchTrustedClick(controller.tabId, result.x, result.y);
      }
      stillOpen.push(controller);
    } catch (error) {
      // Closed or inaccessible.
    }
  }
  await chrome.storage.local.set({ spawnedControllers: stillOpen });
}

function findTextInputAndFill() {
  const textState = document.querySelector("#controllerTextState");
  const textInput = document.querySelector("#controllerTextInput");
  const submitButton = document.querySelector("#controllerTextSubmitButton");
  if (!textInput || !submitButton) return { found: false };
  const style = window.getComputedStyle(textState || textInput);
  if (style.display === "none" || textState?.classList.contains("hidden")) return { found: false };
  const playerName = document.querySelector("#controllerScreen")?.dataset.playerName?.trim()
    || "Player";
  textInput.value = `${playerName} Text response`;
  textInput.dispatchEvent(new Event("input", { bubbles: true }));
  const rect = submitButton.getBoundingClientRect();
  return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function submitRandomTextFromCommand() {
  const { spawnedControllers } = await getCommandContext();
  const stillOpen = [];
  for (const controller of spawnedControllers) {
    if (!controller.tabId) continue;
    try {
      await chrome.tabs.get(controller.tabId);
      const results = await chrome.scripting.executeScript({
        target: { tabId: controller.tabId },
        func: findTextInputAndFill
      });
      const result = results?.[0]?.result;
      if (result?.found) await dispatchTrustedClick(controller.tabId, result.x, result.y);
      stillOpen.push(controller);
    } catch (error) {
      // Closed or inaccessible.
    }
  }
  await chrome.storage.local.set({ spawnedControllers: stillOpen });
}

function runCommand(task) {
  task().catch((error) => {
    console.warn("Party Game Controller Spawner command failed", error);
  });
}

function runNamedCommand(command) {
  const task = commandHandlers[command];
  if (!task) return false;
  const now = Date.now();
  if (lastCommandRun.command === command && now - lastCommandRun.at < 500) return true;
  lastCommandRun = { command, at: now };
  runCommand(task);
  return true;
}

chrome.commands.onCommand.addListener((command) => {
  runNamedCommand(command);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "party-game-hotkey-command") return false;
  const handled = runNamedCommand(message.command);
  sendResponse({ ok: handled });
  return false;
});
