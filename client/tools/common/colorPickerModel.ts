export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type HsvColor = {
  h: number;
  s: number;
  v: number;
};

function clamp(value: unknown, min: number, max: number): number {
  const numberValue = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(numberValue) ? numberValue : min));
}

export function clampColorChannel(value: unknown): number {
  return Math.round(clamp(value, 0, 255));
}

function hexChannel(value: unknown): string {
  return clampColorChannel(value).toString(16).padStart(2, "0");
}

function expandedHex(value: string): string {
  if (value.length !== 3 && value.length !== 4) return value;
  return [...value].map((character) => `${character}${character}`).join("");
}

export function parseColorValue(value: unknown): RgbaColor | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const rawHex = raw.startsWith("#") ? raw.slice(1) : raw;
  const hex = expandedHex(rawHex);
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255
    };
  }

  const rgbMatch = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/i);
  if (!rgbMatch) return null;
  const alphaText = rgbMatch[4];
  const alpha = !alphaText
    ? 255
    : alphaText.endsWith("%")
      ? Math.round((clamp(Number.parseFloat(alphaText), 0, 100) / 100) * 255)
      : Math.round(clamp(Number.parseFloat(alphaText), 0, 1) * 255);
  return {
    r: clampColorChannel(rgbMatch[1]),
    g: clampColorChannel(rgbMatch[2]),
    b: clampColorChannel(rgbMatch[3]),
    a: alpha
  };
}

export function colorValueFromRgba(color: RgbaColor, keepOpaqueAlpha = false): string {
  const base = `#${hexChannel(color.r)}${hexChannel(color.g)}${hexChannel(color.b)}`;
  const alpha = clampColorChannel(color.a);
  return keepOpaqueAlpha || alpha < 255 ? `${base}${hexChannel(alpha)}` : base;
}

export function rgbaToHsv(color: RgbaColor): HsvColor {
  const r = clampColorChannel(color.r) / 255;
  const g = clampColorChannel(color.g) / 255;
  const b = clampColorChannel(color.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
}

export function hsvToRgba(hsv: HsvColor, alpha = 255): RgbaColor {
  const h = ((clamp(hsv.h, 0, 360) % 360) + 360) % 360;
  const s = clamp(hsv.s, 0, 1);
  const v = clamp(hsv.v, 0, 1);
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = v - chroma;
  let rgb: [number, number, number];
  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return {
    r: Math.round((rgb[0] + match) * 255),
    g: Math.round((rgb[1] + match) * 255),
    b: Math.round((rgb[2] + match) * 255),
    a: clampColorChannel(alpha)
  };
}

export function colorAlphaPercent(color: RgbaColor): number {
  return Math.round((clampColorChannel(color.a) / 255) * 100);
}

export function colorWithAlphaPercent(color: RgbaColor, percent: unknown): RgbaColor {
  return { ...color, a: Math.round((clamp(percent, 0, 100) / 100) * 255) };
}
