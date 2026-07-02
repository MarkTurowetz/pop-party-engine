import { gameTextDefaultFontFamily, normalizeGameTextFontFamily } from "../textFonts";

// Typed port of the legacy client/text-fit.js IIFE. Behaviour is preserved 1:1;
// the public API is both exported (for TS consumers) and assigned to window
// (PartyGameTextFit + fittedLayoutTextSize) so the still-legacy stage/controller
// runtime scripts keep working through their existing globals.

type Dict = Record<string, unknown>;
type TextTarget = HTMLElement | null | undefined;

const defaultOptions = {
  fontFamily: gameTextDefaultFontFamily,
  fontStyle: "normal",
  fontWeight: "1000",
  lineHeight: 1,
  minSize: 6,
  maxSize: 260
};

function num(value: unknown): number {
  return Number(value as number);
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number.parseFloat(value as string);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLineHeight(value: unknown, fallback: number): number {
  if (value === "normal") return fallback;
  const parsed = Number.parseFloat(value as string);
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 4) return parsed;
  return fallback;
}

function applyTextTransform(text: string, transform: unknown): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
  return text;
}

function computedStyleFor(target: TextTarget): CSSStyleDeclaration | null {
  if (!target || typeof window.getComputedStyle !== "function") return null;
  try {
    return window.getComputedStyle(target);
  } catch {
    return null;
  }
}

function normalizeTextFieldElement(element: Dict = {}, defaults: Dict = {}): Dict {
  const source = element && typeof element === "object" ? element : {};
  const fallback = defaults && typeof defaults === "object" ? defaults : {};
  const surface = String(source.surface || fallback.surface || "stage");
  const fontFallback = surface === "controller" ? 42 : 58;
  const colorFallback = surface === "controller" ? "#17131f" : "#ffffff";
  return {
    ...fallback,
    ...source,
    kind: "text",
    defaultText: String(source.defaultText ?? fallback.defaultText ?? ""),
    fontSize: positiveNumber(source.fontSize ?? fallback.fontSize, fontFallback),
    autoFitText: source.autoFitText !== false && fallback.autoFitText !== false,
    fontColor: String(source.fontColor || fallback.fontColor || colorFallback),
    fontFamily: normalizeGameTextFontFamily(source.fontFamily ?? fallback.fontFamily)
  };
}

function resolveLayoutTextSource(target: TextTarget, element: Dict, runtimeText?: unknown, options: Dict = {}): string {
  if (Object.prototype.hasOwnProperty.call(options, "text")) return String(options.text ?? "");
  if (options.useRuntimeText !== false && arguments.length >= 3) return String(runtimeText ?? "");
  const datasetSource = target?.dataset?.textFitSource;
  if (datasetSource !== undefined) return String(datasetSource);
  if (options.existingText !== undefined) return String(options.existingText ?? "");
  return String((element as Dict)?.defaultText ?? "");
}

function fixedTextLayout(element: Dict | undefined, text: unknown, fontSize: unknown, options: Dict = {}): Dict {
  const size = positiveNumber(fontSize, positiveNumber(element?.fontSize, defaultOptions.minSize));
  const width = Math.max(1, num(element?.width || 1));
  const height = Math.max(1, num(element?.height || 1));
  const lineHeight = normalizeLineHeight(options.lineHeight, defaultOptions.lineHeight);
  const lines = String(text ?? "").split("\n");
  return {
    fontSize: size,
    fontFamily: normalizeGameTextFontFamily(options.fontFamily),
    fontStyle: options.fontStyle || defaultOptions.fontStyle,
    fontWeight: String(options.fontWeight || defaultOptions.fontWeight),
    height,
    lineBoxHeight: size * lineHeight,
    inkHeight: size,
    lineGap: 0,
    lineHeight,
    lines,
    metrics: lines.map((line) => ({ width: String(line || "").length * size * 0.62, ascent: size * 0.75, descent: size * 0.25 })),
    maxWidth: Math.max(0, ...lines.map((line) => String(line || "").length * size * 0.62)),
    ascent: size * 0.75,
    descent: size * 0.25,
    baselineShift: 0,
    boxWidth: width,
    boxHeight: height,
    targetWidth: width,
    targetHeight: height,
    offsetX: 0,
    offsetY: 0
  };
}

function fittedLayoutTextSize(element: Dict | undefined, _text?: unknown, fallbackSize?: unknown): number {
  return positiveNumber(fallbackSize ?? element?.fontSize, defaultOptions.minSize);
}

function fitTextLayout(element: Dict | undefined, text: unknown, fallbackSize: unknown, options: Dict = {}): Dict {
  return fixedTextLayout(element, text, fallbackSize, options);
}

function measuredTextLayout(element: Dict | undefined, text: unknown, fallbackSize: unknown, options: Dict = {}): Dict {
  return fixedTextLayout(element, text, fallbackSize, options);
}

function measureGameText(config: Dict = {}): Dict {
  const text = String(config.text ?? "");
  const element = (config.element || config.spec || {}) as Dict;
  const fallbackSize = num(config.fallbackSize ?? element.fontSize ?? defaultOptions.minSize);
  return fixedTextLayout(element, text, fallbackSize, (config.options as Dict) || {});
}

function renderPlainTextBox(target: TextTarget, text: unknown, spec: Dict = {}, options: Dict = {}): Dict | null {
  if (!target) return null;
  const computed = computedStyleFor(target);
  const fontSize = positiveNumber(spec.fontSize, positiveNumber(computed?.fontSize, defaultOptions.minSize));
  const lineHeight = normalizeLineHeight(options.lineHeight || spec.lineHeight || computed?.lineHeight, defaultOptions.lineHeight);
  const fontColor = (spec.fontColor || options.fontColor || computed?.color || "") as string;
  const fontFamily = normalizeGameTextFontFamily(options.fontFamily || spec.fontFamily || computed?.fontFamily);
  const fontStyle = (options.fontStyle || spec.fontStyle || computed?.fontStyle || defaultOptions.fontStyle) as string;
  const fontWeight = String(options.fontWeight || spec.fontWeight || computed?.fontWeight || defaultOptions.fontWeight);
  const textValue = applyTextTransform(String(text ?? ""), options.textTransform || computed?.textTransform || "none");

  if (target.dataset) target.dataset.textFitSource = String(text ?? "");
  target.setAttribute?.("aria-label", String(text ?? ""));
  if (fontColor) target.style.setProperty("color", fontColor, "important");
  Object.assign(target.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    textAlign: "center",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    lineHeight: String(lineHeight),
    fontSize: `${fontSize}px`,
    fontFamily,
    fontStyle,
    fontWeight
  });
  target.textContent = textValue;
  return fixedTextLayout(spec, textValue, fontSize, { ...options, lineHeight, fontFamily, fontStyle, fontWeight });
}

function renderLayoutTextField(target: TextTarget, element: Dict, options: Dict = {}): Dict | null {
  if (!target) return null;
  const textElement = normalizeTextFieldElement(element, (options.defaults as Dict) || {});
  const hasRuntimeText = Object.prototype.hasOwnProperty.call(options, "text");
  const text = hasRuntimeText
    ? resolveLayoutTextSource(target, textElement, options.text, options)
    : resolveLayoutTextSource(target, textElement, undefined, { ...options, useRuntimeText: false });
  return renderPlainTextBox(target, text, textElement, (options.renderOptions as Dict) || (options.options as Dict) || {});
}

function renderRuntimeText(target: TextTarget, text: unknown, spec: Dict = {}, options: Dict = {}): Dict | null {
  return renderPlainTextBox(target, String(text ?? ""), spec, options);
}

function renderGameText(target: TextTarget, config: Dict = {}): Dict | null {
  if (!target) return null;
  const text = String(config.text ?? "");
  const element = (config.element || config.spec || config.layout || {}) as Dict;
  return renderPlainTextBox(
    target,
    text,
    { ...element, fontSize: config.fallbackSize ?? element.fontSize },
    (config.options as Dict) || {}
  );
}

function renderTextBox(target: TextTarget, text: unknown, spec: Dict = {}, options: Dict = {}): Dict | null {
  if (!target) return null;
  const width = Math.max(1, num(spec.width || target.clientWidth || target.offsetWidth || 1));
  const height = Math.max(1, num(spec.height || target.clientHeight || target.offsetHeight || 1));
  if (spec.applySize !== false) {
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
  }
  return renderPlainTextBox(target, String(text ?? ""), { ...spec, width, height }, options);
}

function renderAutoTextElement(target: TextTarget, element: Dict, text: unknown, fallbackSize: unknown = null, options: Dict = {}): Dict | null {
  return renderPlainTextBox(target, String(text ?? ""), { ...element, fontSize: fallbackSize ?? element?.fontSize }, options);
}

function renderMeasuredTextElement(target: TextTarget, element: Dict, text: unknown, fallbackSize: unknown, options: Dict = {}): Dict | null {
  return renderAutoTextElement(target, element, text, fallbackSize, options);
}

function renderTextElement(target: TextTarget, text: unknown, layout: Dict | null = null): Dict | null {
  return renderPlainTextBox(target, String(text ?? ""), layout || {}, {});
}

function textRenderOptions(_element: Dict, options: Dict = {}): Dict {
  return { ...options, autoFit: false };
}

function targetTextRenderOptions(_target: TextTarget, element: Dict, options: Dict = {}): Dict {
  return textRenderOptions(element, options);
}

export const PartyGameTextFit = {
  constants: defaultOptions,
  fitTextLayout,
  fixedTextLayout,
  measuredTextLayout,
  fittedLayoutTextSize,
  measureGameText,
  measureFittedTextSize: fittedLayoutTextSize,
  normalizeTextFieldElement,
  renderLayoutTextField,
  renderAutoTextElement,
  renderGameText,
  renderRuntimeText,
  renderTextBox,
  renderTextElement,
  renderMeasuredTextElement,
  renderPlainTextBox,
  resolveLayoutTextSource,
  targetTextRenderOptions,
  textRenderOptions
};

export type PartyGameTextFitApi = typeof PartyGameTextFit;

declare global {
  interface Window {
    PartyGameTextFit?: PartyGameTextFitApi;
    fittedLayoutTextSize?: typeof fittedLayoutTextSize;
  }
}

/** Install the global bridge so legacy runtime scripts still find window.PartyGameTextFit. */
export function installTextFitGlobals(target: Window | typeof globalThis = globalThis): void {
  const host = target as Window;
  host.PartyGameTextFit = { ...(host.PartyGameTextFit || {}), ...PartyGameTextFit };
  host.fittedLayoutTextSize = fittedLayoutTextSize;
}

installTextFitGlobals(typeof window !== "undefined" ? window : globalThis);
