import { gameTextDefaultFontFamily, normalizeGameTextFontFamily } from "../textFonts";
import { gameTextPlainText, setGameTextHtml, transformGameTextMarkup } from "./gameTextMarkup";

// Typed port of the legacy client/text-fit.js IIFE. Behaviour is preserved 1:1;
// the public API is both exported (for TS consumers) and assigned to window
// (PartyGameTextFit + fittedLayoutTextSize) so the still-legacy stage/controller
// runtime scripts keep working through their existing globals.

type Dict = Record<string, unknown>;
type TextTarget = HTMLElement | null | undefined;
type TextFitSpec = {
  width: number;
  height: number;
  widthSafety: number;
  lineHeight: number;
  fontFamily: string;
  fontStyle: string;
  fontWeight: string;
  textTransform: unknown;
};

const defaultOptions = {
  fontFamily: gameTextDefaultFontFamily,
  fontStyle: "normal",
  fontWeight: "1000",
  lineHeight: 1,
  minSize: 6,
  maxSize: 260,
  widthSafety: 2
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasOwn(object: Dict | undefined, key: string): boolean {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

function optionNumber(options: Dict, key: string, fallback: number): number {
  return positiveNumber(options[key], fallback);
}

function fittingWidth(element: Dict | undefined, options: Dict): number {
  const rawWidth = positiveNumber(element?.width, 1);
  const padding = positiveNumber(options.paddingX ?? options.padding, 0);
  return Math.max(1, rawWidth - padding * 2);
}

function fittingHeight(element: Dict | undefined, options: Dict): number {
  const rawHeight = positiveNumber(element?.height, 1);
  const padding = positiveNumber(options.paddingY ?? options.padding, 0);
  return Math.max(1, rawHeight - padding * 2);
}

function computedStyleFor(target: TextTarget): CSSStyleDeclaration | null {
  if (!target || typeof window === "undefined" || typeof window.getComputedStyle !== "function") return null;
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

let domSizingElement: HTMLElement | null = null;

function ensureDomSizingElement(): HTMLElement | null {
  if (typeof document === "undefined" || !document.body) return null;
  if (domSizingElement && domSizingElement.ownerDocument === document) return domSizingElement;
  domSizingElement = document.createElement("div");
  Object.assign(domSizingElement.style, {
    position: "absolute",
    left: "-10000px",
    top: "-10000px",
    visibility: "hidden",
    pointerEvents: "none",
    boxSizing: "border-box",
    display: "block",
    overflow: "visible",
    whiteSpace: "pre-wrap",
    overflowWrap: "normal",
    wordBreak: "keep-all",
    textAlign: "center",
    padding: "0",
    margin: "0"
  });
  document.body.appendChild(domSizingElement);
  return domSizingElement;
}

function domSizeFor(text: string, fontSize: number, spec: TextFitSpec): { width: number; height: number } | null {
  const node = ensureDomSizingElement();
  if (!node) return null;
  Object.assign(node.style, {
    width: `${spec.width}px`,
    height: "auto",
    fontSize: `${fontSize}px`,
    lineHeight: String(spec.lineHeight),
    fontFamily: spec.fontFamily,
    fontStyle: spec.fontStyle,
    fontWeight: spec.fontWeight,
    textTransform: "none"
  });
  node.textContent = text;
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  range.detach?.();
  return {
    width: node.scrollWidth > spec.width + 0.5 ? node.scrollWidth : rect.width,
    height: Math.max(rect.height, node.scrollHeight)
  };
}

function approximateWidth(text: string, fontSize: number, fontWeight: string): number {
  const weightBoost = Number(fontWeight) >= 800 ? 1.04 : 1;
  return String(text || "").length * fontSize * 0.62 * weightBoost;
}

function approximateWrappedLineCount(line: string, fontSize: number, spec: TextFitSpec): { width: number; lineCount: number } {
  const cleanLine = String(line || "");
  if (!cleanLine.trim()) return { width: 0, lineCount: 1 };
  const tokens = cleanLine.match(/\S+\s*/g) || [cleanLine];
  let lineCount = 1;
  let currentWidth = 0;
  let widest = 0;

  for (const token of tokens) {
    const tokenWidth = approximateWidth(token.replace(/\s+$/u, ""), fontSize, spec.fontWeight);
    const tokenWithSpaceWidth = approximateWidth(token, fontSize, spec.fontWeight);
    widest = Math.max(widest, tokenWidth);
    if (currentWidth > 0 && currentWidth + tokenWithSpaceWidth > spec.width) {
      lineCount += 1;
      currentWidth = tokenWithSpaceWidth;
    } else {
      currentWidth += tokenWithSpaceWidth;
    }
    widest = Math.max(widest, Math.min(currentWidth, spec.width));
  }

  return { width: widest, lineCount };
}

function approximateSizeFor(text: string, fontSize: number, spec: TextFitSpec): { width: number; height: number; visualLineCount: number } {
  const lines = String(text || " ").split("\n");
  let widest = 0;
  let visualLineCount = 0;
  for (const line of lines) {
    const wrapped = approximateWrappedLineCount(line, fontSize, spec);
    widest = Math.max(widest, wrapped.width);
    visualLineCount += wrapped.lineCount;
  }
  return {
    width: widest,
    height: visualLineCount * fontSize * spec.lineHeight,
    visualLineCount
  };
}

function sizeFor(text: string, fontSize: number, spec: TextFitSpec): { width: number; height: number; visualLineCount: number } {
  const domSize = domSizeFor(text, fontSize, spec);
  if (domSize) {
    const visualLineCount = Math.max(1, Math.round(domSize.height / Math.max(1, fontSize * spec.lineHeight)));
    return { ...domSize, visualLineCount };
  }
  return approximateSizeFor(text, fontSize, spec);
}

function fitsText(text: string, fontSize: number, spec: TextFitSpec): boolean {
  const size = sizeFor(text, fontSize, spec);
  const widthLimit = Math.max(1, spec.width - spec.widthSafety);
  return size.width <= widthLimit && size.height <= spec.height + 0.5;
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
  const lines = gameTextPlainText(text).split("\n");
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

function textFitSpec(element: Dict | undefined, options: Dict): TextFitSpec {
  const width = fittingWidth(element, options);
  return {
    width,
    height: fittingHeight(element, options),
    widthSafety: Math.min(Math.max(0, width - 1), positiveNumber(options.widthSafety ?? element?.widthSafety, defaultOptions.widthSafety)),
    lineHeight: normalizeLineHeight(options.lineHeight ?? element?.lineHeight, defaultOptions.lineHeight),
    fontFamily: normalizeGameTextFontFamily(options.fontFamily ?? element?.fontFamily),
    fontStyle: String(options.fontStyle ?? element?.fontStyle ?? defaultOptions.fontStyle),
    fontWeight: String(options.fontWeight ?? element?.fontWeight ?? defaultOptions.fontWeight),
    textTransform: options.textTransform ?? element?.textTransform ?? "none"
  };
}

function autoFitEnabled(element: Dict | undefined, options: Dict): boolean {
  return (!hasOwn(options, "autoFit") || options.autoFit !== false) && element?.autoFitText !== false;
}

function fittedLayoutTextSize(element: Dict | undefined, text?: unknown, fallbackSize?: unknown, options: Dict = {}): number {
  return Number(fitTextLayout(element, text ?? "", fallbackSize ?? element?.fontSize, options).fontSize || defaultOptions.minSize);
}

function fitTextLayout(element: Dict | undefined, text: unknown, fallbackSize: unknown, options: Dict = {}): Dict {
  const fallback = positiveNumber(fallbackSize, positiveNumber(element?.fontSize, defaultOptions.minSize));
  if (!autoFitEnabled(element, options)) {
    return fixedTextLayout(element, text, fallback, options);
  }

  const spec = textFitSpec(element, options);
  const textValue = gameTextPlainText(transformGameTextMarkup(text, spec.textTransform));
  const minSize = Math.max(1, optionNumber(options, "minSize", positiveNumber(element?.minFontSize, defaultOptions.minSize)));
  const maxSize = Math.max(minSize, optionNumber(options, "maxSize", positiveNumber(element?.maxFontSize, defaultOptions.maxSize)));
  let low = minSize;
  let high = maxSize;
  let best = minSize;

  if (fitsText(textValue, high, spec)) {
    best = high;
  } else {
    for (let index = 0; index < 14; index += 1) {
      const candidate = (low + high) / 2;
      if (fitsText(textValue, candidate, spec)) {
        best = candidate;
        low = candidate;
      } else {
        high = candidate;
      }
    }
  }

  const rounded = Number(clamp(best, minSize, maxSize).toFixed(3));
  const layout = fixedTextLayout(element, textValue, rounded, { ...options, lineHeight: spec.lineHeight, fontFamily: spec.fontFamily, fontStyle: spec.fontStyle, fontWeight: spec.fontWeight });
  const size = sizeFor(textValue, rounded, spec);
  return {
    ...layout,
    autoFitText: true,
    visualLineCount: size.visualLineCount,
    maxWidth: size.width,
    targetWidth: spec.width,
    targetHeight: spec.height,
    measuredWidth: size.width,
    measuredHeight: size.height
  };
}

function measuredTextLayout(element: Dict | undefined, text: unknown, fallbackSize: unknown, options: Dict = {}): Dict {
  return fitTextLayout(element, text, fallbackSize, options);
}

function measureGameText(config: Dict = {}): Dict {
  const text = String(config.text ?? "");
  const element = (config.element || config.spec || {}) as Dict;
  const fallbackSize = num(config.fallbackSize ?? element.fontSize ?? defaultOptions.minSize);
  return fitTextLayout(element, text, fallbackSize, (config.options as Dict) || {});
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
  const transformedMarkup = transformGameTextMarkup(text, options.textTransform || computed?.textTransform || "none");
  const textValue = gameTextPlainText(transformedMarkup);
  const layout = fitTextLayout(
    { ...spec, fontSize, fontFamily, fontStyle, fontWeight, lineHeight },
    textValue,
    fontSize,
    { ...options, lineHeight, fontFamily, fontStyle, fontWeight, textTransform: "none" }
  );

  if (target.dataset) target.dataset.textFitSource = String(text ?? "");
  target.setAttribute?.("aria-label", textValue);
  if (fontColor) target.style.setProperty("color", fontColor, "important");
  Object.assign(target.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    textAlign: "center",
    whiteSpace: "pre-wrap",
    overflowWrap: layout.autoFitText ? "normal" : "anywhere",
    wordBreak: layout.autoFitText ? "keep-all" : "normal",
    lineHeight: String(lineHeight),
    fontSize: `${layout.fontSize}px`,
    fontFamily,
    fontStyle,
    fontWeight
  });
  setGameTextHtml(target, transformedMarkup);
  return layout;
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

function textRenderOptions(element: Dict, options: Dict = {}): Dict {
  return { ...options, autoFit: options.autoFit !== false && element?.autoFitText !== false };
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
