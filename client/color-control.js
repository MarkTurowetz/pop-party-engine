(function attachPartyGameColorControl(global) {
  "use strict";

  const DEFAULT_PRESETS = ["#17131f", "#ffffff", "#fff8d6", "#ffe156", "#2458ff", "#22d3ee", "#ff4fa3", "#7c3aed"];

  function fallbackNormalizeColor(value) {
    const raw = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`.toLowerCase();
    return "";
  }

  function hexToRgb(hex, normalizeColor) {
    const normalized = normalizeColor(hex);
    if (!normalized) return null;
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16)
    };
  }

  function rgbToHex(rgb) {
    return `#${["r", "g", "b"].map((channel) => {
      const value = Math.max(0, Math.min(255, Number(rgb[channel]) || 0));
      return value.toString(16).padStart(2, "0");
    }).join("")}`;
  }

  function createColorControl(options = {}) {
    const documentRef = options.document || global.document;
    const normalizeColor = options.normalizeColor || fallbackNormalizeColor;
    const root = documentRef.createElement("section");
    root.className = ["color-control", options.className || ""].filter(Boolean).join(" ");
    const title = documentRef.createElement("span");
    title.className = "color-control-label";
    title.textContent = options.label || "Color";
    const row = documentRef.createElement("div");
    row.className = "color-control-row";
    const swatch = documentRef.createElement("span");
    swatch.className = "color-control-swatch";
    const input = documentRef.createElement("input");
    input.type = "text";
    input.inputMode = "text";
    input.spellcheck = false;
    input.maxLength = 7;
    const toggle = documentRef.createElement("button");
    toggle.type = "button";
    toggle.className = "color-control-toggle";
    toggle.textContent = "RGB";
    toggle.setAttribute("aria-expanded", "false");
    const details = documentRef.createElement("div");
    details.className = "color-control-details";
    const actions = documentRef.createElement("div");
    actions.className = "color-control-actions";
    const applyButton = documentRef.createElement("button");
    applyButton.type = "button";
    applyButton.className = "color-control-apply";
    applyButton.textContent = "Apply";
    const resetButton = documentRef.createElement("button");
    resetButton.type = "button";
    resetButton.className = "color-control-reset";
    resetButton.textContent = "Reset";
    actions.append(applyButton, resetButton);
    const sliders = ["r", "g", "b"].map((channel) => {
      const wrap = documentRef.createElement("label");
      wrap.className = "color-control-slider";
      wrap.textContent = channel.toUpperCase();
      const slider = documentRef.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "255";
      slider.step = "1";
      slider.dataset.channel = channel;
      wrap.appendChild(slider);
      return { channel, slider, wrap };
    });
    let historyCaptured = false;
    let currentValue = normalizeColor(options.value) || "#ffffff";
    let draftValue = currentValue;

    function setDirty(isDirty) {
      root.classList.toggle("is-dirty", Boolean(isDirty));
      applyButton.disabled = !isDirty;
      resetButton.disabled = !isDirty;
    }

    function setControls(hex, { syncText = true } = {}) {
      const rgb = hexToRgb(hex, normalizeColor) || { r: 255, g: 255, b: 255 };
      const normalized = rgbToHex(rgb);
      draftValue = normalized;
      if (syncText) input.value = normalized.toUpperCase();
      swatch.style.background = normalized;
      for (const item of sliders) {
        item.slider.value = String(rgb[item.channel]);
      }
      setDirty(draftValue !== currentValue);
    }

    function currentSliderColor() {
      return rgbToHex(Object.fromEntries(sliders.map((item) => [item.channel, Number(item.slider.value)])));
    }

    function previewDraft(hex, { syncText = true } = {}) {
      const normalized = normalizeColor(hex);
      if (!normalized) return false;
      setControls(normalized, { syncText });
      return true;
    }

    function commitColor(hex, { sync = true } = {}) {
      const normalized = normalizeColor(hex);
      if (!normalized) {
        setControls(currentValue);
        return false;
      }
      if (normalized === currentValue && draftValue === currentValue) {
        setControls(currentValue);
        setDirty(false);
        return false;
      }
      currentValue = normalized;
      const captureHistory = !historyCaptured;
      if (sync) setControls(normalized);
      setDirty(false);
      options.onChange?.(normalized, { captureHistory, commit: true, previewOnly: false });
      historyCaptured = true;
      return true;
    }

    root.addEventListener("pointerdown", (event) => {
      historyCaptured = false;
      event.stopPropagation();
    });
    root.addEventListener("click", (event) => event.stopPropagation());
    global.PartyGameToolAffordances?.bindScrollStableControls?.(root);
    toggle.addEventListener("click", () => {
      const expanded = !root.classList.contains("is-expanded");
      root.classList.toggle("is-expanded", expanded);
      toggle.setAttribute("aria-expanded", String(expanded));
    });
    setControls(currentValue);
    setDirty(false);
    input.addEventListener("focus", () => {
      historyCaptured = false;
    });
    input.addEventListener("input", () => {
      const normalized = normalizeColor(input.value);
      if (normalized) previewDraft(normalized, { syncText: false });
    });
    input.addEventListener("change", () => {
      commitColor(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitColor(input.value);
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setControls(currentValue);
        input.blur();
      }
    });
    for (const item of sliders) {
      item.slider.addEventListener("input", () => {
        previewDraft(currentSliderColor());
      });
    }
    applyButton.addEventListener("click", () => commitColor(draftValue));
    resetButton.addEventListener("click", () => setControls(currentValue));
    row.append(swatch, input, toggle);
    details.append(...sliders.map((item) => item.wrap));
    details.appendChild(actions);
    const presets = Array.isArray(options.presets) && options.presets.length ? options.presets : DEFAULT_PRESETS;
    const presetRow = documentRef.createElement("div");
    presetRow.className = "color-control-presets";
    for (const preset of presets) {
      const normalizedPreset = normalizeColor(preset);
      if (!normalizedPreset) continue;
      const button = documentRef.createElement("button");
      button.type = "button";
      button.style.setProperty("--preset-color", normalizedPreset);
      button.setAttribute("aria-label", normalizedPreset);
      button.addEventListener("click", () => commitColor(normalizedPreset));
      presetRow.appendChild(button);
    }
    details.appendChild(presetRow);
    root.append(title, row, details);
    return root;
  }

  const api = { create: createColorControl, normalize: fallbackNormalizeColor };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameColorControl = api;
})(typeof window !== "undefined" ? window : globalThis);
