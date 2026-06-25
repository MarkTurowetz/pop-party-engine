function setupLab() {
  labScreen.classList.remove("hidden");
  const stageCode = getStageCodeFromUrl() || generateStageCode();
  document.querySelector("#stageLinkFromLab").href = `${origin}/stage?stage=${stageCode}`;
  document.querySelector("#stageFrame").src = `${origin}/stage?stage=${stageCode}`;
  document.querySelector("#controllerFrame").src = `${origin}/controller?stage=${stageCode}`;
}

let selectedArtCompositionId = "";
let selectedArtComponentId = "";
let selectedArtComponentIds = new Set();
let selectedArtSurface = "stage";
let draggedArtComponentId = "";
let artCreateKindMenu = null;
const artComponentSchema = window.PartyGameArtComponentSchema;
const artComponentTree = window.PartyGameArtComponentTree;
const artToolUi = window.PartyGameArtToolUi;
const artSidebarRendererRuntime = window.PartyGameArtSidebarRenderer;
const artComponentEditorRuntime = window.PartyGameArtComponentEditor;
const editableArtRenderer = window.PartyGameEditableArtRenderer;
const artShapeStyles = artComponentSchema.shapeStyleOptions;
const artComponentImageAccept = artComponentSchema.imageAccept;
const artSectionCollapseIds = ["player-avatars", "presentation-click-prompt"];
let artSidebarRenderer = null;
let artComponentEditorRenderer = null;

function serializeArtCompositionsForSave(source = artCompositions) {
  return (source || []).map((composition) => ({
    id: composition.id,
    name: composition.name || "Art Asset",
    description: composition.description || "",
    surface: normalizeArtCompositionSurface(composition.surface),
    isCustom: Boolean(composition.isCustom),
    canvas: {
      width: Number(composition.canvas?.width || 1),
      height: Number(composition.canvas?.height || 1)
    },
    components: (composition.components || []).map(serializeArtComponentForSave)
  }));
}

function normalizeArtCompositionSurface(surface) {
  return surface === "controller" ? "controller" : "stage";
}

function serializeArtComponentForSave(component) {
  return {
    id: component.id,
    name: component.name || artKindLabel(component.kind || "shape"),
    kind: component.kind || "shape",
    x: Number(Number(component.x || 0).toFixed(3)),
    y: Number(Number(component.y || 0).toFixed(3)),
    width: Number(Number(component.width || 1).toFixed(3)),
    height: Number(Number(component.height || 1).toFixed(3)),
    scale: Number(Number(component.scale || 1).toFixed(3)),
    rotation: Number(Number(component.rotation || 0).toFixed(3)),
    defaultAnimationState: component.defaultAnimationState || "",
    defaultText: component.defaultText || "",
    fontSize: Number(Number(component.fontSize || 16).toFixed(3)),
    autoFitText: component.autoFitText === true,
    fontColor: component.fontColor || "#17131f",
    shapeStyle: artComponentSchema.normalizeShapeStyle(component.shapeStyle, component.kind),
    fillColor: component.fillColor || "transparent",
    fillCss: artComponentSchema.normalizeFillCss(component.fillCss),
    borderColor: component.borderColor || "transparent",
    borderWidth: Number(Number(component.borderWidth || 0).toFixed(3)),
    borderRadius: Number(Number(component.borderRadius || 0).toFixed(3)),
    imageDataUrl: artComponentSupportsImageMask(component) ? component.imageDataUrl || "" : "",
    imageAssetId: artComponentSupportsImageMask(component) ? component.imageAssetId || "" : "",
    imageName: artComponentSupportsImageMask(component) ? component.imageName || "" : "",
    imageMimeType: artComponentSupportsImageMask(component) ? component.imageMimeType || "" : "",
    imageObjectFit: artComponentSupportsImageMask(component) ? artComponentSchema.normalizeImageObjectFit(component.imageObjectFit) : "cover",
    imageTint: artComponentSupportsImageMask(component) ? component.imageTint || "" : "",
    children: (component.children || []).map(serializeArtComponentForSave)
  };
}

function isArtCompositionsDirty() {
  return artCompositionsSavedSnapshot && (
    JSON.stringify(serializeArtCompositionsForSave(artCompositions)) !== artCompositionsSavedSnapshot
    || artCompositionsPendingDeleteCount() > 0
  );
}

function artCompositionHistorySnapshot() {
  return JSON.stringify({
    compositions: serializeArtCompositionsForSave(artCompositions),
    pendingDeleteIds: pendingArtCompositionDeleteIds()
  });
}

function getArtHistoryManager() {
  if (!artHistoryManager && window.PartyGameToolHistory) {
    artHistoryManager = window.PartyGameToolHistory.createHistory({
      snapshot: artCompositionHistorySnapshot,
      restore: restoreArtCompositionHistory,
      limit: 30
    });
  }
  return artHistoryManager;
}

function pushArtHistory() {
  getArtHistoryManager()?.push();
}

function restoreArtCompositionHistory(snapshot) {
  const preferredCompositionId = selectedArtCompositionId;
  const preferredComponentIds = [...selectedArtComponentIds];
  const parsed = JSON.parse(snapshot);
  const snapshotCompositions = Array.isArray(parsed) ? parsed : parsed.compositions || [];
  clearAllArtCompositionPendingDeletes();
  for (const compositionId of (Array.isArray(parsed?.pendingDeleteIds) ? parsed.pendingDeleteIds : [])) {
    markArtCompositionPendingDelete(compositionId);
  }
  artCompositions = snapshotCompositions.filter((composition) => !isArtCompositionPendingDelete(composition.id));
  selectedArtCompositionId = preferredCompositionId && artComposition(preferredCompositionId)
    ? preferredCompositionId
    : artCompositions[0]?.id || "";
  const composition = selectedArtComposition();
  const validIds = allArtComponentIds(composition);
  selectedArtComponentIds = new Set(preferredComponentIds.filter((id) => validIds.has(id)));
  selectedArtComponentId = [...selectedArtComponentIds].pop() || "";
  if (composition) {
    selectedArtAsset = null;
    selectedArtComposite = null;
    pendingArtReplacement = null;
    renderSelectedArtComposition();
  } else {
    hideArtComponentEditor();
  }
  renderArtList();
  rememberArtCompositionDrafts();
  notifyArtAssetsChanged();
  updateGlobalSaveButton();
}

function undoArtCompositionChange() {
  getArtHistoryManager()?.undo();
}

function redoArtCompositionChange() {
  getArtHistoryManager()?.redo();
}

function handleArtHotkeys(event) {
  if (artScreen.classList.contains("hidden")) return;
  if (window.PartyGameToolAffordances?.handleToolHistoryHotkey(event, {
    onUndo: undoArtCompositionChange,
    onRedo: redoArtCompositionChange
  })) return;
  window.PartyGameToolAffordances?.handleToolDeleteHotkey(event, {
    canDelete: () => selectedArtComponentIds.size > 0,
    onDelete: deleteSelectedArtComponents
  });
}

function selectedArtComposition() {
  return artComposition(selectedArtCompositionId);
}

function visibleArtCompositions() {
  return (artCompositions || []).filter((composition) => normalizeArtCompositionSurface(composition.surface) === selectedArtSurface);
}

function artSurfaceLabel(surface = selectedArtSurface) {
  return normalizeArtCompositionSurface(surface) === "controller" ? "Controller Art" : "Stage Art";
}

function selectedArtComponents() {
  const composition = selectedArtComposition();
  return flattenArtComponents(composition?.components || []).filter(({ component }) => selectedArtComponentIds.has(component.id)).map(({ component }) => component);
}

function selectedEditableArtComponent() {
  const components = selectedArtComponents();
  return components[components.length - 1] || null;
}

function artKindLabel(kind) {
  return artComponentSchema.componentKindLabel(kind);
}

function artComponentSupportsImageMask(component) {
  return artComponentSchema.componentSupportsImageMask(component);
}

function artComponentHasImageMask(component) {
  return artComponentSchema.componentHasImageMask(component);
}

function artComponentImageSource(component) {
  if (!artComponentSupportsImageMask(component)) return "";
  return component.imageDataUrl || artAssetUrl(component.imageAssetId) || "";
}

function flattenArtComponents(components = [], depth = 0, parent = null, output = []) {
  return artComponentTree.flattenComponents(components, depth, parent, output);
}

function findArtComponent(composition, componentId) {
  return artComponentTree.findComponent(composition?.components || [], componentId);
}

function artComponentCollectionRef(composition, componentId, components = composition?.components || [], parent = null) {
  if (!composition) return null;
  return artComponentTree.collectionRef(components, componentId, parent);
}

function canReorderArtComponent(draggedComponentId, targetComponentId) {
  const composition = selectedArtComposition();
  const draggedRef = artComponentCollectionRef(composition, draggedComponentId);
  const targetRef = artComponentCollectionRef(composition, targetComponentId);
  return Boolean(draggedRef && targetRef && draggedRef.components === targetRef.components);
}

function reorderArtComponent(draggedComponentId, targetComponentId, placeAfter = false) {
  const composition = selectedArtComposition();
  const draggedRef = artComponentCollectionRef(composition, draggedComponentId);
  const targetRef = artComponentCollectionRef(composition, targetComponentId);
  if (!draggedRef || !targetRef || draggedRef.components !== targetRef.components || draggedComponentId === targetComponentId) return;
  const siblings = draggedRef.components;
  const fromIndex = siblings.findIndex((component) => component.id === draggedComponentId);
  const targetIndex = siblings.findIndex((component) => component.id === targetComponentId);
  if (fromIndex < 0 || targetIndex < 0) return;
  pushArtHistory();
  const [component] = siblings.splice(fromIndex, 1);
  const adjustedTargetIndex = siblings.findIndex((item) => item.id === targetComponentId);
  const insertIndex = adjustedTargetIndex + (placeAfter ? 1 : 0);
  siblings.splice(Math.max(0, Math.min(siblings.length, insertIndex)), 0, component);
  setArtComponentSelection([component.id]);
  renderSelectedArtComposition();
  renderArtList();
  artFileName.textContent = "Layer order updated";
  updateGlobalSaveButton();
}

function allArtComponentIds(composition) {
  return artComponentTree.componentIds(composition?.components || []);
}

function artCompositeCollapseIds() {
  const ids = [];
  for (const composite of avatarComposites || []) ids.push(composite.id);
  for (const composition of artCompositions || []) {
    ids.push(composition.id);
    for (const { component } of flattenArtComponents(composition.components || [])) {
      if (component.children?.length) ids.push(`${composition.id}:${component.id}`);
    }
  }
  return ids;
}

function persistArtCollapseState() {
  setLocalValue("partyTemplate.collapsedArtSections", JSON.stringify([...collapsedArtSections]));
  setLocalValue("partyTemplate.collapsedArtComposites", JSON.stringify([...collapsedArtComposites]));
}

function renderAndPersistArtCollapseState() {
  persistArtCollapseState();
  renderArtList();
}

function toggleArtCollapsedIds(collapsedSet, ids) {
  window.PartyGameToolAffordances?.toggleCollapsedSetForIds(collapsedSet, ids);
  renderAndPersistArtCollapseState();
}

function artSidebarState() {
  const isStageSurface = selectedArtSurface === "stage";
  return {
    artAssets: isStageSurface ? artAssets : [],
    avatarComposites: isStageSurface ? avatarComposites : [],
    artCompositions: visibleArtCompositions(),
    selectedArtSurface,
    artSectionCollapseIds,
    collapsedArtSections,
    collapsedArtComposites,
    selectedArtAsset,
    selectedArtComposite,
    selectedArtCompositionId,
    selectedArtComponentId,
    selectedArtComponentIds
  };
}

function handleArtComponentSidebarDragStart(compositionId, componentId, row) {
  draggedArtComponentId = componentId;
  selectedArtAsset = null;
  selectedArtComposite = null;
  selectedArtCompositionId = compositionId;
  if (!selectedArtComponentIds.has(componentId)) {
    setArtComponentSelection([componentId]);
    row.classList.add("is-selected");
    renderArtComponentEditor();
    renderSelectedArtComposition();
  }
}

function getArtSidebarRenderer() {
  if (!artSidebarRenderer) {
    artSidebarRenderer = artSidebarRendererRuntime.create({
      ui: artToolUi,
      componentTree: artComponentTree,
      getState: artSidebarState,
      artKindLabel,
      compositePreviewMarkup,
      onCollapseChange: renderAndPersistArtCollapseState,
      onToggleCollapsedIds: toggleArtCollapsedIds,
      onSelectArtAsset: selectArtAsset,
      onSelectArtComposite: selectArtComposite,
      onSelectArtComposition: selectArtComposition,
      onSelectArtComponent: selectArtComponent,
      getDraggedComponentId: () => draggedArtComponentId,
      canReorderArtComponent,
      onComponentDragStart: handleArtComponentSidebarDragStart,
      onReorderArtComponent: reorderArtComponent,
      onComponentDragEnd: () => {
        draggedArtComponentId = "";
      }
    });
  }
  return artSidebarRenderer;
}

function renderArtList() {
  renderArtSurfaceTabs();
  getArtSidebarRenderer().render(artAssetList);
  updateArtCreateButtons();
}

function renderArtSurfaceTabs() {
  for (const tab of artSurfaceTabs || []) {
    const isSelected = tab.dataset.artSurface === selectedArtSurface;
    tab.classList.toggle("is-selected", isSelected);
    tab.setAttribute("aria-selected", isSelected ? "true" : "false");
  }
}

function selectArtSurface(surface) {
  const nextSurface = normalizeArtCompositionSurface(surface);
  if (selectedArtSurface === nextSurface) return;
  selectedArtSurface = nextSurface;
  selectedArtAsset = null;
  selectedArtComposite = null;
  const visible = visibleArtCompositions();
  const currentComposition = selectedArtComposition();
  selectedArtCompositionId = currentComposition && normalizeArtCompositionSurface(currentComposition.surface) === selectedArtSurface
    ? currentComposition.id
    : visible[0]?.id || "";
  selectedArtComponentId = "";
  selectedArtComponentIds = new Set();
  pendingArtReplacement = null;
  if (selectedArtCompositionId) {
    renderSelectedArtComposition();
  } else {
    hideArtComponentEditor();
    artPreviewTitle.textContent = artSurfaceLabel();
    artPreviewMeta.textContent = "Create an art asset to edit this surface.";
    artPreviewArt.className = "art-preview-art";
    artPreviewArt.replaceChildren();
    updateArtCompositionDeleteButton();
  }
  artFileName.textContent = `${artSurfaceLabel()} selected`;
  artFileInput.value = "";
  renderArtList();
  updateGlobalSaveButton();
}

function compositePreviewMarkup(composite) {
  return `
    <img alt="" src="${artAssetUrl("avatar-frame")}">
    <span class="art-composite-dino" style="--preview-dino-url:${cssUrl(artAssetUrl(composite.dinoAssetId))}"></span>
  `;
}

function selectArtAsset(assetId) {
  selectedArtAsset = artAssets.find((asset) => asset.id === assetId) || artAssets[0] || null;
  selectedArtComposite = null;
  selectedArtCompositionId = "";
  selectedArtComponentId = "";
  selectedArtComponentIds = new Set();
  pendingArtReplacement = null;
  hideArtComponentEditor();
  if (!selectedArtAsset) {
    artPreviewTitle.textContent = "No Assets";
    artPreviewMeta.textContent = "No replaceable art assets are registered yet.";
    artPreviewArt.className = "art-preview-art";
    artPreviewArt.replaceChildren();
    artReplaceButton.disabled = true;
    artCancelButton.disabled = true;
    updateArtCompositionDeleteButton();
    artFileName.textContent = "No replacement selected";
    return;
  }

  artPreviewTitle.textContent = selectedArtAsset.name;
  renderArtPreviewMeta(selectedArtAsset);
  renderSelectedArtPreview(selectedArtAsset.currentUrl);
  artFileName.textContent = selectedArtAsset.hasCustom ? `Current: ${selectedArtAsset.fileName}` : "Using default art";
  artReplaceButton.disabled = false;
  artCancelButton.disabled = true;
  updateArtCompositionDeleteButton();
  artFileInput.value = "";
  renderArtList();
  updateArtCreateButtons();
  updateGlobalSaveButton();
}

function renderSelectedArtPreview(sourceUrl) {
  artPreviewArt.className = `art-preview-art${selectedArtAsset?.id === "avatar-frame" ? " is-frame-preview" : ""}`;
  artPreviewArt.replaceChildren();
  const image = document.createElement("img");
  image.id = "artPreviewImage";
  image.alt = selectedArtAsset?.name || "";
  image.src = sourceUrl || "";
  artPreviewArt.appendChild(image);
}

function selectArtComposite(compositeId) {
  selectedArtComposite = avatarComposites.find((composite) => composite.id === compositeId) || avatarComposites[0] || null;
  selectedArtAsset = null;
  selectedArtCompositionId = "";
  selectedArtComponentId = "";
  selectedArtComponentIds = new Set();
  pendingArtReplacement = null;
  hideArtComponentEditor();
  if (!selectedArtComposite) return;
  artPreviewTitle.textContent = selectedArtComposite.name;
  artPreviewMeta.replaceChildren();
  const copy = document.createElement("span");
  copy.textContent = "Composite preview: this game object is built from Dino Art plus Rectangle (shared). Select a child asset below it to replace one layer.";
  artPreviewMeta.appendChild(copy);
  artPreviewArt.className = "art-preview-art is-composite-preview";
  artPreviewArt.innerHTML = compositePreviewMarkup(selectedArtComposite);
  artFileName.textContent = "Select a nested asset to replace art";
  artReplaceButton.disabled = true;
  artCancelButton.disabled = true;
  updateArtCompositionDeleteButton();
  artFileInput.value = "";
  renderArtList();
  updateArtCreateButtons();
  updateGlobalSaveButton();
}

function selectArtComposition(compositionId) {
  const composition = artComposition(compositionId);
  if (!composition) return;
  selectedArtAsset = null;
  selectedArtComposite = null;
  selectedArtCompositionId = composition.id;
  selectedArtComponentId = "";
  selectedArtComponentIds = new Set();
  pendingArtReplacement = null;
  renderSelectedArtComposition();
  renderArtList();
  updateArtCreateButtons();
  updateGlobalSaveButton();
}

function selectArtComponent(compositionId, componentId, options = {}) {
  const composition = artComposition(compositionId);
  if (!composition) return;
  selectedArtAsset = null;
  selectedArtComposite = null;
  selectedArtCompositionId = composition.id;
  const validIds = allArtComponentIds(composition);
  if (options.additive) {
    setArtComponentSelection(PartyGameToolAffordances.toggleSelectionId(selectedArtComponentIds, componentId, validIds));
  } else {
    setArtComponentSelection(validIds.has(componentId) ? [componentId] : []);
  }
  renderSelectedArtComposition();
  renderArtList();
  updateArtCreateButtons();
}

function setArtComponentSelection(componentIds) {
  const composition = selectedArtComposition();
  if (!composition) {
    selectedArtComponentIds = new Set();
    selectedArtComponentId = "";
    return;
  }
  const validIds = allArtComponentIds(composition);
  const selection = PartyGameToolAffordances.normalizeSelection(componentIds, validIds);
  selectedArtComponentIds = selection.idSet;
  selectedArtComponentId = selection.primaryId;
}

function renderArtSelectionOnly() {
  for (const node of artPreviewArt.querySelectorAll(".art-composition-component")) {
    node.classList.toggle("is-selected", selectedArtComponentIds.has(node.dataset.componentId));
  }
  renderArtList();
  renderArtComponentEditor();
  updateArtCreateButtons();
}

function removeSelectedArtComponentsFromList(components = [], selectedIds, removedIds = []) {
  return (components || []).filter((component) => {
    if (selectedIds.has(component.id)) {
      removedIds.push(component.id);
      return false;
    }
    if (Array.isArray(component.children)) {
      component.children = removeSelectedArtComponentsFromList(component.children, selectedIds, removedIds);
    }
    return true;
  });
}

function deleteSelectedArtComponents() {
  const composition = selectedArtComposition();
  const selectedIds = new Set(selectedArtComponentIds);
  if (!composition || !selectedIds.size) return;
  const beforeComponents = flattenArtComponents(composition.components || []).map(({ component }) => component.id);
  const firstDeletedIndex = beforeComponents.findIndex((id) => selectedIds.has(id));
  if (firstDeletedIndex < 0) return;
  const removedIds = [];
  pushArtHistory();
  composition.components = removeSelectedArtComponentsFromList(composition.components || [], selectedIds, removedIds);
  const afterComponents = flattenArtComponents(composition.components || []).map(({ component }) => component.id);
  const nextId = afterComponents[Math.min(firstDeletedIndex, afterComponents.length - 1)] || afterComponents[firstDeletedIndex - 1] || "";
  setArtComponentSelection(nextId ? [nextId] : []);
  renderSelectedArtComposition();
  renderArtList();
  artFileName.textContent = removedIds.length === 1 ? "Deleted 1 component" : `Deleted ${removedIds.length} components`;
  rememberArtCompositionDrafts();
  notifyArtAssetsChanged();
  updateGlobalSaveButton();
}

function hideArtComponentEditor() {
  artComponentEditor?.classList.add("hidden");
  artSaveCompositionButton?.classList.add("hidden");
  if (artSaveCompositionButton) artSaveCompositionButton.disabled = true;
  artDeleteCompositionButton?.classList.add("hidden");
  if (artDeleteCompositionButton) artDeleteCompositionButton.disabled = true;
}

function renderSelectedArtComposition(options = {}) {
  const composition = selectedArtComposition();
  if (!composition) return;
  artPreviewTitle.textContent = composition.name;
  artPreviewMeta.textContent = composition.description || `Editable ${artSurfaceLabel().toLowerCase()}.`;
  artPreviewArt.className = "art-preview-art is-composition-editor";
  const canvas = composition.canvas || { width: 560, height: 230 };
  artPreviewArt.style.setProperty("--art-composition-aspect", `${Number(canvas.width || 1) / Math.max(1, Number(canvas.height || 1))}`);
  artPreviewArt.replaceChildren();
  const previewCanvas = document.createElement("div");
  previewCanvas.className = "art-composition-canvas";
  previewCanvas.style.width = `${Math.max(1, Number(canvas.width || 1))}px`;
  previewCanvas.style.height = `${Math.max(1, Number(canvas.height || 1))}px`;
  artPreviewArt.appendChild(previewCanvas);
  updateArtPreviewCanvasScale(composition);
  for (const [index, component] of (composition.components || []).entries()) {
    previewCanvas.appendChild(editableArtRenderer.createComponentNode({
      document,
      composition,
      component,
      canvas,
      layerIndex: index,
      siblingCount: (composition.components || []).length,
      selectedIds: selectedArtComponentIds,
      primaryId: selectedArtComponentId,
      previewText: artComponentPreviewText,
      imageSource: artComponentImageSource,
      supportsImageMask: artComponentSupportsImageMask,
      eventHasFiles: artDragEventHasFiles,
      onPointerDown: startArtComponentDrag,
      onImageDrop: (event, targetComponent) => {
        selectArtComponent(composition.id, targetComponent.id);
        stageArtComponentImageFile(targetComponent, event.dataTransfer?.files?.[0]);
      },
      appendTransformHandles: appendArtComponentTransformHandles
    }));
  }
  applyMeasuredArtPreviewTextFit(composition);
  requestAnimationFrame(() => {
    if (selectedArtCompositionId !== composition.id) return;
    updateArtPreviewCanvasScale(composition);
    applyMeasuredArtPreviewTextFit(composition);
  });
  artFileName.textContent = isArtCompositionsDirty() ? "Component layout has unsaved changes" : "Component layout saved";
  artReplaceButton.disabled = true;
  artCancelButton.disabled = true;
  artFileInput.value = "";
  artSaveCompositionButton.classList.remove("hidden");
  artSaveCompositionButton.disabled = !isArtCompositionsDirty();
  updateArtCompositionDeleteButton();
  if (options.renderEditor !== false) renderArtComponentEditor();
  updateArtCreateButtons();
}

function currentArtPreviewCanvas() {
  return artPreviewArt.querySelector(".art-composition-canvas") || artPreviewArt;
}

function updateArtPreviewCanvasScale(composition = selectedArtComposition()) {
  const previewCanvas = currentArtPreviewCanvas();
  if (!composition || previewCanvas === artPreviewArt) return 1;
  const canvasWidth = Math.max(1, Number(composition.canvas?.width || 1));
  const canvasHeight = Math.max(1, Number(composition.canvas?.height || 1));
  const rect = artPreviewArt.getBoundingClientRect();
  const scale = Math.max(0.01, Math.min(rect.width / canvasWidth, rect.height / canvasHeight));
  previewCanvas.style.setProperty("--art-composition-canvas-scale", scale);
  previewCanvas.style.setProperty("--art-composition-editor-scale", 1 / scale);
  return scale;
}

function applyMeasuredArtPreviewTextFit(composition) {
  const fitTextLayout = window.PartyGameTextFit?.fitTextLayout;
  const renderTextElement = window.PartyGameTextFit?.renderTextElement;
  const componentsById = new Map(flattenArtComponents(composition?.components || []).map(({ component }) => [String(component.id || ""), component]));
  const previewCanvas = currentArtPreviewCanvas();
  const nodes = previewCanvas.querySelectorAll(".art-composition-component.is-text");
  for (const node of nodes) {
    const component = componentsById.get(String(node.dataset.componentId || ""));
    const label = node.querySelector(":scope > .art-component-label");
    if (label) label.style.fontSize = "";
    if (!component || component.autoFitText !== true) continue;
    if (!label || label.hidden) continue;
    const previewText = artComponentPreviewText(component);
    if (typeof fitTextLayout !== "function") continue;
    const computed = window.getComputedStyle(label);
    const layout = fitTextLayout(component, previewText, Number(component.fontSize || 16), {
      computedStyle: computed
    });
    node.style.setProperty("--component-font-size", `${layout.fontSize}px`);
    label.style.fontSize = `${layout.fontSize}px`;
    renderTextElement?.(label.querySelector(":scope > .art-label-text") || label, previewText, layout);
  }
}

function updateArtCompositionDeleteButton() {
  if (!artDeleteCompositionButton) return;
  const hasComposition = Boolean(selectedArtComposition());
  artDeleteCompositionButton.classList.toggle("hidden", !hasComposition);
  artDeleteCompositionButton.disabled = !hasComposition;
}

function appendArtComponentTransformHandles(node, component, options = {}) {
  window.PartyGameToolAffordances.appendTransformHandles(node, {
    primary: options.primary === true,
    onResize: (event) => startArtComponentScale(event, component),
    rotationOrigins: () => selectedArtComponents().map((item) => ({ id: item.id, rotation: Number(item.rotation || 0) })),
    onRotateStart: pushArtHistory,
    onRotate: (items) => {
      const byId = new Map(items.map((item) => [item.id, item.rotation]));
      for (const item of selectedArtComponents()) {
        item.rotation = Number(Number(byId.get(item.id) || 0).toFixed(3));
      }
      renderSelectedArtComposition({ renderEditor: false });
      renderArtList();
      updateGlobalSaveButton();
    },
    onRotateEnd: () => renderSelectedArtComposition()
  });
}

function artComponentPreviewText(component) {
  const kind = artComponentSchema.normalizeComponentKind(component.kind);
  if (kind === "shape" || kind === "container") return "";
  if (component.id === "current-card") return "";
  if (component.id === "answer-text") return "FUNNY ANSWER";
  if (component.id === "author-heading") return "AVA";
  if (component.id === "voter-container") return "";
  if (component.id === "vote-count") return "0 votes";
  if (component.id === "vote-widget") return "BEN";
  return component.defaultText || component.name;
}

function artCompositionPreviewScale() {
  const composition = selectedArtComposition();
  if (!composition) return 1;
  return updateArtPreviewCanvasScale(composition);
}

function startArtSelectionMarquee(event) {
  if (!selectedArtComposition() || !artPreviewArt.classList.contains("is-composition-editor")) return false;
  const additiveSelection = event.metaKey || event.ctrlKey || event.shiftKey;
  const baseSelection = additiveSelection ? new Set(selectedArtComponentIds) : new Set();
  return window.PartyGameToolAffordances?.startSelectionMarquee(event, {
    root: artPreviewStage,
    itemRoot: currentArtPreviewCanvas(),
    marqueeRoot: artPreviewStage,
    className: "art-selection-marquee",
    itemSelector: ".art-composition-component",
    getItemId: (node) => node.dataset.componentId,
    shouldIgnoreTarget: (target) => Boolean(target.closest?.(".art-composition-component, .layout-resize-handle, .layout-rotation-handle")),
    onSelectionChange: (selectedIds) => {
      const nextIds = new Set(baseSelection);
      for (const id of selectedIds) nextIds.add(id);
      setArtComponentSelection([...nextIds]);
      renderArtSelectionOnly();
    },
    onComplete: () => {
      renderSelectedArtComposition();
      renderArtList();
    }
  });
}

function startArtComponentDrag(event, component) {
  if (event.target.closest(".layout-resize-handle, .layout-rotation-handle")) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.metaKey || event.ctrlKey) {
    selectArtComponent(selectedArtCompositionId, component.id, { additive: true });
    return;
  }
  if (!selectedArtComponentIds.has(component.id)) {
    selectedArtComponentIds = new Set([component.id]);
    selectedArtComponentId = component.id;
    renderArtList();
  }
  const scale = artCompositionPreviewScale();
  const moving = selectedArtComponents();
  const origins = new Map(moving.map((item) => [item.id, { x: Number(item.x || 0), y: Number(item.y || 0) }]));
  let historyCaptured = false;
  PartyGameToolAffordances.startPointerDrag(event, {
    scale,
    onMove: (moveEvent, dragState) => {
      if (!historyCaptured) {
        pushArtHistory();
        historyCaptured = true;
      }
      const { deltaX, deltaY } = PartyGameToolAffordances.dragDeltaFromEvent(moveEvent, dragState, { axisLock: true });
      for (const item of moving) {
        const origin = origins.get(item.id);
        item.x = Number((origin.x + deltaX).toFixed(3));
        item.y = Number((origin.y + deltaY).toFixed(3));
      }
      renderSelectedArtComposition();
      updateGlobalSaveButton();
    },
    onEnd: () => {
      renderSelectedArtComposition();
      renderArtList();
    }
  });
}

function startArtComponentScale(event, component) {
  event.preventDefault();
  event.stopPropagation();
  if (!selectedArtComponentIds.has(component.id)) {
    selectedArtComponentIds = new Set([component.id]);
    selectedArtComponentId = component.id;
  }
  const scaling = selectedArtComponents();
  const origins = new Map(scaling.map((item) => [item.id, Number(item.scale || 1)]));
  const originScale = Number(component.scale || 1);
  const baseSize = Math.max(Number(component.width || 1), Number(component.height || 1));
  let historyCaptured = false;
  PartyGameToolAffordances.startPointerDrag(event, {
    scale: artCompositionPreviewScale(),
    originScale,
    baseSize,
    onMove: (moveEvent, dragState) => {
      if (!historyCaptured) {
        pushArtHistory();
        historyCaptured = true;
      }
      const nextPrimaryScale = PartyGameToolAffordances.scaledValueFromPointer(moveEvent, dragState, { min: 0.05, max: 8 });
      const scaleDelta = nextPrimaryScale - originScale;
      for (const item of scaling) {
        item.scale = Number(Math.max(0.05, Math.min(8, origins.get(item.id) + scaleDelta)).toFixed(3));
      }
      renderSelectedArtComposition();
      updateGlobalSaveButton();
    },
    onEnd: () => renderSelectedArtComposition()
  });
}

function getArtComponentEditorRenderer() {
  if (!artComponentEditorRenderer) {
    artComponentEditorRenderer = artComponentEditorRuntime.create({
      componentTree: artComponentTree,
      artKindLabel,
      shapeStyles: artShapeStyles,
      imageAccept: artComponentImageAccept,
      normalizeUiColor,
      onPushHistory: pushArtHistory,
      supportsImageMask: artComponentSupportsImageMask,
      eventHasFiles: artDragEventHasFiles,
      onSelectComponent: selectArtComponent,
      onUpdateComponentValue: updateArtComponentValue,
      onUpdateComponentNumber: updateArtComponentNumber,
      onUpdateCompositionValue: updateArtCompositionValue,
      onUpdateCompositionCanvas: updateArtCompositionCanvas,
      onUpdateShapeStyle: updateArtShapeStyle,
      onImageFile: stageArtComponentImageFile,
      onClearImage: clearArtComponentImage
    });
  }
  return artComponentEditorRenderer;
}

function renderArtComponentEditor() {
  const composition = selectedArtComposition();
  if (!composition) return hideArtComponentEditor();
  artComponentEditor.classList.remove("hidden");
  getArtComponentEditorRenderer().render(artComponentEditor, {
    composition,
    selectedComponentIds: selectedArtComponentIds,
    selectedComponent: selectedEditableArtComponent()
  });
}

function updateArtComponentNumber(key, value, options = {}) {
  const components = selectedArtComponents();
  const primary = selectedEditableArtComponent();
  if (!primary) return;
  const delta = Number(value) - Number(primary[key] || 0);
  if (!delta) return;
  if (options.captureHistory !== false) pushArtHistory();
  for (const component of components) {
    component[key] = Number((Number(component[key] || 0) + delta).toFixed(3));
  }
  renderSelectedArtComposition();
  renderArtList();
  rememberArtCompositionDrafts();
  notifyArtAssetsChanged();
  updateGlobalSaveButton();
}

function updateArtComponentValue(key, value, options = {}) {
  const component = selectedEditableArtComponent();
  if (!component) return;
  const nextValue = typeof value === "number" ? Number(value.toFixed(3)) : value;
  if (component[key] === nextValue) return;
  if (options.captureHistory !== false) pushArtHistory();
  component[key] = nextValue;
  renderSelectedArtComposition({ renderEditor: options.colorCommit !== true && options.previewOnly !== true });
  renderArtList();
  rememberArtCompositionDrafts();
  notifyArtAssetsChanged();
  updateGlobalSaveButton();
}

function updateArtCompositionValue(key, value, options = {}) {
  const composition = selectedArtComposition();
  if (!composition) return;
  if (composition[key] === value) return;
  if (options.captureHistory !== false) pushArtHistory();
  composition[key] = value;
  renderSelectedArtComposition();
  renderArtList();
  rememberArtCompositionDrafts();
  notifyArtAssetsChanged();
  updateGlobalSaveButton();
}

function updateArtCompositionCanvas(key, value, options = {}) {
  const composition = selectedArtComposition();
  if (!composition) return;
  composition.canvas = composition.canvas || { width: 560, height: 230 };
  const nextValue = Number(Number(value || 1).toFixed(3));
  if (composition.canvas[key] === nextValue) return;
  if (options.captureHistory !== false) pushArtHistory();
  composition.canvas[key] = nextValue;
  renderSelectedArtComposition();
  updateGlobalSaveButton();
}

function updateArtShapeStyle(shapeStyle, options = {}) {
  const component = selectedEditableArtComponent();
  if (!component) return;
  shapeStyle = artComponentSchema.normalizeShapeStyle(shapeStyle, component.kind);
  if (component.shapeStyle === shapeStyle) return;
  if (options.captureHistory !== false) pushArtHistory();
  component.shapeStyle = shapeStyle;
  if (shapeStyle === "rectangle") {
    component.borderRadius = 0;
  } else if (shapeStyle === "rounded") {
    component.borderRadius = Math.max(12, Number(component.borderRadius || 0));
  } else if (shapeStyle === "pill") {
    component.borderRadius = 999;
  } else if (shapeStyle === "circle") {
    const size = Math.max(Number(component.width || 1), Number(component.height || 1));
    component.width = size;
    component.height = size;
    component.borderRadius = 999;
  }
  renderSelectedArtComposition();
  renderArtList();
  updateGlobalSaveButton();
}

function artDragEventHasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function validateArtComponentImageFile(file) {
  return artComponentSchema.validateImageFile(file);
}

function readArtComponentImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Could not read image file.")));
    reader.readAsDataURL(file);
  });
}

function currentArtComponentForImageUpdate(component) {
  const composition = selectedArtComposition();
  if (!composition || !component?.id) return null;
  return findArtComponent(composition, component.id)?.component || null;
}

async function stageArtComponentImageFile(component, file) {
  const target = currentArtComponentForImageUpdate(component);
  if (!artComponentSupportsImageMask(target)) {
    artFileName.textContent = "Select a shape component first";
    return;
  }
  const validationError = validateArtComponentImageFile(file);
  if (validationError) {
    artFileName.textContent = validationError;
    return;
  }
  try {
    const dataUrl = await readArtComponentImageDataUrl(file);
    pushArtHistory();
    target.imageDataUrl = dataUrl;
    target.imageAssetId = "";
    target.imageName = file.name || "Uploaded image";
    target.imageMimeType = file.type;
    target.imageObjectFit = artComponentSchema.normalizeImageObjectFit(target.imageObjectFit);
    artFileName.textContent = `Masked image: ${target.imageName}`;
    renderSelectedArtComposition();
    renderArtList();
    updateGlobalSaveButton();
  } catch (error) {
    artFileName.textContent = error.message;
  }
}

function clearArtComponentImage(component) {
  const target = currentArtComponentForImageUpdate(component);
  if (!target?.imageDataUrl && !target?.imageAssetId) return;
  pushArtHistory();
  target.imageDataUrl = "";
  target.imageAssetId = "";
  target.imageName = "";
  target.imageMimeType = "";
  target.imageTint = "";
  target.imageObjectFit = "cover";
  artFileName.textContent = "Image mask cleared";
  renderSelectedArtComposition();
  renderArtList();
  updateGlobalSaveButton();
}

function normalizeArtCreateKind(value) {
  return artComponentSchema.normalizeCreatableComponentKind(value);
}

function createSecureArtId(prefix = "art") {
  const randomId = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${String(randomId).replace(/[^a-z0-9-]/gi, "").toLowerCase()}`;
}

function defaultArtObject(kind, bounds = {}) {
  const cleanKind = normalizeArtCreateKind(kind);
  const width = cleanKind === "text" ? 220 : cleanKind === "container" ? 320 : 180;
  const height = cleanKind === "text" ? 60 : cleanKind === "container" ? 140 : 96;
  const component = {
    id: createSecureArtId(cleanKind),
    name: artKindLabel(cleanKind),
    kind: cleanKind,
    x: Number(bounds.x ?? (Number(bounds.width || 560) / 2)),
    y: Number(bounds.y ?? (Number(bounds.height || 230) / 2)),
    width,
    height,
    scale: 1,
    rotation: 0,
    children: []
  };
  if (cleanKind === "text") {
    component.defaultText = "Text";
    component.fontSize = 24;
    component.autoFitText = true;
    component.fontColor = "#17131f";
  } else if (cleanKind === "container") {
    component.shapeStyle = "rectangle";
    component.fillColor = "transparent";
    component.borderColor = "#17131f";
    component.borderWidth = 3;
    component.borderRadius = 12;
  } else {
    component.shapeStyle = "rounded";
    component.fillColor = "#fff8d6";
    component.borderColor = "#17131f";
    component.borderWidth = 4;
    component.borderRadius = 16;
  }
  return component;
}

function createArtAssetComposition(kind = "shape") {
  kind = normalizeArtCreateKind(kind);
  pushArtHistory();
  const root = defaultArtObject("container", { width: 560, height: 230 });
  root.id = createSecureArtId("root");
  root.name = "Art Root";
  root.x = 280;
  root.y = 115;
  root.width = 520;
  root.height = 190;
  root.fillColor = "transparent";
  root.borderColor = "transparent";
  root.borderWidth = 0;
  root.borderRadius = 0;
  root.children = [defaultArtObject(kind, { width: root.width, height: root.height })];
  const composition = {
    id: createSecureArtId("art"),
    name: `${artKindLabel(kind)} Art`,
    description: "Editable art asset.",
    surface: selectedArtSurface,
    canvas: { width: 560, height: 230 },
    components: [root]
  };
  artCompositions = [...artCompositions, composition];
  collapsedArtComposites.delete(composition.id);
  selectedArtAsset = null;
  selectedArtComposite = null;
  selectedArtCompositionId = composition.id;
  selectedArtComponentIds = new Set([root.children[0].id]);
  selectedArtComponentId = root.children[0].id;
  pendingArtReplacement = null;
  renderSelectedArtComposition();
  renderArtList();
  persistArtCollapseState();
  rememberArtCompositionDrafts();
  notifyArtAssetsChanged();
  updateGlobalSaveButton();
}

function createArtChildObject(kind = "shape") {
  const composition = selectedArtComposition();
  if (!composition) return;
  kind = normalizeArtCreateKind(kind);
  pushArtHistory();
  const parent = selectedEditableArtComponent();
  const bounds = parent
    ? { width: Number(parent.width || 1), height: Number(parent.height || 1) }
    : { width: Number(composition.canvas?.width || 560), height: Number(composition.canvas?.height || 230) };
  const child = defaultArtObject(kind, bounds);
  if (parent) {
    parent.children = Array.isArray(parent.children) ? parent.children : [];
    parent.children.push(child);
    collapsedArtComposites.delete(`${composition.id}:${parent.id}`);
  } else {
    composition.components = Array.isArray(composition.components) ? composition.components : [];
    composition.components.push(child);
    collapsedArtComposites.delete(composition.id);
  }
  selectedArtComponentIds = new Set([child.id]);
  selectedArtComponentId = child.id;
  renderSelectedArtComposition();
  renderArtList();
  persistArtCollapseState();
  rememberArtCompositionDrafts();
  notifyArtAssetsChanged();
  updateGlobalSaveButton();
}

function updateArtCreateButtons() {
  if (!artCreateChildButton) return;
  artCreateChildButton.disabled = !selectedArtComposition();
}

function closeArtCreateKindMenu() {
  artCreateKindMenu?.remove();
  artCreateKindMenu = null;
}

function artCreateKindChoices() {
  return [
    { kind: "text", label: "Text" },
    { kind: "shape", label: "Shape" },
    { kind: "container", label: "Container" }
  ];
}

function openArtCreateKindMenu(anchor, onChoose) {
  if (!anchor) return;
  closeArtCreateKindMenu();
  const menu = document.createElement("div");
  menu.className = "art-create-kind-menu";
  menu.setAttribute("role", "menu");
  for (const choice of artCreateKindChoices()) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = choice.label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeArtCreateKindMenu();
      onChoose?.(choice.kind);
    });
    menu.appendChild(button);
  }
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.round(rect.left)}px`;
  menu.style.top = `${Math.round(rect.bottom + 6)}px`;
  artCreateKindMenu = menu;
  const closeOnOutside = (event) => {
    if (menu.contains(event.target) || event.target === anchor) return;
    closeArtCreateKindMenu();
    document.removeEventListener("pointerdown", closeOnOutside, true);
  };
  requestAnimationFrame(() => document.addEventListener("pointerdown", closeOnOutside, true));
}

async function saveArtCompositions() {
  if (!artCompositions.length && artCompositionsPendingDeleteCount() <= 0) return;
  const selectedId = selectedArtCompositionId;
  const deleteIds = pendingArtCompositionDeleteIds();
  for (const compositionId of deleteIds) {
    const response = await fetch(`${origin}/api/art-compositions/${encodeURIComponent(compositionId)}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Could not delete art asset");
    clearArtCompositionPendingDelete(compositionId);
    forgetArtCompositionDraft(compositionId);
  }
  const savedCompositions = [];
  for (const composition of artCompositions) {
    if (isArtCompositionPendingDelete(composition.id)) continue;
    const result = await postJson(`/api/art-compositions/${composition.id}`, { composition });
    savedCompositions.push(result.composition);
  }
  artCompositions = savedCompositions;
  artCompositionsSavedSnapshot = JSON.stringify(serializeArtCompositionsForSave(artCompositions));
  clearArtCompositionDrafts();
  notifyArtAssetsChanged();
  const visibleCompositions = visibleArtCompositions();
  selectedArtCompositionId = artComposition(selectedId)?.id || visibleCompositions[0]?.id || artCompositions[0]?.id || "";
  renderSelectedArtComposition();
  renderArtList();
  updateGlobalSaveButton();
}

async function deleteSelectedArtComposition() {
  const composition = selectedArtComposition();
  if (!composition) return;
  const deletedId = composition.id;
  const deletedIndex = artCompositions.findIndex((item) => item.id === deletedId);
  pushArtHistory();
  markArtCompositionPendingDelete(deletedId);
  artCompositions = artCompositions.filter((item) => item.id !== deletedId);
  const removedLayoutCount = typeof removeArtCompositionLayoutInstances === "function"
    ? removeArtCompositionLayoutInstances(deletedId)
    : 0;
  notifyArtAssetsChanged();
  const nextComposition = artCompositions[Math.min(deletedIndex, artCompositions.length - 1)] || artCompositions[deletedIndex - 1] || null;
  if (nextComposition) {
    selectArtComposition(nextComposition.id);
  } else {
    selectedArtCompositionId = "";
    selectedArtComponentId = "";
    selectedArtComponentIds = new Set();
    hideArtComponentEditor();
    artPreviewTitle.textContent = "No Art Assets";
    artPreviewMeta.textContent = "Create an art asset to begin.";
    artPreviewArt.className = "art-preview-art";
    artPreviewArt.replaceChildren();
    renderArtList();
    updateArtCreateButtons();
  }
  const layoutMessage = removedLayoutCount
    ? ` and removed ${removedLayoutCount} layout instance${removedLayoutCount === 1 ? "" : "s"}`
    : "";
  artFileName.textContent = `Marked ${composition.name || "art asset"} for deletion${layoutMessage}. Save All to permanently delete.`;
  updateGlobalSaveButton();
}

function renderArtPreviewMeta(asset) {
  artPreviewMeta.replaceChildren();
  const use = document.createElement("span");
  use.textContent = asset.use;
  artPreviewMeta.appendChild(use);
  if (asset.sharedBy?.length) {
    artPreviewMeta.appendChild(document.createElement("br"));
    const note = document.createElement("span");
    note.className = "art-shared-note";
    note.textContent = `Shared asset: used by ${asset.sharedBy.join(", ")}`;
    artPreviewMeta.appendChild(note);
  }
}

function stageReplacementFile(file) {
  if (!selectedArtAsset || !file) {
    artFileName.textContent = "Select a nested asset first";
    return;
  }
  const allowedTypes = selectedArtAsset.expectedTypes || [];
  if (!allowedTypes.includes(file.type)) {
    artFileName.textContent = "Use PNG, SVG, JPG, or WEBP";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    pendingArtReplacement = {
      fileName: file.name,
      mimeType: file.type,
      dataUrl: String(reader.result || "")
    };
    renderSelectedArtPreview(pendingArtReplacement.dataUrl);
    artFileName.textContent = `Staged: ${file.name}`;
    artCancelButton.disabled = false;
    updateGlobalSaveButton();
  });
  reader.readAsDataURL(file);
}

async function saveArtReplacement() {
  if (!selectedArtAsset || !pendingArtReplacement) return;
  try {
    const result = await postJson(`/api/art-assets/${selectedArtAsset.id}`, pendingArtReplacement);
    const updated = result.asset;
    artAssets = artAssets.map((asset) => asset.id === updated.id ? updated : asset);
    applyArtAssets(artAssets);
    notifyArtAssetsChanged();
    selectArtAsset(updated.id);
  } catch (error) {
    artFileName.textContent = error.message;
    throw error;
  }
}

function cancelArtReplacement() {
  if (!selectedArtAsset) return;
  pendingArtReplacement = null;
  renderSelectedArtPreview(selectedArtAsset.currentUrl);
  artFileName.textContent = selectedArtAsset.hasCustom ? `Current: ${selectedArtAsset.fileName}` : "Using default art";
  artCancelButton.disabled = true;
  artFileInput.value = "";
  updateGlobalSaveButton();
}

async function setupArtTool() {
  artScreen.classList.remove("hidden");
  if (artToolInitialized) return;
  artToolInitialized = true;
  artReplaceButton.addEventListener("click", () => artFileInput.click());
  artCancelButton.addEventListener("click", cancelArtReplacement);
  artCreateButton.addEventListener("click", (event) => openArtCreateKindMenu(event.currentTarget, createArtAssetComposition));
  artCreateChildButton.addEventListener("click", (event) => openArtCreateKindMenu(event.currentTarget, createArtChildObject));
  artDeleteCompositionButton?.addEventListener("click", () => deleteSelectedArtComposition());
  for (const tab of artSurfaceTabs || []) {
    tab.addEventListener("click", () => selectArtSurface(tab.dataset.artSurface));
  }
  window.addEventListener("keydown", handleArtHotkeys);
  artPreviewStage.addEventListener("pointerdown", startArtSelectionMarquee);
  artSaveCompositionButton.addEventListener("click", () => saveArtCompositions().catch((error) => {
    artFileName.textContent = error.message;
  }));
  artFileInput.addEventListener("change", () => {
    stageReplacementFile(artFileInput.files?.[0]);
  });
  artPreviewStage.addEventListener("dragover", (event) => {
    event.preventDefault();
    artPreviewStage.classList.add("is-dragging");
  });
  artPreviewStage.addEventListener("dragleave", (event) => {
    if (!artPreviewStage.contains(event.relatedTarget)) {
      artPreviewStage.classList.remove("is-dragging");
    }
  });
  artPreviewStage.addEventListener("drop", (event) => {
    event.preventDefault();
    artPreviewStage.classList.remove("is-dragging");
    stageReplacementFile(event.dataTransfer?.files?.[0]);
  });
  try {
    await loadArtAssets();
    artCompositionsSavedSnapshot = JSON.stringify(serializeArtCompositionsForSave(artCompositions));
    getArtHistoryManager()?.clear();
    const initialCompositionId = selectedArtSurface === "stage" && artComposition("voting-card")
      ? "voting-card"
      : visibleArtCompositions()[0]?.id || "";
    if (initialCompositionId) selectArtComposition(initialCompositionId);
    else selectArtSurface(selectedArtSurface);
  } catch (error) {
    artPreviewTitle.textContent = "Art Tool Offline";
    artPreviewMeta.textContent = error.message;
    artReplaceButton.disabled = true;
  }
}
