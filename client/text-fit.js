(function attachPartyGameTextFit(global) {
  "use strict";

  const defaultOptions = {
    averageGlyphWidth: 0.62,
    lineHeight: 0.82,
    safetyScale: 0.96,
    minSize: 8,
    maxSize: 260,
    widthSafety: 0.98
  };

  function fittedLayoutTextSize(element, text, fallbackSize, options = {}) {
    const config = { ...defaultOptions, ...(options || {}) };
    const padding = options.padding || { x: 0, y: 0 };
    const availableWidth = Math.max(config.minSize, Number(element?.width || 1) - Number(padding.x || 0));
    const availableHeight = Math.max(config.minSize, Number(element?.height || 1) - Number(padding.y || 0));
    const rawLines = String(text || "Text").split("\n");
    const words = rawLines.flatMap((line) => line.split(/\s+/).filter(Boolean));
    const longestWord = Math.max(1, ...words.map((word) => word.length));
    const maxSize = Math.min(
      config.maxSize,
      Math.max(config.minSize, Math.floor(availableHeight / Math.max(0.1, config.lineHeight)))
    );

    for (let size = maxSize; size >= config.minSize; size -= 1) {
      const averageCharWidth = size * config.averageGlyphWidth;
      const wordFits = longestWord * averageCharWidth <= availableWidth * config.widthSafety;
      const wrappedLines = wrappedLineCount(rawLines, availableWidth, averageCharWidth);
      if (wordFits && wrappedLines * size * config.lineHeight <= availableHeight) {
        return Math.max(config.minSize, Math.floor(size * config.safetyScale));
      }
    }

    return Math.max(config.minSize, Math.min(maxSize, Number(fallbackSize || config.minSize)));
  }

  function wrappedLineCount(rawLines, availableWidth, averageCharWidth) {
    const maxCharsPerLine = Math.max(1, Math.floor(availableWidth / Math.max(1, averageCharWidth)));
    return rawLines.reduce((total, rawLine) => {
      const lineWords = rawLine.split(/\s+/).filter(Boolean);
      if (!lineWords.length) return total + 1;
      let lineCount = 1;
      let currentLength = 0;
      for (const word of lineWords) {
        const wordLength = word.length;
        if (currentLength === 0) {
          currentLength = wordLength;
        } else if (currentLength + 1 + wordLength <= maxCharsPerLine) {
          currentLength += 1 + wordLength;
        } else {
          lineCount += 1;
          currentLength = wordLength;
        }
      }
      return total + lineCount;
    }, 0);
  }

  global.PartyGameTextFit = {
    ...(global.PartyGameTextFit || {}),
    constants: defaultOptions,
    fittedLayoutTextSize,
    measureFittedTextSize: fittedLayoutTextSize,
    wrappedLineCount
  };
  global.fittedLayoutTextSize = fittedLayoutTextSize;
})(typeof window !== "undefined" ? window : globalThis);
