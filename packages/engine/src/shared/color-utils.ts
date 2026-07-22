// TypeScript source for the dual-use color helpers. Built inside the engine via
// `npm run build:shared`; the emitted .js is mirrored to shared/ so a plain `node server.js` deploy
// needs no build step. Authored as a classic script (IIFE, no top-level import/export) so
// the emitted .js works as BOTH a CommonJS module (server require) and a browser global
// (client bootLegacySurface), matching the rest of shared/.

(function attachPartyGameColorUtils(global: Record<string, unknown>): void {
  "use strict";

  interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
  }

  function clampChannel(value: unknown): number {
    return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  }

  function channelToHex(value: unknown): string {
    return clampChannel(value).toString(16).padStart(2, "0");
  }

  function normalizeColor(value: unknown): string {
    const raw = String(value || "").trim();
    const hex = raw.startsWith("#") ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return "";
    const normalized = `#${hex.toLowerCase()}`;
    return normalized.length === 9 && normalized.endsWith("ff") ? normalized.slice(0, 7) : normalized;
  }

  function colorToRgba(value: unknown): Rgba | null {
    const normalized = normalizeColor(value);
    if (!normalized) return null;
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
      a: normalized.length === 9 ? Number.parseInt(normalized.slice(7, 9), 16) : 255
    };
  }

  function rgbaToColor(
    rgba: Partial<Rgba> | null | undefined,
    { keepOpaqueAlpha = false }: { keepOpaqueAlpha?: boolean } = {}
  ): string {
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
})((typeof window !== "undefined" ? window : globalThis) as unknown as Record<string, unknown>);
