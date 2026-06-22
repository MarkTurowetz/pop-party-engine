function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeStageCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function generateStageCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[randomBetween(0, alphabet.length - 1)];
  }
  return code;
}

function getStageCodeFromUrl() {
  return normalizeStageCode(params.get("stage") || params.get("code"));
}

function getPlayerNameFromUrl() {
  return String(params.get("name") || params.get("playerName") || "").trim().slice(0, 24);
}

function shouldAutoJoin() {
  return params.get("autojoin") === "1" || params.get("join") === "1";
}

function syncAppHeight() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}

function shouldAllowControllerTouch(target) {
  return Boolean(target?.closest?.("input, textarea, select, .avatar-picker-grid"));
}

function lockControllerViewport() {
  syncAppHeight();
  document.documentElement.classList.add("controller-locked");
  document.body.classList.add("controller-locked");
  window.scrollTo(0, 0);
  window.addEventListener("resize", syncAppHeight);
  window.addEventListener("orientationchange", syncAppHeight);
  window.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
  window.addEventListener("touchmove", (event) => {
    if (!shouldAllowControllerTouch(event.target)) event.preventDefault();
  }, { passive: false });
  window.addEventListener("contextmenu", (event) => {
    if (!shouldAllowControllerTouch(event.target)) event.preventDefault();
  });
  window.addEventListener("selectstart", (event) => {
    if (!shouldAllowControllerTouch(event.target)) event.preventDefault();
  });
  window.addEventListener("dragstart", (event) => event.preventDefault());
  window.addEventListener("gesturestart", (event) => event.preventDefault());
  document.addEventListener("selectionchange", () => {
    if (document.activeElement?.matches?.("input, textarea")) return;
    window.getSelection()?.removeAllRanges();
  });
}

function bindButtonPress(button) {
  const pressButton = () => {
    if (button.disabled) return;
    window.clearTimeout(button.releaseTimerId);
    button.classList.remove("is-releasing");
    button.classList.add("is-pressed");
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* optional */ }
  };
  const releaseButton = () => {
    if (!button.classList.contains("is-pressed")) return;
    button.classList.add("is-releasing");
    button.classList.remove("is-pressed");
    window.clearTimeout(button.releaseTimerId);
    button.releaseTimerId = window.setTimeout(() => button.classList.remove("is-releasing"), 140);
  };
  button.addEventListener("pointerdown", pressButton);
  button.addEventListener("pointerup", releaseButton);
  button.addEventListener("pointercancel", releaseButton);
  button.addEventListener("pointerleave", releaseButton);
  button.addEventListener("blur", releaseButton);
  let touchStarted = false;
  button.addEventListener("touchstart", (e) => { e.preventDefault(); touchStarted = true; pressButton(); }, { passive: false });
  button.addEventListener("touchend", (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const endedOn = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null;
    releaseButton();
    if (touchStarted && (endedOn === button || button.contains(endedOn)) && !button.disabled) button.click();
    touchStarted = false;
  }, { passive: false });
  button.addEventListener("touchcancel", (e) => { e.preventDefault(); touchStarted = false; releaseButton(); }, { passive: false });
  button.addEventListener("dblclick", (e) => e.preventDefault());
}

function bindControllerButtonPressStates() {
  const pressableButtons = controllerScreen.querySelectorAll("button");
  let lastHapticAt = 0;
  const pulseHaptic = () => {
    if (!navigator.vibrate) return;
    const now = Date.now();
    if (now - lastHapticAt < 80) return;
    lastHapticAt = now;
    try {
      navigator.vibrate(8);
    } catch (error) {
      // Haptics are optional and browser/device dependent.
    }
  };
  const pressButton = (button) => {
    if (button.disabled) return;
    window.clearTimeout(button.releaseTimerId);
    button.classList.remove("is-releasing");
    button.classList.add("is-pressed");
    pulseHaptic();
  };
  const releaseButton = (button) => {
    if (!button.classList.contains("is-pressed")) return;
    button.classList.add("is-releasing");
    button.classList.remove("is-pressed");
    window.clearTimeout(button.releaseTimerId);
    button.releaseTimerId = window.setTimeout(() => {
      button.classList.remove("is-releasing");
    }, 140);
  };
  const releaseButtons = () => {
    for (const button of pressableButtons) releaseButton(button);
  };
  for (const button of pressableButtons) {
    let touchStartedOnButton = false;
    button.addEventListener("pointerdown", () => {
      window.getSelection()?.removeAllRanges();
      pressButton(button);
    });
    button.addEventListener("touchstart", (event) => {
      event.preventDefault();
      touchStartedOnButton = true;
      window.getSelection()?.removeAllRanges();
      pressButton(button);
    }, { passive: false });
    button.addEventListener("touchend", (event) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      const endTarget = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null;
      const endedOnButton = endTarget === button || button.contains(endTarget);
      releaseButton(button);
      if (touchStartedOnButton && endedOnButton && !button.disabled) button.click();
      touchStartedOnButton = false;
    }, { passive: false });
    button.addEventListener("touchcancel", (event) => {
      event.preventDefault();
      touchStartedOnButton = false;
      releaseButton(button);
    }, { passive: false });
    button.addEventListener("dblclick", (event) => event.preventDefault());
    button.addEventListener("pointerup", () => releaseButton(button));
    button.addEventListener("pointercancel", () => releaseButton(button));
    button.addEventListener("pointerleave", () => releaseButton(button));
    button.addEventListener("blur", () => releaseButton(button));
  }
  window.addEventListener("pointerup", releaseButtons);
  window.addEventListener("pointercancel", releaseButtons);
}

function getOrCreateStageCode() {
  const existing = getStageCodeFromUrl();
  if (existing) return existing;
  const next = generateStageCode();
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("stage", next);
  window.history.replaceState({}, "", `${window.location.pathname}?${nextParams.toString()}`);
  return next;
}

function getSessionValue(key) {
  return sessionStorage.getItem(key) || "";
}

function getLocalValue(key) {
  return localStorage.getItem(key) || "";
}

function setSessionValue(key, value) {
  sessionStorage.setItem(key, value);
}

function setLocalValue(key, value) {
  localStorage.setItem(key, value);
}

function getLocalJsonArray(key) {
  try {
    const value = JSON.parse(getLocalValue(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function removeSessionValue(key) {
  sessionStorage.removeItem(key);
}

function getControllerPlayerId() {
  const explicit = params.get("player");
  if (explicit) return explicit;
  const existing = getSessionValue("partyTemplatePlayerId");
  if (existing) return existing;
  const next = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setSessionValue("partyTemplatePlayerId", next);
  return next;
}

function avatarClass(shape) {
  return `shape-${shape || "rex"}`;
}

function cssUrl(url) {
  return `url('${String(url || "").replaceAll("'", "%27")}')`;
}

function artAssetUrl(assetId) {
  return artAssetUrls.get(assetId) || "";
}

function dinoIcon(shape) {
  const species = avatarAssetIds[shape] ? shape : "rex";
  const url = artAssetUrl(avatarAssetIds[species]);
  return `<span class="dino-icon dino-${species}" style="--dino-url:${cssUrl(url)}"></span>`;
}

function avatarFrameImage() {
  return `<img class="avatar-frame-art" alt="" src="${artAssetUrl("avatar-frame")}">`;
}

function avatarLabel(shape) {
  return avatarComposites.find((composite) => composite.species === shape)?.name.replace("Player Avatar ", "") || shape;
}

function applyArtAssets(assets, groups = artGroups) {
  artAssets = assets || [];
  artGroups = groups || [];
  for (const asset of artAssets) {
    artAssetUrls.set(asset.id, asset.currentUrl);
  }
  document.documentElement.style.setProperty("--click-cursor-url", cssUrl(artAssetUrl("presentation-click-cursor")));
}

async function loadArtAssets() {
  if (!canUseServer) {
    applyArtAssets([]);
    return [];
  }
  const result = await getJson("/api/art-assets");
  applyArtAssets(result.assets || [], result.groups || []);
  return artAssets;
}

async function postJson(path, payload) {
  if (!canUseServer) throw new Error("Open this app through the server first.");
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    const error = new Error(result.error || "Something went wrong.");
    error.code = result.errorCode || "";
    error.status = response.status;
    throw error;
  }
  return result;
}

async function getJson(path) {
  const response = await fetch(`${origin}${path}`, { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "Something went wrong.");
  }
  return result;
}
