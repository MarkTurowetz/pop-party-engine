(function attachPartyGameToolInspectorKeynav(global) {
  "use strict";

  const inspectorSelectors = [
    "#artComponentEditor",
    "#flowEditor",
    "#flowNodeInspector",
    "#layoutEditorFields",
    "#hostAudioEditor",
    "#playerColorList",
    "#customConstantList",
    ".flow-react-inspector"
  ];
  const fieldSelector = [
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "[contenteditable='true']"
  ].join(",");

  function isVisible(element) {
    if (!element || element.hidden) return false;
    const style = global.getComputedStyle?.(element);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    const rects = element.getClientRects?.();
    return !rects || rects.length > 0;
  }

  function inspectorForTarget(target) {
    if (!target?.closest) return null;
    return target.closest(inspectorSelectors.join(","));
  }

  function inspectorFields(inspector) {
    return Array.from(inspector?.querySelectorAll?.(fieldSelector) || []).filter((field) => (
      !field.disabled
      && field.tabIndex !== -1
      && !field.closest("[hidden], .hidden")
      && isVisible(field)
    ));
  }

  function focusField(field) {
    field.focus({ preventScroll: true });
    if (typeof field.select === "function" && ["text", "number", "search", "url", "email", "tel"].includes(field.type || "text")) {
      try {
        field.select();
      } catch (_error) {
        // Some browser/input combinations expose select() but reject it.
      }
    }
    field.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function handleKeydown(event) {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const inspector = inspectorForTarget(event.target);
    if (!inspector) return;
    const fields = inspectorFields(inspector);
    if (fields.length < 2) return;
    const active = global.document.activeElement;
    const currentIndex = fields.indexOf(active);
    if (currentIndex < 0) return;
    event.preventDefault();
    const direction = event.shiftKey ? -1 : 1;
    const nextIndex = (currentIndex + direction + fields.length) % fields.length;
    focusField(fields[nextIndex]);
  }

  function install(root = global.document) {
    root?.addEventListener?.("keydown", handleKeydown, true);
  }

  const api = {
    fieldSelector,
    handleKeydown,
    inspectorFields,
    inspectorForTarget,
    install
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameToolInspectorKeynav = api;
  if (global.document) install(global.document);
})(typeof window !== "undefined" ? window : globalThis);
