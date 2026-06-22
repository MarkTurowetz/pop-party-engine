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
const artObjectKindOptions = new Set(["text", "shape", "container"]);
const artShapeStyles = [
  { value: "rounded", label: "Rounded" },
  { value: "rectangle", label: "Rectangle" },
  { value: "pill", label: "Pill" },
  { value: "circle", label: "Circle" }
];

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
    shapeStyle: component.shapeStyle || "rounded",
    fillColor: component.fillColor || "transparent",
    borderColor: component.borderColor || "transparent",
    borderWidth: Number(Number(component.borderWidth || 0).toFixed(3)),
    borderRadius: Number(Number(component.borderRadius || 0).toFixed(3)),
    children: (component.children || []).map(serializeArtComponentForSave)
  };
}

function isArtCompositionsDirty() {
  return artCompositionsSavedSnapshot && JSON.stringify(serializeArtCompositionsForSave(artCompositions)) !== artCompositionsSavedSnapshot;
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
  if (kind === "text") return "Text";
  if (kind === "container") return "Container";
  if (kind === "badge") return "Badge";
  return "Shape";
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

function allArtComponentIds(composition) {
  return new Set(flattenArtComponents(composition?.components || []).map(({ component }) => component.id));
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

function createDisclosureButton(id, collapsedSet, onToggle = () => {}, onMetaToggle = null) {
  const button = document.createElement("span");
  button.setAttribute("role", "button");
  button.tabIndex = 0;
  button.className = "disclosure-button";
  button.classList.toggle("is-collapsed", collapsedSet.has(id));
  button.setAttribute("aria-label", collapsedSet.has(id) ? "Expand" : "Collapse");
  const toggle = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (onMetaToggle && (event.metaKey || event.ctrlKey)) {
      onMetaToggle();
      return;
    }
    if (collapsedSet.has(id)) {
      collapsedSet.delete(id);
    } else {
      collapsedSet.add(id);
    }
    onToggle();
  };
  button.addEventListener("click", toggle);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") toggle(event);
  });
  return button;
}

function persistFlowCollapseState() {
  setLocalValue("partyTemplate.collapsedFlowStates", JSON.stringify([...collapsedFlowStates]));
  setLocalValue("partyTemplate.collapsedFlowActions", JSON.stringify([...collapsedFlowActions]));
}

function createArtGroupTitle(label, collapseId, collapsedSet) {
  const title = document.createElement("div");
  title.className = "art-group-title";
  title.appendChild(createDisclosureButton(collapseId, collapsedSet, renderArtList));
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

function createArtCompositionButton(composition) {
  const button = document.createElement("button");
  button.className = "art-item is-composite has-disclosure";
  button.type = "button";
  button.classList.toggle("is-selected", selectedArtCompositionId === composition.id && !selectedArtComponentId);
  button.innerHTML = `
    <span class="disclosure-slot"></span>
    <span class="art-thumb art-composite-thumb"><span class="art-voting-card-thumb"></span></span>
    <span>
      <span class="art-item-title"></span>
      <span class="art-item-meta">Editable composite art</span>
    </span>
  `;
  button.querySelector(".disclosure-slot").appendChild(createDisclosureButton(composition.id, collapsedArtComposites, renderArtList));
  button.querySelector(".art-item-title").textContent = composition.name;
  button.addEventListener("click", () => selectArtComposition(composition.id));
  return button;
}

function createArtComponentButton(composition, component) {
  const button = document.createElement("button");
  const hasChildren = Boolean(component.children?.length);
  button.className = `art-item${hasChildren ? " has-disclosure" : ""}`;
  button.type = "button";
  button.classList.toggle("is-selected", selectedArtCompositionId === composition.id && selectedArtComponentIds.has(component.id));
  button.innerHTML = `${hasChildren ? '<span class="disclosure-slot"></span>' : ""}
    <span class="art-thumb art-component-thumb"></span>
    <span>
      <span class="art-item-title"></span>
      <span class="art-item-meta"></span>
    </span>
  `;
  if (hasChildren) {
    button.querySelector(".disclosure-slot").appendChild(createDisclosureButton(`${composition.id}:${component.id}`, collapsedArtComposites, renderArtList));
  }
  button.querySelector(".art-item-title").textContent = component.name;
  button.querySelector(".art-item-meta").textContent = `${artKindLabel(component.kind)} object`;
  button.addEventListener("click", (event) => selectArtComponent(composition.id, component.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey }));
  return button;
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
  const button = document.createElement("button");
  button.className = "art-item is-composite has-disclosure";
  button.type = "button";
  button.classList.toggle("is-selected", selectedArtComposite?.id === composite.id && !selectedArtAsset);
  button.innerHTML = `
    <span class="disclosure-slot"></span>
    <span class="art-thumb art-composite-thumb">${compositePreviewMarkup(composite)}</span>
    <span>
      <span class="art-item-title"></span>
      <span class="art-item-meta">Composite preview</span>
    </span>
  `;
  button.querySelector(".disclosure-slot").appendChild(createDisclosureButton(composite.id, collapsedArtComposites, renderArtList));
  button.querySelector(".art-item-title").textContent = composite.name;
  button.addEventListener("click", () => selectArtComposite(composite.id));
  return button;
}

function createArtItemButton(asset, label = asset.name) {
    const button = document.createElement("button");
    button.className = "art-item";
    button.type = "button";
    button.dataset.assetId = asset.id;
    button.classList.toggle("is-selected", selectedArtAsset?.id === asset.id);
    button.classList.toggle("is-shared", Boolean(asset.sharedBy?.length));
    button.innerHTML = `
      <span class="art-thumb"><img alt="" src="${asset.currentUrl}"></span>
      <span>
        <span class="art-item-title"></span>
        <span class="art-item-meta"></span>
      </span>
    `;
    button.querySelector(".art-item-title").textContent = label;
    button.querySelector(".art-item-meta").textContent = `${asset.sharedBy?.length ? "Shared / " : ""}${asset.hasCustom ? "Custom" : "Default"}`;
    button.addEventListener("click", () => selectArtAsset(asset.id));
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
    selectedArtComponentIds = next;
  } else {
    selectedArtComponentIds = validIds.has(componentId) ? new Set([componentId]) : new Set();
  }
  selectedArtComponentId = [...selectedArtComponentIds].pop() || "";
  renderSelectedArtComposition();
  renderArtList();
  updateArtCreateButtons();
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
  artPreviewArt.className = "art-preview-art is-voting-card-editor";
  const canvas = composition.canvas || { width: 560, height: 230 };
  artPreviewArt.style.setProperty("--art-composition-aspect", `${Number(canvas.width || 1) / Math.max(1, Number(canvas.height || 1))}`);
  artPreviewArt.replaceChildren();
  for (const component of composition.components || []) {
    artPreviewArt.appendChild(artComponentPreviewNode(composition, component, canvas));
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

function artComponentPreviewNode(composition, component, canvas) {
  const node = document.createElement("div");
  node.className = `art-composition-component is-${component.kind || "shape"} is-style-${component.shapeStyle || "rounded"}`;
  node.classList.toggle("is-selected", selectedArtComponentIds.has(component.id));
  node.dataset.componentId = component.id;
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
  node.addEventListener("pointerdown", (event) => startArtComponentDrag(event, component));
  const label = document.createElement("span");
  label.className = "art-component-label";
  label.textContent = artComponentPreviewText(component);
  node.appendChild(label);
  const childCanvas = { width: Number(component.width || 1), height: Number(component.height || 1) };
  for (const child of component.children || []) {
    node.appendChild(artComponentPreviewNode(composition, child, childCanvas));
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
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
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
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
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
      fields.appendChild(artColorField("Font Color", component.fontColor || "#17131f", (value) => updateArtComponentValue("fontColor", value)));
    }
    if (component.kind === "shape" || component.kind === "container" || component.kind === "badge") {
      fields.appendChild(artSelectField("Shape", component.shapeStyle || "rounded", artShapeStyles, (value) => updateArtShapeStyle(value)));
      fields.appendChild(artColorField("Fill", component.fillColor === "transparent" ? "#fff8d6" : component.fillColor || "#fff8d6", (value) => updateArtComponentValue("fillColor", value)));
      fields.appendChild(artColorField("Border", component.borderColor === "transparent" ? "#17131f" : component.borderColor || "#17131f", (value) => updateArtComponentValue("borderColor", value)));
      fields.appendChild(artNumberField("Border Width", component.borderWidth || 0, (value) => updateArtComponentValue("borderWidth", Math.max(0, value))));
      fields.appendChild(artNumberField("Radius", component.borderRadius || 0, (value) => updateArtComponentValue("borderRadius", Math.max(0, value))));
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
  input.addEventListener("input", () => onChange(input.value));
  field.appendChild(input);
  return field;
}

function updateArtComponentNumber(key, value) {
  const components = selectedArtComponents();
  const primary = selectedEditableArtComponent();
  if (!primary) return;
  const delta = Number(value) - Number(primary[key] || 0);
  for (const component of components) {
    component[key] = Number((Number(component[key] || 0) + delta).toFixed(3));
  }
  renderSelectedArtComposition();
  renderArtList();
  updateGlobalSaveButton();
}

function updateArtComponentValue(key, value) {
  const component = selectedEditableArtComponent();
  if (!component) return;
  component[key] = typeof value === "number" ? Number(value.toFixed(3)) : value;
  renderSelectedArtComposition();
  renderArtList();
  updateGlobalSaveButton();
}

function updateArtCompositionValue(key, value) {
  const composition = selectedArtComposition();
  if (!composition) return;
  composition[key] = value;
  renderSelectedArtComposition();
  renderArtList();
  updateGlobalSaveButton();
}

function updateArtCompositionCanvas(key, value) {
  const composition = selectedArtComposition();
  if (!composition) return;
  composition.canvas = composition.canvas || { width: 560, height: 230 };
  composition.canvas[key] = Number(Number(value || 1).toFixed(3));
  renderSelectedArtComposition();
  updateGlobalSaveButton();
}

function updateArtShapeStyle(shapeStyle) {
  const component = selectedEditableArtComponent();
  if (!component) return;
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

function normalizeArtCreateKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return artObjectKindOptions.has(kind) ? kind : "shape";
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
  updateGlobalSaveButton();
}

function createArtChildObject() {
  const composition = selectedArtComposition();
  if (!composition) return;
  const kind = normalizeArtCreateKind(artCreateKindSelect?.value);
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
    selectArtComposition("voting-card");
  } catch (error) {
    artPreviewTitle.textContent = "Art Tool Offline";
    artPreviewMeta.textContent = error.message;
    artReplaceButton.disabled = true;
  }
}
