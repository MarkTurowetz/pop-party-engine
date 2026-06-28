(function attachPartyGameStageTextRenderer(global) {
  "use strict";

  function renderStageTextBox(target, text, spec = {}, options = {}) {
    if (!target) return null;
    const textValue = String(text ?? "");
    const computedStyle = global.getComputedStyle?.(target);
    const width = Number(spec.width || target.clientWidth || target.offsetWidth || 1);
    const height = Number(spec.height || target.clientHeight || target.offsetHeight || 1);
    const fontSize = Number(spec.fontSize || Number.parseFloat(computedStyle?.fontSize) || 24);
    const textSpec = {
      width: Math.max(1, width),
      height: Math.max(1, height),
      fontSize: Math.max(1, fontSize),
      autoFitText: spec.autoFitText !== false,
      applySize: spec.applySize === true,
      fontColor: spec.fontColor
    };
    if (typeof global.PartyGameTextFit?.renderRuntimeText === "function") {
      return global.PartyGameTextFit.renderRuntimeText(target, textValue, textSpec, {
          autoFit: textSpec.autoFitText,
          minSize: Number(options.minSize || spec.minSize || 6),
          lineHeight: Number(options.lineHeight || spec.lineHeight || 1.05),
          ...(spec.options || {}),
          ...options
      });
    }
    target.textContent = textValue;
    return null;
  }

  global.PartyGameStageTextRenderer = {
    renderStageTextBox
  };
})(window);
