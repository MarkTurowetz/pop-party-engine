(function attachPartyGameTextFit(global) {
  "use strict";

  const defaultOptions = {
    fontFamily: 'ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif',
    fontStyle: "normal",
    fontWeight: "1000",
    lineHeight: 1.15,
    safetyScale: 0.96,
    minSize: 6,
    maxSize: 260,
    widthSafety: 0.96,
    verticalSafety: 0.96
  };
  const svgNamespace = "http://www.w3.org/2000/svg";

  let measureContext = null;

  function fitTextLayout(element, text, fallbackSize, options = {}) {
    const config = normalizeOptions(options);
    const box = textBox(element, config);
    const textValue = applyTextTransform(String(text ?? ""), config.textTransform);
    const maxSize = Number(config.maxSize || defaultOptions.maxSize);
    const minSize = Number(config.minSize || defaultOptions.minSize);

    let best = null;
    for (let size = maxSize; size >= minSize; size -= 1) {
      const layout = layoutTextAtSize(textValue, size, box.width, config);
      if (layoutFits(layout, box, config)) {
        best = layout;
        break;
      }
    }

    const layout = best || layoutTextAtSize(textValue, Math.max(minSize, Number(fallbackSize || minSize)), box.width, config);
    const safeSize = Math.max(minSize, Math.floor(layout.fontSize * config.safetyScale));
    return withTextBox(layoutTextAtSize(textValue, safeSize, box.width, config), box);
  }

  function fittedLayoutTextSize(element, text, fallbackSize, options = {}) {
    return fitTextLayout(element, text, fallbackSize, options).fontSize;
  }

  function measuredTextLayout(element, text, fallbackSize, options = {}) {
    if (options.autoFit === false) return fixedTextLayout(element, text, fallbackSize, options);
    return fitTextLayout(element, text, fallbackSize, options);
  }

  function renderMeasuredTextElement(target, element, text, fallbackSize, options = {}) {
    const layout = measuredTextLayout(element, text, fallbackSize, options);
    renderTextElement(target, text, layout);
    return layout;
  }

  function fixedTextLayout(element, text, fontSize, options = {}) {
    const config = normalizeOptions(options);
    const box = textBox(element, config);
    const textValue = applyTextTransform(String(text ?? ""), config.textTransform);
    const size = Math.max(Number(config.minSize || defaultOptions.minSize), Number(fontSize || config.minSize || defaultOptions.minSize));
    return withTextBox(layoutTextAtSize(textValue, size, box.width, config), box);
  }

  function layoutTextAtSize(text, fontSize, availableWidth, config) {
    const lines = String(text ?? "")
      .split("\n")
      .flatMap((paragraph) => wrapMeasuredLine(paragraph, fontSize, availableWidth, config));
    const measuredLines = lines.length ? lines : [""];
    const metrics = measuredLines.map((line) => measureLine(line || " ", fontSize, config));
    const maxWidth = Math.max(0, ...metrics.map((metric) => metric.width));
    const inkAscent = Math.max(1, ...metrics.map((metric) => metric.ascent));
    const inkDescent = Math.max(1, ...metrics.map((metric) => metric.descent));
    const inkHeight = inkAscent + inkDescent;
    const lineGap = Math.max(fontSize * (config.lineHeight - 1), 0);
    const lineBoxHeight = inkHeight;
    const height = (inkHeight * measuredLines.length) + (lineGap * Math.max(0, measuredLines.length - 1));
    return {
      fontSize,
      fontFamily: config.fontFamily,
      fontStyle: config.fontStyle,
      fontWeight: config.fontWeight,
      height,
      lineBoxHeight,
      inkHeight,
      lineGap,
      lineHeight: config.lineHeight,
      lines: measuredLines,
      metrics,
      maxWidth,
      ascent: inkAscent,
      descent: inkDescent,
      baselineShift: (inkAscent - inkDescent) / 2
    };
  }

  function withTextBox(layout, box) {
    return {
      ...layout,
      boxWidth: Math.max(1, Number(box?.width || 1)),
      boxHeight: Math.max(1, Number(box?.height || 1)),
      targetWidth: Math.max(1, Number(box?.targetWidth || box?.width || 1)),
      targetHeight: Math.max(1, Number(box?.targetHeight || box?.height || 1)),
      offsetX: Math.max(0, Number(box?.offsetX || 0)),
      offsetY: Math.max(0, Number(box?.offsetY || 0))
    };
  }

  function wrapMeasuredLine(line, fontSize, availableWidth, config) {
    const raw = String(line || "");
    if (!raw.trim()) return [""];
    const words = raw.trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
      if (!current) {
        current = fitWord(word, fontSize, availableWidth, config, lines);
        continue;
      }
      const candidate = `${current} ${word}`;
      if (measureLine(candidate, fontSize, config).width <= availableWidth * config.widthSafety) {
        current = candidate;
      } else {
        lines.push(current);
        current = fitWord(word, fontSize, availableWidth, config, lines);
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function fitWord(word, fontSize, availableWidth, config, lines) {
    if (measureLine(word, fontSize, config).width <= availableWidth * config.widthSafety) return word;
    let current = "";
    for (const char of Array.from(word)) {
      const candidate = `${current}${char}`;
      if (!current || measureLine(candidate, fontSize, config).width <= availableWidth * config.widthSafety) {
        current = candidate;
      } else {
        lines.push(current);
        current = char;
      }
    }
    return current;
  }

  function measureLine(line, fontSize, config) {
    const context = canvasContext();
    if (!context) {
      const width = String(line || "").length * fontSize * 0.62;
      return { width, ascent: fontSize * 0.75, descent: fontSize * 0.2 };
    }
    context.font = fontString(fontSize, config);
    const metrics = context.measureText(String(line || ""));
    const measuredAscent = Number(metrics.actualBoundingBoxAscent);
    const measuredDescent = Number(metrics.actualBoundingBoxDescent);
    return {
      width: metrics.width || 0,
      ascent: Number.isFinite(measuredAscent) && measuredAscent > 0 ? measuredAscent : fontSize * 0.72,
      descent: Number.isFinite(measuredDescent) && measuredDescent > 0 ? measuredDescent : fontSize * 0.18
    };
  }

  function layoutFits(layout, box, config) {
    if (layout.maxWidth > box.width * config.widthSafety) return false;
    if (layout.height > box.height * config.verticalSafety) return false;
    return true;
  }

  function textBox(element, config) {
    const padding = normalizePadding(config.padding);
    const targetWidth = Math.max(1, Number(element?.width || 1));
    const targetHeight = Math.max(1, Number(element?.height || 1));
    return {
      width: Math.max(config.minSize, targetWidth - padding.left - padding.right),
      height: Math.max(config.minSize, targetHeight - padding.top - padding.bottom),
      targetWidth,
      targetHeight,
      offsetX: padding.left,
      offsetY: padding.top
    };
  }

  function normalizeOptions(options = {}) {
    const computed = options.computedStyle || null;
    return {
      ...defaultOptions,
      ...options,
      fontFamily: options.fontFamily || computed?.fontFamily || defaultOptions.fontFamily,
      fontStyle: options.fontStyle || computed?.fontStyle || defaultOptions.fontStyle,
      fontWeight: String(options.fontWeight || computed?.fontWeight || defaultOptions.fontWeight),
      lineHeight: normalizeLineHeight(options.lineHeight || computed?.lineHeight, defaultOptions.lineHeight),
      padding: options.padding || computedPadding(computed),
      textTransform: options.textTransform || computed?.textTransform || "none"
    };
  }

  function normalizeLineHeight(value, fallback) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 4) return parsed;
    return fallback;
  }

  function fontString(fontSize, config) {
    return `${config.fontStyle || "normal"} ${config.fontWeight || "1000"} ${fontSize}px ${config.fontFamily || defaultOptions.fontFamily}`;
  }

  function computedPadding(computed) {
    if (!computed) return { x: 0, y: 0 };
    const left = Number.parseFloat(computed.paddingLeft) || 0;
    const right = Number.parseFloat(computed.paddingRight) || 0;
    const top = Number.parseFloat(computed.paddingTop) || 0;
    const bottom = Number.parseFloat(computed.paddingBottom) || 0;
    return { left, right, top, bottom };
  }

  function normalizePadding(padding) {
    if (!padding) return { left: 0, right: 0, top: 0, bottom: 0 };
    const x = Number(padding.x || 0);
    const y = Number(padding.y || 0);
    return {
      left: Math.max(0, Number(padding.left ?? x / 2) || 0),
      right: Math.max(0, Number(padding.right ?? x / 2) || 0),
      top: Math.max(0, Number(padding.top ?? y / 2) || 0),
      bottom: Math.max(0, Number(padding.bottom ?? y / 2) || 0)
    };
  }

  function applyTextTransform(text, transform) {
    if (transform === "uppercase") return text.toUpperCase();
    if (transform === "lowercase") return text.toLowerCase();
    if (transform === "capitalize") return text.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
    return text;
  }

  function canvasContext() {
    if (measureContext) return measureContext;
    const documentRef = global.document;
    if (!documentRef?.createElement) return null;
    measureContext = documentRef.createElement("canvas").getContext("2d");
    return measureContext;
  }

  function renderTextElement(target, text, layout = null) {
    if (!target) return;
    const documentRef = target.ownerDocument || global.document;
    const textValue = String(text ?? "");
    if (target.dataset) target.dataset.textFitSource = textValue;
    target.setAttribute?.("aria-label", textValue);
    if (!layout) {
      target.textContent = textValue;
      return;
    }
    const lines = Array.isArray(layout?.lines) && layout.lines.length ? layout.lines : textValue.split("\n");
    const fontSize = finiteNumber(layout?.fontSize, defaultOptions.minSize);
    const boxWidth = Math.max(1, finiteNumber(layout?.boxWidth, target.clientWidth || 1));
    const boxHeight = Math.max(1, finiteNumber(layout?.boxHeight, target.clientHeight || 1));
    const targetWidth = Math.max(1, finiteNumber(layout?.targetWidth, boxWidth));
    const targetHeight = Math.max(1, finiteNumber(layout?.targetHeight, boxHeight));
    const offsetX = finiteNumber(layout?.offsetX, 0);
    const offsetY = finiteNumber(layout?.offsetY, 0);
    const ascent = finiteNumber(layout?.ascent, fontSize * 0.75);
    const totalHeight = finiteNumber(layout?.height, fontSize);
    const lineAdvance = finiteNumber(layout?.inkHeight, fontSize) + finiteNumber(layout?.lineGap, 0);
    const textCenterX = offsetX + (boxWidth / 2);
    const firstBaseline = offsetY + ((boxHeight - totalHeight) / 2) + ascent;
    const svg = documentRef.createElementNS(svgNamespace, "svg");
    svg.classList.add("text-fit-svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${targetWidth} ${targetHeight}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");

    const textElement = documentRef.createElementNS(svgNamespace, "text");
    textElement.classList.add("text-fit-svg-text");
    textElement.setAttribute("x", `${textCenterX}`);
    textElement.setAttribute("text-anchor", "middle");
    textElement.setAttribute("dominant-baseline", "alphabetic");
    textElement.setAttribute("alignment-baseline", "alphabetic");
    textElement.setAttribute("fill", "currentColor");
    textElement.setAttribute("font-size", `${fontSize}px`);
    textElement.setAttribute("font-family", layout?.fontFamily || defaultOptions.fontFamily);
    textElement.setAttribute("font-style", layout?.fontStyle || defaultOptions.fontStyle);
    textElement.setAttribute("font-weight", String(layout?.fontWeight || defaultOptions.fontWeight));

    lines.forEach((line, index) => {
      const lineElement = documentRef.createElementNS(svgNamespace, "tspan");
      lineElement.setAttribute("x", `${textCenterX}`);
      lineElement.setAttribute("y", `${firstBaseline + (lineAdvance * index)}`);
      lineElement.textContent = line;
      textElement.appendChild(lineElement);
    });
    svg.appendChild(textElement);
    target.replaceChildren(svg);
  }

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    return fallback;
  }

  global.PartyGameTextFit = {
    ...(global.PartyGameTextFit || {}),
    constants: defaultOptions,
    fitTextLayout,
    fixedTextLayout,
    measuredTextLayout,
    fittedLayoutTextSize,
    measureFittedTextSize: fittedLayoutTextSize,
    renderTextElement,
    renderMeasuredTextElement
  };
  global.fittedLayoutTextSize = fittedLayoutTextSize;
})(typeof window !== "undefined" ? window : globalThis);
