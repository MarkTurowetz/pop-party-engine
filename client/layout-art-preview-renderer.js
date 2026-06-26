(function attachPartyGameLayoutArtPreviewRenderer(global) {
  "use strict";

  function cloneComponentWithTextOverrides(component, textOverrides = {}) {
    const clone = {
      ...component,
      children: (component.children || []).map((child) => cloneComponentWithTextOverrides(child, textOverrides))
    };
    const kind = global.PartyGameArtComponentSchema?.normalizeComponentKind?.(clone.kind) || clone.kind;
    if ((kind === "text" || kind === "badge") && Object.prototype.hasOwnProperty.call(textOverrides, clone.id)) {
      clone.defaultText = String(textOverrides[clone.id] ?? "");
    }
    return clone;
  }

  function create(options = {}) {
    const documentRef = options.document || global.document;
    const artRuntime = options.artRuntime || global.PartyGameArtObject;
    const widgetBindings = options.widgetBindings || global.PartyGameStageWidgetBindings;
    const artComposition = typeof options.artComposition === "function" ? options.artComposition : () => null;

    function renderArtComposition(content, compositionId, textOverrides = {}, instanceKey = compositionId) {
      const composition = artComposition(compositionId);
      if (!content || !composition || !artRuntime) return false;
      content.classList.add("is-art-composition-preview");
      const components = (composition.components || []).map((component) => cloneComponentWithTextOverrides(component, textOverrides));
      const renderer = new artRuntime.ArtObjectTreeRenderer({
        host: content,
        document: documentRef,
        instanceId: `layout-preview:${instanceKey || compositionId}`,
        gameObjectApi: options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject,
        visualAnimation: options.visualAnimation || global.PartyGameVisualObject
      });
      renderer.render(components, composition.canvas || { width: 1, height: 1 }, {
        instant: true,
        respectDefaultAnimationState: false
      });
      return true;
    }

    function renderArtCompositionPreview(content, element) {
      const compositionId = element?.artCompositionId || "";
      if (!compositionId) return false;
      return renderArtComposition(content, compositionId, {}, element?.id || compositionId);
    }

    function renderWidgetArtPreview(content, elementId) {
      const binding = widgetBindings?.definitionForLayoutElement?.(elementId);
      if (!binding) return false;
      return renderArtComposition(
        content,
        binding.compositionId,
        widgetBindings?.previewTextOverrides?.(elementId) || {},
        elementId || binding.compositionId
      );
    }

    return {
      renderArtComposition,
      renderArtCompositionPreview,
      renderWidgetArtPreview
    };
  }

  global.PartyGameLayoutArtPreviewRenderer = {
    create,
    cloneComponentWithTextOverrides
  };
})(typeof window !== "undefined" ? window : globalThis);
