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
let draggedArtComponentId = "";
const artComponentSchema = window.PartyGameArtComponentSchema;
const artShapeStyles = artComponentSchema.shapeStyleOptions;
const artComponentImageAccept = artComponentSchema.imageAccept;
const artSectionCollapseIds = ["player-avatars", "presentation-click-prompt", "voting-card", "custom-art"];

function serializeArtCompositionsForSave(source = artCompositions) {
  return (source || []).map((composition) => ({
    id: composition.id,
    name: composition.name || "Art Asset",
    description: composition.description || "",
    isCustom: Boolean(composition.isCustom),
    canvas: {
      width: Number(composition.canvas?.width || 1),
      height: Number(composition.canvas?.height || 1)
    },
    components: (composition.components || []).map(serializeArtComponentForSave)
  }));
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
    defaultText: component.defaultText || "",
    fontSize: Number(Number(component.fontSize || 16).toFixed(3)),
    fontColor: component.fontColor || "#17131f",
    shapeStyle: artComponentSchema.normalizeShapeStyle(component.shapeStyle, component.kind),
    fillColor: component.fillColor || "transparent",
    borderColor: component.borderColor || "transparent",
    borderWidth: Number(Number(component.borderWidth || 0).toFixed(3)),
    borderRadius: Number(Number(component.borderRadius || 0).toFixed(3)),
    imageDataUrl: artComponentSupportsImageMask(component) ? component.imageDataUrl || "" : "",
    imageName: artComponentSupportsImageMask(component) ? component.imageName || "" : "",
    imageMimeType: artComponentSupportsImageMask(component) ? component.imageMimeType || "" : "",
    imageObjectFit: artComponentSupportsImageMask(component) ? artComponentSchema.normalizeImageObjectFit(component.imageObjectFit) : "cover",
    children: (component.children || []).map(serializeArtComponentForSave)
  };
}

function isArtCompositionsDirty() {
  return artCompositionsSavedSnapshot && JSON.stringify(serializeArtCompositionsForSave(artCompositions)) !== artCompositionsSavedSnapshot;
}

function artCompositionHistorySnapshot() {
  return JSON.stringify(serializeArtCompositionsForSave(artCompositions));
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
  artCompositions = JSON.parse(snapshot);
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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoArtCompositionChange();
    } else {
      undoArtCompositionChange();
    }
    return;
  }
  window.PartyGameToolAffordances?.handleToolDeleteHotkey(event, {
    canDelete: () => selectedArtComponentIds.size > 0,
    onDelete: deleteSelectedArtComponents
  });
}

function selectedArtComposition() {
  return artComposition(selectedArtCompositionId);
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

function flattenArtComponents(components = [], depth = 0, parent = null, output = []) {
  for (const component of components || []) {
    output.push({ component, depth, parent });
    flattenArtComponents(component.children || [], depth + 1, component, output);
  }
  return output;
}

function findArtComponent(composition, componentId) {
  return flattenArtComponents(composition?.components || []).find(({ component }) => component.id === componentId) || null;
}

function artComponentCollectionRef(composition, componentId, components = composition?.components || [], parent = null) {
  if (!composition || !componentId) return null;
  for (const component of components || []) {
    if (component.id === componentId) return { parent, components };
    const childRef = artComponentCollectionRef(composition, componentId, component.children || [], component);
    if (childRef) return childRef;
  }
  return null;
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
  return new Set(flattenArtComponents(composition?.components || []).map(({ component }) => component.id));
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

function renderArtList() {
  artAssetList.replaceChildren();
  const avatarGroup = document.createElement("section");
  avatarGroup.className = "art-group";
  avatarGroup.appendChild(createArtGroupTitle("Player Avatars", "player-avatars", collapsedArtSections));
  const avatarChildren = document.createElement("div");
  avatarChildren.className = "art-group-children";
  if (!collapsedArtSections.has("player-avatars")) {
    for (const composite of avatarComposites) {
      avatarChildren.appendChild(createCompositeBlock(composite));
    }
  }
  avatarGroup.appendChild(avatarChildren);
  artAssetList.appendChild(avatarGroup);

  const promptGroup = document.createElement("section");
  promptGroup.className = "art-group";
  promptGroup.appendChild(createArtGroupTitle("Presentation Click Prompt", "presentation-click-prompt", collapsedArtSections));
  const promptChildren = document.createElement("div");
  promptChildren.className = "art-group-children";
  if (!collapsedArtSections.has("presentation-click-prompt")) {
    const cursorAsset = findArtAsset("presentation-click-cursor");
    if (cursorAsset) promptChildren.appendChild(createArtItemButton(cursorAsset, "Cursor Art"));
  }
  promptGroup.appendChild(promptChildren);
  artAssetList.appendChild(promptGroup);

  const votingGroup = document.createElement("section");
  votingGroup.className = "art-group";
  votingGroup.appendChild(createArtGroupTitle("Voting Card", "voting-card", collapsedArtSections));
  const votingChildren = document.createElement("div");
  votingChildren.className = "art-group-children";
  if (!collapsedArtSections.has("voting-card")) {
    for (const composition of artCompositions || []) {
      if (composition.id === "voting-card") votingChildren.appendChild(createArtCompositionBlock(composition));
    }
  }
  votingGroup.appendChild(votingChildren);
  artAssetList.appendChild(votingGroup);

  const customGroup = document.createElement("section");
  customGroup.className = "art-group";
  customGroup.appendChild(createArtGroupTitle("Custom Art", "custom-art", collapsedArtSections));
  const customChildren = document.createElement("div");
  customChildren.className = "art-group-children";
  if (!collapsedArtSections.has("custom-art")) {
    for (const composition of artCompositions || []) {
      if (composition.id !== "voting-card") customChildren.appendChild(createArtCompositionBlock(composition));
    }
  }
  customGroup.appendChild(customChildren);
  artAssetList.appendChild(customGroup);
  updateArtCreateButtons();
}

function createArtGroupTitle(label, collapseId, collapsedSet) {
  const title = document.createElement("div");
  title.className = "art-group-title";
  title.appendChild(createDisclosureButton(
    collapseId,
    collapsedSet,
    renderAndPersistArtCollapseState,
    () => toggleArtCollapsedIds(collapsedSet, artSectionCollapseIds)
  ));
  const text = document.createElement("span");
  text.textContent = label;
  title.appendChild(text);
  return title;
}

function findArtAsset(assetId) {
  return artAssets.find((asset) => asset.id === assetId) || null;
}

function createCompositeBlock(composite) {
  const wrapper = document.createElement("div");
  wrapper.className = "art-group";
  wrapper.appendChild(createCompositeButton(composite));
  const children = document.createElement("div");
  children.className = "art-composite-children";
  if (!collapsedArtComposites.has(composite.id)) {
    const dinoAsset = findArtAsset(composite.dinoAssetId);
    const frameAsset = findArtAsset("avatar-frame");
    if (dinoAsset) children.appendChild(createArtItemButton(dinoAsset, "Dino Art"));
    if (frameAsset) children.appendChild(createArtItemButton(frameAsset, "Rectangle (shared)"));
  }
  wrapper.appendChild(children);
  return wrapper;
}

function createArtCompositionBlock(composition) {
  const wrapper = document.createElement("div");
  wrapper.className = "art-group";
  wrapper.appendChild(createArtCompositionButton(composition));
  const children = document.createElement("div");
  children.className = "art-composite-children";
  if (!collapsedArtComposites.has(composition.id)) {
    for (const component of composition.components || []) {
      children.appendChild(createArtComponentBranch(composition, component, 0));
    }
  }
  wrapper.appendChild(children);
  return wrapper;
}

function createArtDisclosureSlot(id) {
  const slot = document.createElement("span");
  slot.className = "disclosure-slot";
  slot.appendChild(createDisclosureButton(
    id,
    collapsedArtComposites,
    renderAndPersistArtCollapseState,
    () => toggleArtCollapsedIds(collapsedArtComposites, artCompositeCollapseIds())
  ));
  return slot;
}

function createArtThumb(className, content = "") {
  const thumb = document.createElement("span");
  thumb.className = className;
  if (typeof content === "string") {
    thumb.innerHTML = content;
  } else if (content) {
    thumb.appendChild(content);
  }
  return thumb;
}

function createArtRow(options = {}) {
  const { row } = window.PartyGameToolAffordances.createToolSidebarRow({
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

function createArtCompositionButton(composition) {
  return createArtRow({
    className: "art-item is-composite has-disclosure",
    selected: selectedArtCompositionId === composition.id && !selectedArtComponentId,
    leadingNodes: [
      createArtDisclosureSlot(composition.id),
      createArtThumb("art-thumb art-composite-thumb", '<span class="art-voting-card-thumb"></span>')
    ],
    title: composition.name,
    summary: "Editable composite art",
    onActivate: () => selectArtComposition(composition.id)
  });
}

function createArtComponentButton(composition, component) {
  const hasChildren = Boolean(component.children?.length);
  const row = createArtRow({
    className: `art-item${hasChildren ? " has-disclosure" : ""}`,
    selected: selectedArtCompositionId === composition.id && selectedArtComponentIds.has(component.id),
    leadingNodes: [
      ...(hasChildren ? [createArtDisclosureSlot(`${composition.id}:${component.id}`)] : []),
      createArtThumb("art-thumb art-component-thumb")
    ],
    title: component.name,
    summary: `${artKindLabel(component.kind)} object / drag to layer`,
    onActivate: (event) => selectArtComponent(composition.id, component.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey })
  });
  row.title = "Drag to reorder layers. Top of list is frontmost.";
  window.PartyGameToolAffordances?.bindSortableRow(row, {
    itemId: component.id,
    dragType: "application/x-party-art-component",
    ignoreSelector: ".disclosure-button, input, textarea, button, select, a",
    getDraggedId: () => draggedArtComponentId,
    canDrop: (draggedId, targetId) => canReorderArtComponent(draggedId, targetId),
    onDragStart: (componentId) => {
      draggedArtComponentId = componentId;
      selectedArtAsset = null;
      selectedArtComposite = null;
      selectedArtCompositionId = composition.id;
      if (!selectedArtComponentIds.has(componentId)) {
        setArtComponentSelection([componentId]);
        row.classList.add("is-selected");
        renderArtComponentEditor();
        renderSelectedArtComposition();
      }
    },
    onReorder: (draggedId, targetId, placeAfter) => reorderArtComponent(draggedId, targetId, placeAfter),
    onDragEnd: () => {
      draggedArtComponentId = "";
    }
  });
  return row;
}

function createArtComponentBranch(composition, component, depth = 0) {
  const wrapper = document.createElement("div");
  wrapper.className = "art-group";
  wrapper.style.marginLeft = depth ? "12px" : "0";
  wrapper.appendChild(createArtComponentButton(composition, component));
  if (component.children?.length && !collapsedArtComposites.has(`${composition.id}:${component.id}`)) {
    const children = document.createElement("div");
    children.className = "art-composite-children";
    for (const child of component.children || []) {
      children.appendChild(createArtComponentBranch(composition, child, depth + 1));
    }
    wrapper.appendChild(children);
  }
  return wrapper;
}

function createCompositeButton(composite) {
  return createArtRow({
    className: "art-item is-composite has-disclosure",
    selected: selectedArtComposite?.id === composite.id && !selectedArtAsset,
    leadingNodes: [
      createArtDisclosureSlot(composite.id),
      createArtThumb("art-thumb art-composite-thumb", compositePreviewMarkup(composite))
    ],
    title: composite.name,
    summary: "Composite preview",
    onActivate: () => selectArtComposite(composite.id)
  });
}

function createArtItemButton(asset, label = asset.name) {
  const image = document.createElement("img");
  image.alt = "";
  image.src = asset.currentUrl;
  const button = createArtRow({
    className: "art-item",
    selected: selectedArtAsset?.id === asset.id,
    dataset: { assetId: asset.id },
    leadingNodes: [createArtThumb("art-thumb", image)],
    title: label,
    summary: `${asset.sharedBy?.length ? "Shared / " : ""}${asset.hasCustom ? "Custom" : "Default"}`,
    onActivate: () => selectArtAsset(asset.id)
  });
  button.classList.toggle("is-shared", Boolean(asset.sharedBy?.length));
  return button;
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
    artFileName.textContent = "No replacement selected";
    return;
  }

  artPreviewTitle.textContent = selectedArtAsset.name;
  renderArtPreviewMeta(selectedArtAsset);
  renderSelectedArtPreview(selectedArtAsset.currentUrl);
  artFileName.textContent = selectedArtAsset.hasCustom ? `Current: ${selectedArtAsset.fileName}` : "Using default art";
  artReplaceButton.disabled = false;
  artCancelButton.disabled = true;
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
    const next = new Set(selectedArtComponentIds);
    if (next.has(componentId)) next.delete(componentId);
    else if (validIds.has(componentId)) next.add(componentId);
    setArtComponentSelection([...next]);
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
  const nextIds = (componentIds || []).filter((id) => validIds.has(id));
  selectedArtComponentIds = new Set(nextIds);
  selectedArtComponentId = nextIds[nextIds.length - 1] || "";
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
  updateGlobalSaveButton();
}

function hideArtComponentEditor() {
  artComponentEditor?.classList.add("hidden");
  artSaveCompositionButton?.classList.add("hidden");
  if (artSaveCompositionButton) artSaveCompositionButton.disabled = true;
}

function renderSelectedArtComposition() {
  const composition = selectedArtComposition();
  if (!composition) return;
  artPreviewTitle.textContent = composition.name;
  artPreviewMeta.textContent = composition.description || "Editable composite art.";
  artPreviewArt.className = "art-preview-art is-composition-editor";
  const canvas = composition.canvas || { width: 560, height: 230 };
  artPreviewArt.style.setProperty("--art-composition-aspect", `${Number(canvas.width || 1) / Math.max(1, Number(canvas.height || 1))}`);
  artPreviewArt.replaceChildren();
  for (const [index, component] of (composition.components || []).entries()) {
    artPreviewArt.appendChild(artComponentPreviewNode(composition, component, canvas, index, (composition.components || []).length));
  }
  artFileName.textContent = isArtCompositionsDirty() ? "Component layout has unsaved changes" : "Component layout saved";
  artReplaceButton.disabled = true;
  artCancelButton.disabled = true;
  artFileInput.value = "";
  artSaveCompositionButton.classList.remove("hidden");
  artSaveCompositionButton.disabled = !isArtCompositionsDirty();
  renderArtComponentEditor();
  updateArtCreateButtons();
}

function artComponentLayerIndex(index, siblingCount) {
  return Math.max(1, Number(siblingCount || 1) - Number(index || 0));
}

function artComponentPreviewNode(composition, component, canvas, layerIndex = 0, siblingCount = 1) {
  const node = document.createElement("div");
  node.className = `art-composition-component is-${artComponentSchema.normalizeComponentKind(component.kind)} is-style-${artComponentSchema.normalizeShapeStyle(component.shapeStyle, component.kind)}`;
  node.classList.toggle("is-selected", selectedArtComponentIds.has(component.id));
  node.classList.toggle("has-image-mask", artComponentHasImageMask(component));
  node.dataset.componentId = component.id;
  node.style.zIndex = String(artComponentLayerIndex(layerIndex, siblingCount));
  node.style.left = `${Number(component.x || 0) / Math.max(1, Number(canvas.width || 1)) * 100}%`;
  node.style.top = `${Number(component.y || 0) / Math.max(1, Number(canvas.height || 1)) * 100}%`;
  node.style.width = `${Number(component.width || 1) / Math.max(1, Number(canvas.width || 1)) * 100}%`;
  node.style.height = `${Number(component.height || 1) / Math.max(1, Number(canvas.height || 1)) * 100}%`;
  node.style.setProperty("--component-scale", Number(component.scale || 1));
  node.style.setProperty("--component-font-size", `${Number(component.fontSize || 16)}px`);
  node.style.setProperty("--component-text-color", component.fontColor || "#17131f");
  node.style.setProperty("--component-fill-color", component.fillColor || "transparent");
  node.style.setProperty("--component-border-color", component.borderColor || "transparent");
  node.style.setProperty("--component-border-width", `${Number(component.borderWidth || 0)}px`);
  node.style.setProperty("--component-border-radius", `${Number(component.borderRadius || 0)}px`);
  node.style.setProperty("--component-image-fit", artComponentSchema.normalizeImageObjectFit(component.imageObjectFit));
  node.addEventListener("pointerdown", (event) => startArtComponentDrag(event, component));
  if (artComponentSupportsImageMask(component)) {
    node.addEventListener("dragover", (event) => {
      if (!artDragEventHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      node.classList.add("is-image-drop-target");
    });
    node.addEventListener("dragleave", (event) => {
      if (!node.contains(event.relatedTarget)) node.classList.remove("is-image-drop-target");
    });
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      node.classList.remove("is-image-drop-target");
      selectArtComponent(composition.id, component.id);
      stageArtComponentImageFile(component, event.dataTransfer?.files?.[0]);
    });
  }
  if (artComponentHasImageMask(component)) {
    const image = document.createElement("img");
    image.className = "art-component-mask-image";
    image.alt = "";
    image.draggable = false;
    image.src = component.imageDataUrl;
    node.appendChild(image);
  }
  const label = document.createElement("span");
  label.className = "art-component-label";
  label.textContent = artComponentPreviewText(component);
  node.appendChild(label);
  const childCanvas = { width: Number(component.width || 1), height: Number(component.height || 1) };
  for (const [childIndex, child] of (component.children || []).entries()) {
    node.appendChild(artComponentPreviewNode(composition, child, childCanvas, childIndex, (component.children || []).length));
  }
  if (selectedArtComponentIds.has(component.id)) {
    const handle = document.createElement("span");
    handle.className = "layout-resize-handle";
    handle.addEventListener("pointerdown", (event) => startArtComponentScale(event, component));
    node.appendChild(handle);
  }
  return node;
}

function artComponentPreviewText(component) {
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
  const rect = artPreviewArt.getBoundingClientRect();
  return rect.width / Math.max(1, Number(composition.canvas?.width || 1));
}

function startArtSelectionMarquee(event) {
  if (!selectedArtComposition() || !artPreviewArt.classList.contains("is-composition-editor")) return false;
  const additiveSelection = event.metaKey || event.ctrlKey || event.shiftKey;
  const baseSelection = additiveSelection ? new Set(selectedArtComponentIds) : new Set();
  return window.PartyGameToolAffordances?.startSelectionMarquee(event, {
    root: artPreviewArt,
    itemRoot: artPreviewArt,
    className: "art-selection-marquee",
    itemSelector: ".art-composition-component",
    getItemId: (node) => node.dataset.componentId,
    shouldIgnoreTarget: (target) => Boolean(target.closest?.(".art-composition-component, .layout-resize-handle")),
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
  if (event.target.closest(".layout-resize-handle")) return;
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
  const startX = event.clientX;
  const startY = event.clientY;
  const moving = selectedArtComponents();
  const origins = new Map(moving.map((item) => [item.id, { x: Number(item.x || 0), y: Number(item.y || 0) }]));
  let lockedAxis = null;
  let historyCaptured = false;
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    if (!historyCaptured) {
      pushArtHistory();
      historyCaptured = true;
    }
    let deltaX = (moveEvent.clientX - startX) / scale;
    let deltaY = (moveEvent.clientY - startY) / scale;
    if (moveEvent.shiftKey) {
      if (!lockedAxis) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (Math.max(absX, absY) >= 2) lockedAxis = absX >= absY ? "x" : "y";
      }
      if (lockedAxis === "x") {
        deltaY = 0;
        if (moveEvent.metaKey || moveEvent.ctrlKey) deltaX = Math.round(deltaX / 10) * 10;
      } else if (lockedAxis === "y") {
        deltaX = 0;
        if (moveEvent.metaKey || moveEvent.ctrlKey) deltaY = Math.round(deltaY / 10) * 10;
      }
    }
    for (const item of moving) {
      const origin = origins.get(item.id);
      item.x = Number((origin.x + deltaX).toFixed(3));
      item.y = Number((origin.y + deltaY).toFixed(3));
    }
    renderSelectedArtComposition();
    updateGlobalSaveButton();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    renderSelectedArtComposition();
    renderArtList();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function startArtComponentScale(event, component) {
  event.preventDefault();
  event.stopPropagation();
  if (!selectedArtComponentIds.has(component.id)) {
    selectedArtComponentIds = new Set([component.id]);
    selectedArtComponentId = component.id;
  }
  const previewScale = artCompositionPreviewScale();
  const startX = event.clientX;
  const startY = event.clientY;
  const scaling = selectedArtComponents();
  const origins = new Map(scaling.map((item) => [item.id, Number(item.scale || 1)]));
  const originScale = Number(component.scale || 1);
  const baseSize = Math.max(Number(component.width || 1), Number(component.height || 1));
  let historyCaptured = false;
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    if (!historyCaptured) {
      pushArtHistory();
      historyCaptured = true;
    }
    const delta = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY) / previewScale;
    const nextPrimaryScale = Math.max(0.05, Math.min(8, originScale + delta / baseSize));
    const scaleDelta = nextPrimaryScale - originScale;
    for (const item of scaling) {
      item.scale = Number(Math.max(0.05, Math.min(8, origins.get(item.id) + scaleDelta)).toFixed(3));
    }
    renderSelectedArtComposition();
    updateGlobalSaveButton();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    renderSelectedArtComposition();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function renderArtComponentEditor() {
  const composition = selectedArtComposition();
  if (!composition) return hideArtComponentEditor();
  artComponentEditor.classList.remove("hidden");
  artComponentEditor.replaceChildren();
  const list = document.createElement("div");
  list.className = "art-component-list";
  for (const { component, depth } of flattenArtComponents(composition.components || [])) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "art-component-row";
    button.classList.toggle("is-selected", selectedArtComponentIds.has(component.id));
    button.innerHTML = `<span></span><small></small>`;
    button.querySelector("span").textContent = component.name;
    button.querySelector("span").style.paddingLeft = `${depth * 14}px`;
    button.querySelector("small").textContent = artKindLabel(component.kind);
    button.addEventListener("click", (event) => selectArtComponent(composition.id, component.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey }));
    list.appendChild(button);
  }
  const fields = document.createElement("div");
  fields.className = "art-component-fields";
  const component = selectedEditableArtComponent();
  if (component) {
    fields.appendChild(artTextField("Name", component.name || artKindLabel(component.kind), (value) => updateArtComponentValue("name", value || artKindLabel(component.kind))));
    fields.appendChild(artNumberField("X", component.x, (value) => updateArtComponentNumber("x", value)));
    fields.appendChild(artNumberField("Y", component.y, (value) => updateArtComponentNumber("y", value)));
    fields.appendChild(artNumberField("Scale", component.scale, (value) => updateArtComponentNumber("scale", Math.max(0.05, value)), 0.05));
    fields.appendChild(artNumberField("Width", component.width, (value) => updateArtComponentNumber("width", Math.max(1, value))));
    fields.appendChild(artNumberField("Height", component.height, (value) => updateArtComponentNumber("height", Math.max(1, value))));
    if (component.kind === "text" || component.kind === "badge") {
      fields.appendChild(artTextField("Text", component.defaultText || "", (value) => updateArtComponentValue("defaultText", value)));
      fields.appendChild(artNumberField("Font Size", component.fontSize || 16, (value) => updateArtComponentValue("fontSize", Math.max(6, value))));
      fields.appendChild(artColorField("Font Color", component.fontColor || "#17131f", (value, options) => updateArtComponentValue("fontColor", value, options)));
    }
    if (component.kind === "shape" || component.kind === "container" || component.kind === "badge") {
      fields.appendChild(artSelectField("Shape", component.shapeStyle || "rounded", artShapeStyles, (value) => updateArtShapeStyle(value)));
      fields.appendChild(artColorField("Fill", component.fillColor === "transparent" ? "#fff8d6" : component.fillColor || "#fff8d6", (value, options) => updateArtComponentValue("fillColor", value, options)));
      fields.appendChild(artColorField("Border", component.borderColor === "transparent" ? "#17131f" : component.borderColor || "#17131f", (value, options) => updateArtComponentValue("borderColor", value, options)));
      fields.appendChild(artNumberField("Border Width", component.borderWidth || 0, (value) => updateArtComponentValue("borderWidth", Math.max(0, value))));
      fields.appendChild(artNumberField("Radius", component.borderRadius || 0, (value) => updateArtComponentValue("borderRadius", Math.max(0, value))));
    }
    if (artComponentSupportsImageMask(component)) {
      fields.appendChild(artImageMaskField(component));
    }
  } else {
    fields.appendChild(artTextField("Name", composition.name || "Art Asset", (value) => updateArtCompositionValue("name", value || "Art Asset")));
    fields.appendChild(artNumberField("Canvas Width", composition.canvas?.width || 560, (value) => updateArtCompositionCanvas("width", Math.max(1, value))));
    fields.appendChild(artNumberField("Canvas Height", composition.canvas?.height || 230, (value) => updateArtCompositionCanvas("height", Math.max(1, value))));
  }
  artComponentEditor.append(list, fields);
}

function artTextField(label, value, onChange) {
  const field = document.createElement("label");
  field.className = "layout-number-field";
  field.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.addEventListener("change", () => onChange(input.value));
  field.appendChild(input);
  return field;
}

function artSelectField(label, value, options, onChange) {
  const field = document.createElement("label");
  field.className = "layout-number-field";
  field.textContent = label;
  const select = document.createElement("select");
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  field.appendChild(select);
  return field;
}

function artNumberField(label, value, onChange, step = 1) {
  const field = document.createElement("label");
  field.className = "layout-number-field";
  field.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(step);
  input.value = Number(value || 0);
  input.addEventListener("change", () => onChange(Number(input.value)));
  field.appendChild(input);
  return field;
}

function artColorField(label, value, onChange) {
  const field = document.createElement("label");
  field.className = "layout-number-field layout-color-field";
  field.textContent = label;
  const input = document.createElement("input");
  input.type = "color";
  input.value = normalizeUiColor(value) || "#ffffff";
  let historyCaptured = false;
  input.addEventListener("focus", () => {
    historyCaptured = false;
  });
  input.addEventListener("input", () => {
    if (!historyCaptured) {
      pushArtHistory();
      historyCaptured = true;
    }
    onChange(input.value, { captureHistory: false });
  });
  field.appendChild(input);
  return field;
}

function artImageMaskField(component) {
  const field = document.createElement("section");
  field.className = "art-image-mask-field";
  const label = document.createElement("strong");
  label.textContent = "Image Mask";
  const status = document.createElement("span");
  status.className = "art-image-mask-status";
  status.textContent = component.imageName ? `Current: ${component.imageName}` : "Drop or upload PNG, SVG, JPG, or WEBP";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = artComponentImageAccept;
  input.className = "art-file-input";
  const actions = document.createElement("div");
  actions.className = "art-image-mask-actions";
  const uploadButton = document.createElement("button");
  uploadButton.type = "button";
  uploadButton.textContent = component.imageDataUrl ? "Replace Image" : "Upload Image";
  uploadButton.addEventListener("click", () => input.click());
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.disabled = !component.imageDataUrl;
  clearButton.addEventListener("click", () => clearArtComponentImage(component));
  actions.append(uploadButton, clearButton);
  input.addEventListener("change", () => {
    stageArtComponentImageFile(component, input.files?.[0]).finally(() => {
      input.value = "";
    });
  });
  field.addEventListener("dragover", (event) => {
    if (!artDragEventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    field.classList.add("is-dragging");
  });
  field.addEventListener("dragleave", (event) => {
    if (!field.contains(event.relatedTarget)) field.classList.remove("is-dragging");
  });
  field.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    field.classList.remove("is-dragging");
    stageArtComponentImageFile(component, event.dataTransfer?.files?.[0]);
  });
  field.append(label, status, actions, input);
  return field;
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
  updateGlobalSaveButton();
}

function updateArtComponentValue(key, value, options = {}) {
  const component = selectedEditableArtComponent();
  if (!component) return;
  const nextValue = typeof value === "number" ? Number(value.toFixed(3)) : value;
  if (component[key] === nextValue) return;
  if (options.captureHistory !== false) pushArtHistory();
  component[key] = nextValue;
  renderSelectedArtComposition();
  renderArtList();
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
  if (!target?.imageDataUrl) return;
  pushArtHistory();
  target.imageDataUrl = "";
  target.imageName = "";
  target.imageMimeType = "";
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
    children: []
  };
  if (cleanKind === "text") {
    component.defaultText = "Text";
    component.fontSize = 24;
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

function createArtAssetComposition() {
  const kind = normalizeArtCreateKind(artCreateKindSelect?.value);
  pushArtHistory();
  const composition = {
    id: createSecureArtId("art"),
    name: `${artKindLabel(kind)} Art`,
    description: "Editable art asset.",
    isCustom: true,
    canvas: { width: 560, height: 230 },
    components: [defaultArtObject(kind, { width: 560, height: 230 })]
  };
  artCompositions = [...artCompositions, composition];
  collapsedArtSections.delete("custom-art");
  collapsedArtComposites.delete(composition.id);
  selectedArtAsset = null;
  selectedArtComposite = null;
  selectedArtCompositionId = composition.id;
  selectedArtComponentIds = new Set([composition.components[0].id]);
  selectedArtComponentId = composition.components[0].id;
  pendingArtReplacement = null;
  renderSelectedArtComposition();
  renderArtList();
  persistArtCollapseState();
  updateGlobalSaveButton();
}

function createArtChildObject() {
  const composition = selectedArtComposition();
  if (!composition) return;
  const kind = normalizeArtCreateKind(artCreateKindSelect?.value);
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
  updateGlobalSaveButton();
}

function updateArtCreateButtons() {
  if (!artCreateChildButton) return;
  artCreateChildButton.disabled = !selectedArtComposition();
}

async function saveArtCompositions() {
  if (!artCompositions.length) return;
  const selectedId = selectedArtCompositionId;
  const savedCompositions = [];
  for (const composition of artCompositions) {
    const result = await postJson(`/api/art-compositions/${composition.id}`, { composition });
    savedCompositions.push(result.composition);
  }
  artCompositions = savedCompositions;
  artCompositionsSavedSnapshot = JSON.stringify(serializeArtCompositionsForSave(artCompositions));
  notifyArtAssetsChanged();
  selectedArtCompositionId = artComposition(selectedId)?.id || artCompositions[0]?.id || "";
  renderSelectedArtComposition();
  renderArtList();
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
  artCreateButton.addEventListener("click", createArtAssetComposition);
  artCreateChildButton.addEventListener("click", createArtChildObject);
  window.addEventListener("keydown", handleArtHotkeys);
  artPreviewArt.addEventListener("pointerdown", startArtSelectionMarquee);
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
    selectArtComposition("voting-card");
  } catch (error) {
    artPreviewTitle.textContent = "Art Tool Offline";
    artPreviewMeta.textContent = error.message;
    artReplaceButton.disabled = true;
  }
}
