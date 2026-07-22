"use strict";

function createControllerLocalButtonRuntime(options = {}) {
  const { bindPress, createButton, disposeButtonArt, setButtonLifecycleState } = options;
  let activeButton = null;
  let activeSlot = null;

  function defaultCreateButton(slot) {
    const button = globalThis.document.createElement("button");
    button.type = slot.buttonType || "button";
    button.id = slot.buttonId;
    button.className = [
      "primary-button",
      "controller-submit-button",
      "controller-local-action-button",
      slot.buttonClassName || ""
    ].filter(Boolean).join(" ");
    return button;
  }

  function dispose(slot) {
    if (slot && activeSlot !== slot) return;
    if (!activeButton) return;
    setButtonLifecycleState?.(activeButton, "Off");
    disposeButtonArt?.(activeButton);
    activeButton.remove();
    activeButton = null;
    activeSlot = null;
  }

  function activate(slot, initialize) {
    if (activeButton && activeSlot === slot && activeButton.isConnected) {
      return { button: activeButton, isNew: false };
    }
    dispose();
    const button = (createButton || defaultCreateButton)(slot);
    button.dataset.controllerOption = "";
    button.dataset.optionId = slot.optionId;
    if (!button.parentElement) slot.container.replaceChildren(button);
    bindPress?.(button);
    activeButton = button;
    activeSlot = slot;
    initialize?.(button);
    setButtonLifecycleState?.(button, "On");
    return { button, isNew: true };
  }

  function prepareForLayout(layoutPhase) {
    if (activeSlot && activeSlot.layoutPhase !== layoutPhase) dispose();
  }

  function active(slot) {
    if (slot && activeSlot !== slot) return null;
    return activeButton?.isConnected ? activeButton : null;
  }

  return Object.freeze({ activate, active, dispose, prepareForLayout });
}

module.exports = Object.freeze({ createControllerLocalButtonRuntime });
