(function attachPartyGameControllerText(global) {
  "use strict";

  function measureTarget(target, spec = {}) {
    const rect = target?.getBoundingClientRect?.() || {};
    const computed = typeof global.getComputedStyle === "function" && target
      ? global.getComputedStyle(target)
      : null;
    return {
      width: Number(spec.width || rect.width || target?.clientWidth || 240),
      height: Number(spec.height || rect.height || target?.clientHeight || 58),
      fontSize: Number(spec.fontSize || Number.parseFloat(computed?.fontSize) || 24),
      fontColor: spec.fontColor || computed?.color || "currentColor",
      autoFitText: spec.autoFitText !== false,
      applySize: spec.applySize === true
    };
  }

  function setText(target, value, spec = {}) {
    if (!target) return;
    const text = String(value ?? "");
    if (typeof global.PartyGameTextFit?.renderGameText === "function") {
      global.PartyGameTextFit.renderGameText(target, {
        text,
        spec: measureTarget(target, spec),
        options: spec.options || {}
      });
      return;
    }
    target.textContent = text;
  }

  function setButtonText(target, value, spec = {}) {
    setText(target, value, {
      ...spec,
      applySize: false
    });
  }

  global.PartyGameControllerText = {
    ...(global.PartyGameControllerText || {}),
    setText,
    setButtonText
  };
})(window);
