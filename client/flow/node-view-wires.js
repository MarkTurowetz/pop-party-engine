(function () {
  "use strict";

  const svgNamespace = "http://www.w3.org/2000/svg";

  function createFlowNodeWireRenderer(context) {
    const graph = () => context.flowNodeGraph?.() || null;
    const wires = () => context.flowNodeWires?.() || null;
    const labels = () => context.flowNodeWireLabels?.() || null;
    const zoom = () => Number(context.flowNodeZoom?.() || 1) || 1;

    function clear() {
      wires()?.replaceChildren();
      labels()?.replaceChildren();
    }

    function rectPoint(node, anchor = "center") {
      const root = graph();
      if (!node || !root) return { x: 0, y: 0 };
      const nodeRect = node.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const x = nodeRect.left - rootRect.left + nodeRect.width / 2;
      const anchorY = anchor === "top"
        ? nodeRect.top - rootRect.top
        : anchor === "bottom"
          ? nodeRect.bottom - rootRect.top
          : nodeRect.top - rootRect.top + nodeRect.height / 2;
      return {
        x: x / zoom(),
        y: anchorY / zoom()
      };
    }

    function nodePoint(node, anchor = "center") {
      if (node?.classList?.contains("flow-node-branch") || node?.classList?.contains("flow-node-subaction")) {
        if (anchor === "source") return rectPoint(node.closest(".flow-node") || node, "bottom");
        return rectPoint(node, anchor === "target" ? "top" : "center");
      }
      if (anchor === "source") return rectPoint(node, "bottom");
      if (anchor === "target") {
        const main = node.querySelector?.(".flow-node-main");
        return rectPoint(main || node, "top");
      }
      const main = node.querySelector?.(".flow-node-main");
      return rectPoint(main || node, "center");
    }

    function addLabel(text, from, to) {
      const labelLayer = labels();
      if (!labelLayer || !text) return;
      const label = document.createElement("div");
      label.className = "flow-node-wire-label";
      label.textContent = text;
      label.style.left = `${(from.x + to.x) / 2}px`;
      label.style.top = `${(from.y + to.y) / 2}px`;
      labelLayer.appendChild(label);
    }

    function bezierPath(from, to) {
      const curve = Math.max(50, Math.abs(to.y - from.y) * 0.35);
      return `M ${from.x} ${from.y} C ${from.x} ${from.y + curve}, ${to.x} ${to.y - curve}, ${to.x} ${to.y}`;
    }

    function draw(fromNode, toNode, optionsOrMuted = false) {
      const wireLayer = wires();
      if (!fromNode || !toNode || !wireLayer) return;
      const options = typeof optionsOrMuted === "boolean" ? { muted: optionsOrMuted } : (optionsOrMuted || {});
      const from = nodePoint(fromNode, options.fromAnchor || "source");
      const to = nodePoint(toNode, options.toAnchor || "target");
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute("class", `flow-node-wire${options.muted ? " is-muted" : ""}${options.highlighted ? " is-highlighted" : ""}`);
      path.setAttribute("d", bezierPath(from, to));
      wireLayer.appendChild(path);
      addLabel(options.label || "", from, to);
    }

    function drawPreview(fromNode, to) {
      const wireLayer = wires();
      if (!fromNode || !to || !wireLayer) return;
      const from = nodePoint(fromNode, "source");
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute("class", "flow-node-wire is-preview");
      path.setAttribute("d", bezierPath(from, to));
      wireLayer.appendChild(path);
    }

    function localPoint(event) {
      const root = graph();
      if (!root) return { x: 0, y: 0 };
      const rootRect = root.getBoundingClientRect();
      return {
        x: (event.clientX - rootRect.left) / zoom(),
        y: (event.clientY - rootRect.top) / zoom()
      };
    }

    return {
      clear,
      draw,
      drawPreview,
      localPoint
    };
  }

  window.PartyGameFlowNodeWires = { createFlowNodeWireRenderer };
})();
