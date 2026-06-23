(function attachPartyGameColorUtils(global) {
  "use strict";

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  }

  function channelToHex(value) {
    return clampChannel(value).toString(16).padStart(2, "0");
  }

  function normalizeColor(value) {
    const raw = String(value || "").trim();
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return "";
    const normalized = `#${hex.toLowerCase()}`;
    return normalized.length === 9 && normalized.endsWith("ff") ? normalized.slice(0, 7) : normalized;
  }

  function colorToRgba(value) {
    const normalized = normalizeColor(value);
    if (!normalized) return null;
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
      a: normalized.length === 9 ? Number.parseInt(normalized.slice(7, 9), 16) : 255
    };
  }

  function rgbaToColor(rgba, { keepOpaqueAlpha = false } = {}) {
    const alpha = clampChannel(rgba?.a ?? 255);
    const base = `#${channelToHex(rgba?.r)}${channelToHex(rgba?.g)}${channelToHex(rgba?.b)}`;
    return keepOpaqueAlpha || alpha < 255 ? `${base}${channelToHex(alpha)}` : base;
  }

  const api = {
    colorToRgba,
    normalizeColor,
    rgbaToColor
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameColorUtils = api;
  global.normalizeUiColor = normalizeColor;
})(typeof window !== "undefined" ? window : globalThis);
