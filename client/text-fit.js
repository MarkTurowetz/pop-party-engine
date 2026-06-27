(function attachPartyGameTextFit(global) {
  "use strict";

  const defaultOptions = {
    fontFamily: 'ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif',
    fontStyle: "normal",
    fontWeight: "1000",
    lineHeight: 1,
    minSize: 6,
    maxSize: 260
  };

  function normalizeTextFieldElement(element = {}, defaults = {}) {
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
      fontColor: String(source.fontColor || fallback.fontColor || colorFallback)
    };
  }

  function resolveLayoutTextSource(target, element, runtimeText, options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, "text")) return String(options.text ?? "");
    if (options.useRuntimeText !== false && arguments.length >= 3) return String(runtimeText ?? "");
    const datasetSource = target?.dataset?.textFitSource;
    if (datasetSource !== undefined) return String(datasetSource);
    if (options.existingText !== undefined) return String(options.existingText ?? "");
    return String(element?.defaultText ?? "");
  }

  function renderLayoutTextField(target, element, options = {}) {
    if (!target) return null;
    const textElement = normalizeTextFieldElement(element, options.defaults || {});
    const hasRuntimeText = Object.prototype.hasOwnProperty.call(options, "text");
    const text = hasRuntimeText
      ? resolveLayoutTextSource(target, textElement, options.text, options)
      : resolveLayoutTextSource(target, textElement, undefined, { ...options, useRuntimeText: false });
    return renderPlainTextBox(target, text, textElement, options.renderOptions || options.options || {});
  }

  function renderRuntimeText(target, text, spec = {}, options = {}) {
    return renderPlainTextBox(target, String(text ?? ""), spec, options);
  }

  function renderGameText(target, config = {}) {
    if (!target) return null;
    const text = String(config.text ?? "");
    const element = config.element || config.spec || config.layout || {};
    return renderPlainTextBox(target, text, {
      ...element,
      fontSize: config.fallbackSize ?? element.fontSize
    }, config.options || {});
  }

  function renderTextBox(target, text, spec = {}, options = {}) {
    if (!target) return null;
    const width = Math.max(1, Number(spec.width || target.clientWidth || target.offsetWidth || 1));
    const height = Math.max(1, Number(spec.height || target.clientHeight || target.offsetHeight || 1));
    if (spec.applySize !== false) {
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
    }
    return renderPlainTextBox(target, String(text ?? ""), { ...spec, width, height }, options);
  }

  function renderAutoTextElement(target, element, text, fallbackSize = null, options = {}) {
    return renderPlainTextBox(target, String(text ?? ""), {
      ...element,
      fontSize: fallbackSize ?? element?.fontSize
    }, options);
  }

  function renderMeasuredTextElement(target, element, text, fallbackSize, options = {}) {
    return renderAutoTextElement(target, element, text, fallbackSize, options);
  }

  function renderTextElement(target, text, layout = null) {
    return renderPlainTextBox(target, String(text ?? ""), layout || {}, {});
  }

  function renderPlainTextBox(target, text, spec = {}, options = {}) {
    if (!target) return null;
    const computed = computedStyleFor(target);
    const fontSize = positiveNumber(spec.fontSize, positiveNumber(computed?.fontSize, defaultOptions.minSize));
    const lineHeight = normalizeLineHeight(options.lineHeight || spec.lineHeight || computed?.lineHeight, defaultOptions.lineHeight);
    const fontColor = spec.fontColor || options.fontColor || computed?.color || "";
    const fontFamily = options.fontFamily || spec.fontFamily || computed?.fontFamily || defaultOptions.fontFamily;
    const fontStyle = options.fontStyle || spec.fontStyle || computed?.fontStyle || defaultOptions.fontStyle;
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

  function measureGameText(config = {}) {
    const text = String(config.text ?? "");
    const element = config.element || config.spec || {};
    const fallbackSize = Number(config.fallbackSize ?? element.fontSize ?? defaultOptions.minSize);
    return fixedTextLayout(element, text, fallbackSize, config.options || {});
  }

  function fitTextLayout(element, text, fallbackSize, options = {}) {
    return fixedTextLayout(element, text, fallbackSize, options);
  }

  function measuredTextLayout(element, text, fallbackSize, options = {}) {
    return fixedTextLayout(element, text, fallbackSize, options);
  }

  function fittedLayoutTextSize(element, text, fallbackSize) {
    return positiveNumber(fallbackSize ?? element?.fontSize, defaultOptions.minSize);
  }

  function fixedTextLayout(element, text, fontSize, options = {}) {
    const size = positiveNumber(fontSize, positiveNumber(element?.fontSize, defaultOptions.minSize));
    const width = Math.max(1, Number(element?.width || 1));
    const height = Math.max(1, Number(element?.height || 1));
    const lineHeight = normalizeLineHeight(options.lineHeight, defaultOptions.lineHeight);
    const lines = String(text ?? "").split("\n");
    return {
      fontSize: size,
      fontFamily: options.fontFamily || defaultOptions.fontFamily,
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

  function targetTextRenderOptions(target, element, options = {}) {
    return textRenderOptions(element, options);
  }

  function textRenderOptions(element, options = {}) {
    return {
      ...options,
      autoFit: false
    };
  }

  function computedStyleFor(target) {
    if (!target || typeof global.getComputedStyle !== "function") return null;
    try {
      return global.getComputedStyle(target);
    } catch (error) {
      return null;
    }
  }

  function normalizeLineHeight(value, fallback) {
    if (value === "normal") return fallback;
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 4) return parsed;
    return fallback;
  }

  function positiveNumber(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function applyTextTransform(text, transform) {
    if (transform === "uppercase") return text.toUpperCase();
    if (transform === "lowercase") return text.toLowerCase();
    if (transform === "capitalize") return text.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
    return text;
  }

  global.PartyGameTextFit = {
    ...(global.PartyGameTextFit || {}),
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
  global.fittedLayoutTextSize = fittedLayoutTextSize;
})(typeof window !== "undefined" ? window : globalThis);
