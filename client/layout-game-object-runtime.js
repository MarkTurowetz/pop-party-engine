(function attachLayoutGameObjectRuntime(global) {
  "use strict";

  function getOrCreateLayoutArtInstance(element, root, selector, className) {
    const id = String(element?.id || "");
    if (!id || !root) return null;
    let host = root.querySelector(`${selector}[data-layout-element-id="${CSS.escape(id)}"]`);
    if (!host) {
      host = document.createElement("div");
      host.className = className;
      host.dataset.layoutElementId = id;
      root.appendChild(host);
    }
    return host;
  }

  function renderLayoutArtInstance(element, host, options = {}) {
    const composition = artComposition(element?.artCompositionId);
    const artRuntime = global.PartyGameArtObject;
    const rendererKey = options.rendererKey || element?.id || "";
    if (!host) return null;
    if (!composition || !artRuntime) {
      options.clearRenderer?.(element?.id, host);
      host.dataset[options.missingDatasetKey] = "true";
      return null;
    }
    delete host.dataset[options.missingDatasetKey];
    host.dataset.layoutRendererKey = rendererKey;
    let renderer = options.renderers.get(rendererKey);
    if (!renderer) {
      const layer = document.createElement("div");
      layer.className = options.layerClassName;
      host.replaceChildren(layer);
      renderer = new artRuntime.ArtObjectTreeRenderer({
        host: layer,
        document,
        instanceId: `layout:${rendererKey}`,
        gameObjectApi: global.PartyGameGameObject || global.PartyGameStageGameObject,
        visualAnimation: global.PartyGameVisualObject
      });
      options.renderers.set(rendererKey, renderer);
    }
    renderer.render(composition.components || [], composition.canvas || { width: 1, height: 1 }, {
      defaultAnimation: "on",
      instant: true,
      // Placed layout prefab instances own park/appear/disappear at the host level.
      // Their internal art tree must be ready to show so a parked source root does not render as an empty instance.
      respectDefaultAnimationState: false
    });
    return renderer;
  }

  function clearLayoutArtInstanceRenderer(renderers, elementId, host = null) {
    const rendererKey = host?.dataset?.layoutRendererKey || elementId;
    const renderer = renderers.get(rendererKey);
    if (renderer) renderer.clear({ instant: true });
    renderers.delete(rendererKey);
    if (host) host.replaceChildren();
  }

  function removeInactiveLayoutArtInstances({ root, selector, activeIds, clearRenderer, registry }) {
    if (!root) return;
    for (const element of Array.from(root.querySelectorAll(`${selector}[data-layout-element-id]`))) {
      if (!activeIds.has(element.dataset.layoutElementId)) {
        clearRenderer(element.dataset.layoutElementId, element);
        registry?.remove(element.dataset.layoutElementId);
        element.remove();
      }
    }
  }

  function createDynamicLayoutArtInstanceApi(options = {}) {
    const renderers = options.renderers || new Map();
    const root = () => typeof options.root === "function" ? options.root() : options.root;
    const api = {
      getOrCreate(element) {
        return getOrCreateLayoutArtInstance(element, root(), options.selector, options.className);
      },
      render(element, host, rendererKey = "") {
        return renderLayoutArtInstance(element, host, {
          renderers,
          rendererKey,
          layerClassName: options.layerClassName,
          missingDatasetKey: options.missingDatasetKey,
          clearRenderer: api.clear
        });
      },
      clear(elementId, host = null) {
        clearLayoutArtInstanceRenderer(renderers, elementId, host);
      },
      removeInactive(activeIds, registry) {
        removeInactiveLayoutArtInstances({
          root: root(),
          selector: options.selector,
          activeIds,
          clearRenderer: api.clear,
          registry
        });
      }
    };
    return api;
  }

  function activeDynamicLayoutArtInstanceIds(state, globalLayout, isDynamicInstance) {
    const ids = new Set();
    for (const element of state?.elements || []) {
      if (isDynamicInstance(element)) ids.add(element.id);
    }
    if (globalLayout?.hiddenInStates === true) return ids;
    const hiddenGlobals = new Set(state?.hiddenGlobals || []);
    for (const element of globalLayout?.elements || []) {
      if (isDynamicInstance(element) && !hiddenGlobals.has(element.id)) ids.add(element.id);
    }
    return ids;
  }

  function beginLayoutElementTargetApplication(target, options = {}) {
    if (!target) return false;
    const isNewLayoutTarget = !target.classList.contains(options.targetClass);
    if (isNewLayoutTarget) target.classList.add(options.suppressedClass);
    target.classList.remove(options.hiddenClass);
    target.classList.add(options.targetClass);
    return isNewLayoutTarget;
  }

  function applyLayoutElementBoxStyles(target, element, prefix) {
    if (!target || !element || !prefix) return;
    target.style.setProperty(`--${prefix}-layout-x`, `${element.x}px`);
    target.style.setProperty(`--${prefix}-layout-y`, `${element.y}px`);
    target.style.setProperty(`--${prefix}-layout-w`, `${element.width}px`);
    target.style.setProperty(`--${prefix}-layout-h`, `${element.height}px`);
    target.style.setProperty(`--${prefix}-layout-scale`, `${element.scale || 1}`);
    target.style.setProperty(`--${prefix}-layout-rotation`, `${Number(element.rotation || 0)}deg`);
  }

  function finishLayoutElementTargetApplication(target, isNewLayoutTarget, suppressedClass) {
    if (!target || !isNewLayoutTarget) return;
    void target.offsetWidth;
    target.classList.remove(suppressedClass);
  }

  function layoutTargetByElementId({ root, elementId, layoutAttribute, dynamicSelector, globalClass = "", scope = "" }) {
    if (!root || !elementId) return null;
    const escapedId = CSS.escape(elementId);
    const escapedGlobalClass = globalClass ? CSS.escape(globalClass) : "";
    const scopedSuffix = scope === "global" && escapedGlobalClass
      ? `.${escapedGlobalClass}`
      : (scope === "moment" || scope === "controller") && escapedGlobalClass
        ? `:not(.${escapedGlobalClass})`
        : "";
    return root.querySelector(`[${layoutAttribute}="${escapedId}"]${scopedSuffix}`)
      || root.querySelector(`${dynamicSelector}[data-layout-element-id="${escapedId}"]${scopedSuffix}`)
      || root.querySelector(`[${layoutAttribute}="${escapedId}"]`)
      || root.querySelector(`${dynamicSelector}[data-layout-element-id="${escapedId}"]`);
  }

  function layoutElementVisibilityKey(elementId, target, options = {}) {
    if (options.scope === "global") return options.keyFor(elementId, true);
    if (options.scope === "moment") return options.keyFor(elementId, false);
    if (target?.dataset?.[options.visibilityDatasetKey]) return target.dataset[options.visibilityDatasetKey];
    if ((options.currentElements?.() || []).some((element) => element.id === elementId)) {
      return options.keyFor(elementId, false);
    }
    if ((options.globalElements?.() || []).some((element) => element.id === elementId)) {
      return options.keyFor(elementId, true);
    }
    return options.keyFor(elementId);
  }

  function layoutEntityForElementId(elementId, target = null, options = {}) {
    if (!elementId) return null;
    const registryKey = options.registryKeyFor?.(elementId, options.scope || "", target) || elementId;
    const entity = options.registry?.get(elementId, { registryKey });
    if (entity && (!options.scope || (options.scope === "global") === entity.isGlobal)) return entity;
    const resolvedTarget = target || options.targetByElementId?.(elementId, options.scope || "");
    if (!resolvedTarget) return null;
    const resolvedRegistryKey = options.registryKeyFor?.(elementId, options.scope || "", resolvedTarget) || registryKey;
    const fallbackEntity = {
      element: null,
      id: elementId,
      registryKey: resolvedRegistryKey,
      isArt: options.isGameObjectArtTarget?.(resolvedTarget) === true,
      isDynamic: options.isDynamicTarget?.(resolvedTarget) === true,
      isGlobal: options.isGlobalTarget?.(resolvedTarget) === true,
      target: resolvedTarget,
      visibilityKey: options.visibilityKeyForTarget?.(elementId, resolvedTarget, options.scope || "") || ""
    };
    return options.registry?.register(fallbackEntity) || fallbackEntity;
  }

  function layoutElementTargetMatchesSelector(element, target) {
    const selector = String(element?.selector || "");
    if (!selector || !target) return false;
    try {
      return target.matches(selector);
    } catch (_error) {
      return false;
    }
  }

  function registerPlacedLayoutEntity(element, target, isGlobal = false, options = {}) {
    const id = element?.id || "";
    const entity = {
      element,
      id,
      registryKey: options.registryKeyFor?.(id, isGlobal, target) || id,
      isArt: options.isArt?.(element, target) === true,
      isDynamic: options.isDynamic?.(element, target) === true,
      isGlobal: isGlobal === true,
      target,
      visibilityKey: options.visibilityKeyFor?.(id, isGlobal) || ""
    };
    return options.registry?.()?.register(entity) || entity;
  }

  function createPlacedLayoutEntityRegistrar(options = {}) {
    return (element, target, isGlobal = false) => registerPlacedLayoutEntity(element, target, isGlobal, options);
  }

  function attachRenderedLayoutArtEntity(entity, renderInstance) {
    const renderer = typeof renderInstance === "function" ? renderInstance() : null;
    entity?.update?.({
      artRenderer: renderer,
      syncArtRendererOnShow: Boolean(renderer)
    });
    return renderer;
  }

  function createPlacedLayoutGameObjectTargetResolver(options = {}) {
    const resolver = {
      entityForElementId(elementId, target = null, scope = "") {
        return layoutEntityForElementId(elementId, target, {
          registry: options.registry?.(),
          targetByElementId: options.targetByElementId,
          visibilityKeyForTarget: resolver.visibilityKeyForTarget,
          registryKeyFor: options.registryKeyFor,
          scope,
          isGameObjectArtTarget: options.isGameObjectArtTarget,
          isDynamicTarget: options.isDynamicTarget,
          isGlobalTarget: options.isGlobalTarget
        });
      },
      visibilityKeyForTarget(elementId, target = null, scope = "") {
        return options.visibilityKeyForTarget?.(elementId, target, scope) || "";
      },
      setShownForAction(action, showOptions = {}) {
        return setLayoutEntityShownForAction(action, {
          entityForElementId: resolver.entityForElementId,
          visibilityKeyForTarget: resolver.visibilityKeyForTarget,
          visibilityOverrides: options.visibilityOverrides,
          returnResult: showOptions.returnResult === true,
          suppressMissingWarning: showOptions.suppressMissingWarning === true
        });
      },
      applyVisibilityOverride(entity) {
        applyLayoutVisibilityOverride(entity, {
          visibilityOverrides: options.visibilityOverrides,
          hiddenClass: options.hiddenClass,
          exitingClass: options.exitingClass
        });
      }
    };
    return resolver;
  }

  function layoutGameObjectVisualFor(entity) {
    if (!entity?.target || !global.PartyGameVisualObject) return null;
    return typeof entity.createVisual === "function" ? entity.createVisual() : null;
  }

  function layoutDefaultVisibilityForEntity(entity) {
    const gameObjectApi = global.PartyGameGameObject || global.PartyGameStageGameObject;
    if (typeof gameObjectApi?.defaultVisibleFor === "function") return gameObjectApi.defaultVisibleFor(entity);
    return entity?.isDynamic && entity?.isArt ? false : null;
  }

  function applyLayoutEntityTargetVisibility(entity, isShown, options = {}) {
    if (typeof entity?.applyTargetVisibility === "function") {
      entity.applyTargetVisibility(isShown === true);
      return true;
    }
    const target = entity?.target;
    if (!target) return false;
    target.dataset.visualVisible = isShown ? "true" : "false";
    if (isShown) {
      target.classList.remove(options.hiddenClass, options.exitingClass);
      return true;
    }
    if (!target.classList.contains(options.exitingClass)) {
      target.classList.add(options.hiddenClass);
    }
    return true;
  }

  function applyLayoutDefaultVisibility(entity, options = {}) {
    const target = entity?.target;
    if (!target || options.visibilityOverrides?.has(entity?.visibilityKey || "")) return false;
    const isShown = layoutDefaultVisibilityForEntity(entity);
    if (isShown === null) return false;
    return applyLayoutEntityTargetVisibility(entity, isShown, options);
  }

  function applyLayoutVisibilityOverride(entity, options = {}) {
    if (typeof entity?.applyVisibilityState === "function") {
      entity.applyVisibilityState();
      return;
    }
    if (options.visibilityOverrides?.has(entity?.visibilityKey || "") && typeof entity?.applyVisibilityOverride === "function") {
      entity.applyVisibilityOverride();
      return;
    }
    const target = entity?.target;
    const visibilityKey = entity?.visibilityKey || "";
    if (!visibilityKey || !target) return;
    if (!options.visibilityOverrides?.has(visibilityKey)) {
      applyLayoutDefaultVisibility(entity, options);
      return;
    }
    const isShown = options.visibilityOverrides.get(visibilityKey) !== false;
    applyLayoutEntityTargetVisibility(entity, isShown, options);
  }

  function playLayoutEntityVisibility(entity, isShown, options = {}) {
    if (typeof entity?.playVisibility === "function") {
      return entity.playVisibility(isShown, { instant: options.instant === true });
    }
    const target = entity?.target || null;
    const visual = layoutGameObjectVisualFor(entity);
    if (!target || !visual) {
      options.warn?.("visual object unavailable");
      return 0;
    }
    const result = global.PartyGameVisualBridge?.playVisibilityForTarget?.({
      target,
      visual,
      isShown,
      playOptions: { instant: options.instant === true }
    });
    return result?.duration || 0;
  }

  function layoutGameObjectMissingTargetReason(details = {}) {
    const actionVerb = details.isShown ? "show" : "hide";
    const scopeText = details.scope ? ` in ${details.scope} scope` : "";
    if (details.visibilityKey) {
      return `placed instance not active${scopeText}; saved pending ${actionVerb} for ${details.visibilityKey}`;
    }
    if (details.sourceArtAsset) {
      return `target id is a source prefab (${details.elementId}); add it to this layout and target the placed game object instance`;
    }
    return `no placed layout entity found for ${details.elementId || "unknown target"}${scopeText}`;
  }

  function setLayoutEntityShownForAction(action, options = {}) {
    const elementId = action?.targetLayoutElementId || "";
    const result = (duration, missing = false, reason = "") => options.returnResult
      ? { duration: Math.max(0, Number(duration || 0)), missing, reason }
      : Math.max(0, Number(duration || 0));
    if (!elementId || !global.PartyGameVisualObject) return result(0, true, "missing target id or visual runtime");
    const isShown = action.isShown !== false;
    const scope = ["global", "moment"].includes(String(action?.targetLayoutScope || "")) ? action.targetLayoutScope : "";
    const sourceArtAsset = typeof artComposition === "function" ? artComposition(elementId) : null;
    const warn = (reason) => {
      const warning = {
        elementId,
        name: action?.name || action?.actionName || "",
        scope,
        reason
      };
      if (typeof global.PartyGameStageDebugRuntime?.showGameObjectWarning === "function") {
        global.PartyGameStageDebugRuntime.showGameObjectWarning(warning);
      } else {
        global.PartyGameStageDebugRuntime?.showArtAssetWarning?.(warning);
      }
    };
    const entity = options.entityForElementId?.(elementId, null, scope);
    const target = entity?.target || null;
    const visibilityKey = entity?.visibilityKey || options.visibilityKeyForTarget?.(elementId, target, scope);
    if (!target) {
      if (visibilityKey) options.visibilityOverrides?.set(visibilityKey, isShown);
      const reason = layoutGameObjectMissingTargetReason({
        elementId,
        isShown,
        scope,
        sourceArtAsset,
        visibilityKey
      });
      if (options.suppressMissingWarning !== true) warn(reason);
      return result(0, true, reason);
    }
    if (visibilityKey) options.visibilityOverrides?.set(visibilityKey, isShown);
    return result(playLayoutEntityVisibility(entity || options.entityForElementId?.(elementId, target, scope), isShown, {
      instant: action.instant === true,
      warn
    }));
  }

  function setLayoutGameObjectShownForAction(action, options = {}) {
    return setLayoutEntityShownForAction(action, options);
  }

  global.PartyGameLayoutGameObjects = {
    activeDynamicLayoutArtInstanceIds,
    applyLayoutElementBoxStyles,
    attachRenderedLayoutArtEntity,
    beginLayoutElementTargetApplication,
    createDynamicLayoutArtInstanceApi,
    createPlacedLayoutEntityRegistrar,
    createPlacedLayoutGameObjectTargetResolver,
    finishLayoutElementTargetApplication,
    layoutElementTargetMatchesSelector,
    layoutElementVisibilityKey,
    layoutTargetByElementId,
    setLayoutGameObjectShownForAction
  };
})(window);
