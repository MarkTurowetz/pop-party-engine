(function attachPartyGameArtToolUi(global) {
  "use strict";

  function createThumb(className, content = "") {
    const thumb = document.createElement("span");
    thumb.className = className;
    if (typeof content === "string") {
      thumb.innerHTML = content;
    } else if (content) {
      thumb.appendChild(content);
    }
    return thumb;
  }

  function createSidebarRow(options = {}) {
    const { row } = global.PartyGameToolAffordances.createToolSidebarRow({
      tagName: "button",
      className: options.className || "art-item",
      selected: options.selected,
      dataset: options.dataset,
      leadingNodes: options.leadingNodes,
      titleTagName: "span",
      titleClassName: "art-item-title",
      summaryClassName: "art-item-meta",
      title: options.title,
      summary: options.summary,
      onActivate: options.onActivate
    });
    return row;
  }

  const api = {
    createSidebarRow,
    createThumb
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameArtToolUi = api;
})(typeof window !== "undefined" ? window : globalThis);
