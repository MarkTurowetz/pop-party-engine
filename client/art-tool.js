function setupLab() {
  labScreen.classList.remove("hidden");
  const stageCode = getStageCodeFromUrl() || generateStageCode();
  document.querySelector("#stageLinkFromLab").href = `${origin}/stage?stage=${stageCode}`;
  document.querySelector("#stageFrame").src = `${origin}/stage?stage=${stageCode}`;
  document.querySelector("#controllerFrame").src = `${origin}/controller?stage=${stageCode}`;
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
}

function createDisclosureButton(id, collapsedSet, onToggle = () => {}) {
  const button = document.createElement("span");
  button.setAttribute("role", "button");
  button.tabIndex = 0;
  button.className = "disclosure-button";
  button.classList.toggle("is-collapsed", collapsedSet.has(id));
  button.setAttribute("aria-label", collapsedSet.has(id) ? "Expand" : "Collapse");
  const toggle = (event) => {
    event.stopPropagation();
    event.preventDefault();
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
  pendingArtReplacement = null;
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
  pendingArtReplacement = null;
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
    selectArtComposite(avatarComposites[0]?.id);
  } catch (error) {
    artPreviewTitle.textContent = "Art Tool Offline";
    artPreviewMeta.textContent = error.message;
    artReplaceButton.disabled = true;
  }
}
