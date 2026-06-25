(function attachPartyGameTextFit(global) {
  "use strict";

  const defaultOptions = {
    fontFamily: 'ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif',
    fontStyle: "normal",
    fontWeight: "1000",
    lineHeight: 0.9,
    safetyScale: 0.98,
    minSize: 6,
    maxSize: 260,
    widthSafety: 0.99,
    verticalSafety: 0.99
  };

  let measureContext = null;

  function fitTextLayout(element, text, fallbackSize, options = {}) {
    const config = normalizeOptions(options);
    const box = textBox(element, config);
    const textValue = String(text || "Text");
    const maxSize = Math.min(
      Number(config.maxSize || defaultOptions.maxSize),
      Math.max(config.minSize, Math.floor(box.height / Math.max(0.1, config.lineHeight)))
    );
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
    return layoutTextAtSize(textValue, safeSize, box.width, config);
  }

  function fittedLayoutTextSize(element, text, fallbackSize, options = {}) {
    return fitTextLayout(element, text, fallbackSize, options).fontSize;
  }

  function layoutTextAtSize(text, fontSize, availableWidth, config) {
    const lines = String(text || "Text")
      .split("\n")
      .flatMap((paragraph) => wrapMeasuredLine(paragraph, fontSize, availableWidth, config));
    const measuredLines = lines.length ? lines : [""];
    const metrics = measuredLines.map((line) => measureLine(line || " ", fontSize, config));
    const maxWidth = Math.max(0, ...metrics.map((metric) => metric.width));
    const inkAscent = Math.max(fontSize * 0.75, ...metrics.map((metric) => metric.ascent));
    const inkDescent = Math.max(fontSize * 0.2, ...metrics.map((metric) => metric.descent));
    const lineBoxHeight = Math.max(fontSize * config.lineHeight, inkAscent + inkDescent);
    const height = lineBoxHeight * measuredLines.length;
    const inkCenterOffset = ((inkDescent - inkAscent) / 2) + (lineBoxHeight * 0.18);
    return {
      fontSize,
      height,
      lineBoxHeight,
      lineHeight: config.lineHeight,
      lines: measuredLines,
      maxWidth,
      baselineShift: Math.round(inkCenterOffset * 1000) / 1000
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
    return {
      width: metrics.width || 0,
      ascent: metrics.actualBoundingBoxAscent || fontSize * 0.75,
      descent: metrics.actualBoundingBoxDescent || fontSize * 0.2
    };
  }

  function layoutFits(layout, box, config) {
    return layout.maxWidth <= box.width * config.widthSafety
      && layout.height <= box.height * config.verticalSafety;
  }

  function textBox(element, config) {
    const padding = config.padding || { x: 0, y: 0 };
    return {
      width: Math.max(config.minSize, Number(element?.width || 1) - Number(padding.x || 0)),
      height: Math.max(config.minSize, Number(element?.height || 1) - Number(padding.y || 0))
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
      lineHeight: normalizeLineHeight(options.lineHeight || computed?.lineHeight, defaultOptions.lineHeight)
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
    if (target.dataset) target.dataset.textFitSource = String(text || "");
    target.setAttribute?.("aria-label", String(text || ""));
    const lines = Array.isArray(layout?.lines) && layout.lines.length ? layout.lines : String(text || "").split("\n");
    const wrapper = documentRef.createElement("span");
    wrapper.className = "text-fit-lines";
    wrapper.style.setProperty("--text-fit-line-height", String(layout?.lineHeight || defaultOptions.lineHeight));
    wrapper.style.setProperty("--text-fit-baseline-shift", `${Number(layout?.baselineShift || 0)}px`);
    for (const line of lines) {
      const lineElement = documentRef.createElement("span");
      lineElement.className = "text-fit-line";
      lineElement.textContent = line;
      wrapper.appendChild(lineElement);
    }
    target.replaceChildren(wrapper);
  }

  global.PartyGameTextFit = {
    ...(global.PartyGameTextFit || {}),
    constants: defaultOptions,
    fitTextLayout,
    fittedLayoutTextSize,
    measureFittedTextSize: fittedLayoutTextSize,
    renderTextElement
  };
  global.fittedLayoutTextSize = fittedLayoutTextSize;
})(typeof window !== "undefined" ? window : globalThis);
