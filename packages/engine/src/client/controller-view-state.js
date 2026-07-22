"use strict";

function createControllerViewState(views = {}) {
  function allViews() {
    return Object.values(views).filter(Boolean);
  }
  function hideAll() {
    for (const view of allViews()) view.classList.add("hidden");
  }
  function show(viewId) {
    const view = views[viewId] || null;
    if (!view) return null;
    view.classList.remove("hidden");
    return view;
  }
  function setShown(viewId, isShown) {
    const view = views[viewId] || null;
    if (!view) return null;
    view.classList.toggle("hidden", isShown === false);
    return view;
  }
  return Object.freeze({ hideAll, setShown, show, view: (viewId) => views[viewId] || null });
}

module.exports = Object.freeze({ createControllerViewState });
