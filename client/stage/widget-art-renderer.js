(function attachPartyGameStageWidgetArt(global) {
  "use strict";

  function createRenderer(options = {}) {
    const documentRef = options.document || global.document;
    const visualAnimation = options.visualAnimation || global.visualAnimation;
    const getComposition = typeof options.getComposition === "function" ? options.getComposition : () => null;
    const renderers = new Map();

    function rendererKey(host, compositionId) {
      return `${host?.id || host?.className || "stage-widget"}:${compositionId}`;
    }

    function widgetLayer(host) {
      if (!host) return null;
      let layer = Array.from(host.children).find((child) => child.classList?.contains("stage-widget-art-layer"));
      if (!layer) {
        layer = documentRef.createElement("div");
        layer.className = "stage-widget-art-layer";
        host.prepend(layer);
      }
      return layer;
    }

    function cloneComponent(component, textOverrides = {}) {
      const clone = {
        ...component,
        children: (component.children || []).map((child) => cloneComponent(child, textOverrides))
      };
      if (Object.prototype.hasOwnProperty.call(textOverrides, clone.id)) {
        clone.defaultText = String(textOverrides[clone.id] ?? "");
      }
      return clone;
    }

    function render(host, compositionId, textOverrides = {}, renderOptions = {}) {
      const composition = getComposition(compositionId);
      const artRuntime = global.PartyGameArtObject;
      if (!host || !composition || !artRuntime) return null;
      host.classList.add("stage-widget-art-host", "has-stage-widget-art");
      const layer = widgetLayer(host);
      if (!layer) return null;
      const key = rendererKey(host, compositionId);
      let renderer = renderers.get(key);
      if (!renderer) {
        renderer = new artRuntime.ArtObjectTreeRenderer({
          host: layer,
          document: documentRef,
          visualAnimation
        });
        renderers.set(key, renderer);
      }
      const components = (composition.components || []).map((component) => cloneComponent(component, textOverrides));
      renderer.render(components, composition.canvas || { width: 1, height: 1 }, { instant: renderOptions.instant !== false });
      return composition;
    }

    function componentById(composition, componentId) {
      const stack = [...(composition?.components || [])];
      while (stack.length) {
        const component = stack.shift();
        if (component.id === componentId) return component;
        stack.push(...(component.children || []));
      }
      return null;
    }

    function positionOverlay(host, composition, componentId, overlay) {
      const component = componentById(composition, componentId);
      if (!host || !component || !overlay) return;
      const canvas = composition.canvas || { width: 1, height: 1 };
      overlay.classList.add("stage-widget-art-overlay");
      overlay.style.left = `${Number(component.x || 0) / Math.max(1, Number(canvas.width || 1)) * 100}%`;
      overlay.style.top = `${Number(component.y || 0) / Math.max(1, Number(canvas.height || 1)) * 100}%`;
      overlay.style.width = `${Number(component.width || 1) / Math.max(1, Number(canvas.width || 1)) * 100}%`;
      overlay.style.height = `${Number(component.height || 1) / Math.max(1, Number(canvas.height || 1)) * 100}%`;
      overlay.style.transform = "translate(-50%, -50%)";
    }

    return { render, positionOverlay };
  }

  global.PartyGameStageWidgetArt = { createRenderer };
})(window);
