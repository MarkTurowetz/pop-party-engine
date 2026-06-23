function activeLayoutData() {
  return layoutToolMode === "controller" ? controllerLayouts : stageLayouts;
}

function setActiveLayoutData(layouts) {
  if (layoutToolMode === "controller") {
    controllerLayouts = layouts;
  } else {
    stageLayouts = layouts;
  }
}

function activeLayoutSavedSnapshot() {
  return layoutToolMode === "controller" ? controllerLayoutSavedSnapshot : layoutSavedSnapshot;
}

function setActiveLayoutSavedSnapshot(snapshot) {
  if (layoutToolMode === "controller") {
    controllerLayoutSavedSnapshot = snapshot;
  } else {
    layoutSavedSnapshot = snapshot;
  }
}

function activeLayoutEndpoint() {
  return layoutToolMode === "controller" ? "/api/controller-layouts" : "/api/stage-layouts";
}

function activeGlobalLayout() {
  return layoutToolMode === "controller" ? globalControllerLayout() : globalStageLayout();
}

async function loadLayoutToolData() {
  const result = await getJson(activeLayoutEndpoint());
  setActiveLayoutData(result.layouts || activeLayoutData());
  setActiveLayoutSavedSnapshot(JSON.stringify(serializeStageLayoutsForSave(result.savedLayouts || result.layouts || activeLayoutData())));
  getLayoutHistoryManager().clear();
  updateLayoutStorageStatus(result.storage);
  selectedLayoutStateId = layoutGroup(selectedLayoutStateId)?.id || "global";
  setLayoutSelection(layoutElement(selectedLayoutStateId, selectedLayoutElementId)?.id || layoutGroup(selectedLayoutStateId)?.elements?.[0]?.id || "");
  renderLayoutTool();
}

function updateLayoutStorageStatus(storage) {
  if (!layoutStorageStatus) return;
  if (!storage) {
    layoutStorageStatus.textContent = "Layout storage: unknown";
    return;
  }
  if (storage.durable) {
    layoutStorageStatus.textContent = `Layout storage: GitHub ${storage.repo || ""}${storage.branch ? ` / ${storage.branch}` : ""}`;
    return;
  }
  layoutStorageStatus.textContent = storage.error || "Layout storage: local fallback only";
}

function serializeStageLayoutsForSave(layouts) {
  const fallbackCanvas = layoutToolMode === "controller" ? { width: 390, height: 844 } : { width: 1920, height: 1080 };
  return {
    canvas: {
      width: Number(layouts?.canvas?.width || fallbackCanvas.width),
      height: Number(layouts?.canvas?.height || fallbackCanvas.height)
    },
    global: serializeLayoutGroup(layouts?.global || { id: "global", name: "Global Layout", elements: [] }),
    states: (layouts.states || []).map((state) => serializeLayoutGroup(state))
  };
}

function serializeLayoutGroup(group) {
  return {
    id: group.id,
    name: group.name,
    hiddenGlobals: Array.isArray(group.hiddenGlobals) ? [...group.hiddenGlobals] : [],
    elements: (group.elements || []).map((element) => ({
      id: element.id,
      name: element.name,
      selector: element.selector,
      kind: element.kind || "art",
      x: Number(Number(element.x || 0).toFixed(3)),
      y: Number(Number(element.y || 0).toFixed(3)),
      width: Number(Number(element.width || 0).toFixed(3)),
      height: Number(Number(element.height || 0).toFixed(3)),
      scale: Number(Number(element.scale || 1).toFixed(3)),
      defaultText: element.kind === "text" ? String(element.defaultText ?? layoutDefaultText(element)) : "",
      fontSize: element.kind === "text" ? Number(Number(element.fontSize || 58).toFixed(3)) : 58,
      autoFitText: element.kind === "text" ? element.autoFitText === true : false,
      fontColor: element.kind === "text" ? normalizeUiColor(element.fontColor) || "#ffffff" : "#ffffff"
    }))
  };
}

function layoutGroups() {
  const layouts = activeLayoutData();
  const global = layoutToolMode === "controller" ? globalControllerLayout() : globalStageLayout();
  return [global, ...(layouts.states || [])];
}

function layoutGroup(groupId) {
  return layoutGroups().find((group) => group.id === groupId) || null;
}

function layoutElement(stateId, elementId) {
  return layoutGroup(stateId)?.elements?.find((element) => element.id === elementId)
    || (stateId !== "global" ? activeGlobalLayout().elements?.find((element) => element.id === elementId) : null)
    || null;
}

function selectedLayoutElements() {
  const group = layoutGroup(selectedLayoutStateId);
  if (!group) return [];
  const ownElements = (group.elements || []).filter((element) => selectedLayoutElementIds.has(element.id));
  if (selectedLayoutStateId === "global") return ownElements;
  const globalElements = (activeGlobalLayout().elements || []).filter((element) => selectedLayoutElementIds.has(element.id));
  return [...ownElements, ...globalElements];
}

function selectedEditableLayoutElements() {
  const group = layoutGroup(selectedLayoutStateId);
  if (!group) return [];
  return (group.elements || []).filter((element) => selectedLayoutElementIds.has(element.id));
}

function setLayoutSelection(ids) {
  const group = layoutGroup(selectedLayoutStateId);
  const validIds = new Set((group?.elements || []).map((element) => element.id));
  if (selectedLayoutStateId !== "global") {
    for (const element of activeGlobalLayout().elements || []) validIds.add(element.id);
  }
  const nextIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => validIds.has(id));
  selectedLayoutElementIds = new Set(nextIds);
  selectedLayoutElementId = nextIds[nextIds.length - 1] || "";
}

function selectLayoutElement(elementId, options = {}) {
  if (options.additive) {
    const nextIds = new Set(selectedLayoutElementIds);
    if (nextIds.has(elementId)) {
      nextIds.delete(elementId);
    } else {
      nextIds.add(elementId);
    }
    setLayoutSelection([...nextIds]);
  } else {
    setLayoutSelection([elementId]);
  }
  renderLayoutTool();
}

function isLayoutDirty() {
  return layoutSavedSnapshot && JSON.stringify(serializeStageLayoutsForSave(stageLayouts)) !== layoutSavedSnapshot;
}

function isControllerLayoutDirty() {
  return controllerLayoutSavedSnapshot && JSON.stringify(serializeStageLayoutsForSave(controllerLayouts)) !== controllerLayoutSavedSnapshot;
}

function isActiveLayoutDirty() {
  return layoutToolMode === "controller" ? isControllerLayoutDirty() : isLayoutDirty();
}

function baseLayoutObjectCatalog() {
  if (layoutToolMode === "controller") {
    return [
      { id: "joinTitle", name: "Join Title", selector: "#joinTitle", kind: "text", width: 330, height: 86 },
      { id: "stageCodeField", name: "Stage Code Field", selector: "#stageCodeField", kind: "art", width: 320, height: 96 },
      { id: "playerNameField", name: "Player Name Field", selector: "#playerNameField", kind: "art", width: 320, height: 96 },
      { id: "joinButton", name: "Join Button", selector: "#joinButton", kind: "art", width: 260, height: 78 },
      { id: "controllerAvatar", name: "Player Avatar", selector: "#controllerAvatar", kind: "art", width: 104, height: 104 },
      { id: "controllerPlayerName", name: "Player Name", selector: "#controllerPlayerName", kind: "text", width: 330, height: 80 },
      { id: "controllerMeta", name: "Controller Status", selector: "#controllerMeta", kind: "text", width: 330, height: 48 },
      { id: "startGameButton", name: "Start Game Button", selector: "#startGameButton", kind: "art", width: 260, height: 78 },
      { id: "controllerPlayerBanner", name: "Player Banner", selector: "#controllerPlayerBanner", kind: "art", width: 338, height: 78 },
      { id: "controllerIntroMessage", name: "Intro Message", selector: "#controllerIntroMessage", kind: "text", width: 330, height: 120 },
      { id: "introPresentButton", name: "Present Button", selector: "#introPresentButton", kind: "art", width: 300, height: 78 },
      { id: "controllerChoicePrompt", name: "Choice Prompt", selector: "#controllerChoicePrompt", kind: "text", width: 330, height: 120 },
      { id: "controllerChoiceGrid", name: "Choice Buttons", selector: "#controllerChoiceGrid", kind: "art", width: 330, height: 420 },
      { id: "controllerChoiceDone", name: "Choice Done Text", selector: "#controllerChoiceDone", kind: "text", width: 330, height: 150 },
      { id: "controllerTextPrompt", name: "Text Input Prompt", selector: "#controllerTextPrompt", kind: "text", width: 330, height: 92 },
      { id: "controllerInvalidBanner", name: "Invalid Submission Banner", selector: "#controllerInvalidBanner", kind: "art", width: 330, height: 64 },
      { id: "controllerTextInput", name: "Text Input Field", selector: "#controllerTextInput", kind: "art", width: 330, height: 128 },
      { id: "controllerTextSubmitButton", name: "Text Submit Button", selector: "#controllerTextSubmitButton", kind: "art", width: 300, height: 70 },
      { id: "controllerTextDone", name: "Text Done Message", selector: "#controllerTextDone", kind: "text", width: 330, height: 150 }
    ];
  }
  return [
    { id: "stageTitle", name: "Header", selector: ".stage-title", kind: "art", width: 1080, height: 150 },
    { id: "stageCodePanel", name: "Stage Code Panel", selector: ".stage-code-panel", kind: "art", width: 620, height: 220 },
    { id: "stageJoinQr", name: "Join QR Code", selector: "#stageJoinQr", kind: "art", width: 260, height: 300 },
    { id: "waitingStatus", name: "Waiting Status", selector: "#waitingStatus", kind: "text", width: 740, height: 90 },
    { id: "joinPrompt", name: "Join Prompt", selector: "#joinPrompt", kind: "text", width: 900, height: 86 },
    { id: "startPopup", name: "Countdown Popup", selector: "#startPopup", kind: "art", width: 260, height: 260 },
    { id: "craftingTimer", name: "Crafting Timer", selector: "#craftingTimer", kind: "art", width: 190, height: 190 },
    { id: "stageCodeBadge", name: "Small Room Code Widget", selector: "#stageCodeBadge", kind: "art", width: 210, height: 112 },
    { id: "presentClickWidget", name: "Cursor Widget", selector: "#presentClickWidget", kind: "art", width: 92, height: 92 },
    { id: "playerLobby", name: "Player Avatars", selector: "#playerLobby", kind: "art", width: 1500, height: 180 },
    { id: "votingCardLayer", name: "Voting Cards", selector: "#votingCardLayer", kind: "art", width: 1420, height: 520 },
    { id: "stageIntroTitle", name: "Game Intro Header", selector: "#stageIntroTitle", kind: "text", width: 840, height: 160 },
    { id: "stagePresentationText", name: "Presentation Text Field", selector: "#stagePresentationText", kind: "text", width: 1180, height: 260 },
    { id: "stagePromptText", name: "Prompt Text Field", selector: "#stagePromptText", kind: "text", width: 1180, height: 150 },
    { id: "roundIntroText", name: "Round Intro Text Field", selector: "#roundIntroText", kind: "text", width: 1080, height: 170 },
    { id: "roundIntroInfoText", name: "Round Intro Info Text Field", selector: "#roundIntroInfoText", kind: "text", width: 900, height: 110 }
  ];
}

function layoutObjectCatalog() {
  const group = layoutGroup(selectedLayoutStateId);
  const existingIds = new Set((group?.elements || []).map((element) => String(element.id || "").toLowerCase()));
  const existingSelectors = new Set((group?.elements || []).map((element) => String(element.selector || "").toLowerCase()));
  return baseLayoutObjectCatalog().filter((item) => {
    return !existingIds.has(item.id.toLowerCase()) && !existingSelectors.has(item.selector.toLowerCase());
  });
}

function layoutObjectMatches(query) {
  const catalog = layoutObjectCatalog();
  if (!query) return catalog;
  return catalog
    .map((item) => ({ item, score: fuzzyScore(`${item.name} ${item.id} ${item.kind} ${item.selector}`, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    .map((entry) => entry.item);
}

function makeLayoutObject(item) {
  const canvas = activeLayoutData().canvas || (layoutToolMode === "controller" ? { width: 390, height: 844 } : { width: 1920, height: 1080 });
  return {
    id: item.id,
    name: item.name,
    selector: item.selector,
    kind: item.kind || "art",
    x: Math.round(canvas.width / 2),
    y: Math.round(canvas.height / 2),
    width: item.width || 240,
    height: item.height || 120,
    scale: 1,
    defaultText: item.kind === "text" ? layoutDefaultText(item) : "",
    fontSize: item.kind === "text" ? 58 : 58,
    autoFitText: false,
    fontColor: item.kind === "text" ? (layoutToolMode === "controller" ? "#17131f" : "#ffffff") : "#ffffff"
  };
}

function layoutHistorySnapshot() {
  return JSON.stringify(serializeStageLayoutsForSave(activeLayoutData()));
}

function getLayoutHistoryManager() {
  if (!layoutHistoryManager && window.PartyGameToolHistory) {
    layoutHistoryManager = window.PartyGameToolHistory.createHistory({
      snapshot: layoutHistorySnapshot,
      restore: restoreLayoutHistory,
      limit: 30
    });
  }
  return layoutHistoryManager;
}

function pushLayoutHistory() {
  getLayoutHistoryManager()?.push();
}

function restoreLayoutHistory(snapshot) {
  setActiveLayoutData(JSON.parse(snapshot));
  selectedLayoutStateId = layoutGroup(selectedLayoutStateId)?.id || "global";
  setLayoutSelection([...selectedLayoutElementIds].filter((id) => layoutElement(selectedLayoutStateId, id)));
  if (!selectedLayoutElementId) setLayoutSelection(layoutGroup(selectedLayoutStateId)?.elements?.[0]?.id || "");
  renderLayoutTool();
}

function undoLayoutChange() {
  getLayoutHistoryManager()?.undo();
}

function redoLayoutChange() {
  getLayoutHistoryManager()?.redo();
}

function handleLayoutHotkeys(event) {
  if (layoutScreen.classList.contains("hidden")) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoLayoutChange();
    } else {
      undoLayoutChange();
    }
    return;
  }
  window.PartyGameToolAffordances?.handleToolDeleteHotkey(event, {
    canDelete: () => selectedEditableLayoutElements().length > 0,
    onDelete: removeSelectedLayoutObject
  });
}

function fitLayoutStagePreview() {
  const canvas = activeLayoutData().canvas || (layoutToolMode === "controller" ? { width: 390, height: 844 } : { width: 1920, height: 1080 });
  const wrap = layoutStagePreview.parentElement;
  if (!wrap) return 1;
  const wrapRect = wrap.getBoundingClientRect();
  const availableWidth = Math.max(1, wrapRect.width - 36);
  const availableHeight = Math.max(1, wrapRect.height - 56);
  const fitScale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const width = Math.max(1, canvas.width * fitScale);
  const height = Math.max(1, canvas.height * fitScale);
  layoutStagePreview.style.setProperty("--layout-preview-width", `${width}px`);
  layoutStagePreview.style.setProperty("--layout-preview-height", `${height}px`);
  return fitScale;
}

function renderLayoutTool() {
  if (layoutToolTitle) layoutToolTitle.textContent = layoutToolMode === "controller" ? "Controller Layouts" : "Stage Layouts";
  if (layoutToolDescription) {
    layoutToolDescription.textContent = layoutToolMode === "controller"
      ? "Position and scale fixed controller elements per game state."
      : "Position and scale fixed stage elements per game state.";
  }
  renderLayoutStates();
  renderLayoutElements();
  renderLayoutPreview();
  renderLayoutFields();
  renderLayoutActions();
  publishRuntimeLocalChanges();
  updateGlobalSaveButton();
}

function renderLayoutActions() {
  const hasSelection = selectedEditableLayoutElements().length > 0 || selectedLayoutStateId === "global" && selectedLayoutElements().length > 0;
  for (const button of [removeLayoutObjectButton, layoutPreviewRemoveObjectButton]) {
    if (button) button.disabled = !hasSelection;
  }
  if (revertLayoutButton) revertLayoutButton.disabled = !activeLayoutSavedSnapshot() || !isActiveLayoutDirty();
}

function renderLayoutStates() {
  const scrollTop = layoutStateList.scrollTop;
  layoutStateList.replaceChildren();
  for (const state of layoutGroups()) {
    const selectState = () => {
      selectedLayoutStateId = state.id;
      setLayoutSelection(state.elements?.[0]?.id || "");
      renderLayoutTool();
    };
    const { row } = window.PartyGameToolAffordances.createToolSidebarRow({
      tagName: "button",
      className: "flow-state-header",
      selected: state.id === selectedLayoutStateId,
      title: state.name,
      summary: state.id,
      pill: `${state.elements?.length || 0} assets`,
      onActivate: selectState
    });
    layoutStateList.appendChild(row);
  }
  layoutStateList.scrollTop = scrollTop;
}

function layoutPreviewHiddenKey(elementId, stateId = selectedLayoutStateId) {
  return `${layoutToolMode}:${stateId}:${elementId}`;
}

function isLayoutPreviewElementHidden(elementId, stateId = selectedLayoutStateId) {
  return layoutPreviewHiddenElements.has(layoutPreviewHiddenKey(elementId, stateId));
}

function toggleLayoutPreviewElement(elementId, stateId = selectedLayoutStateId) {
  const key = layoutPreviewHiddenKey(elementId, stateId);
  if (layoutPreviewHiddenElements.has(key)) {
    layoutPreviewHiddenElements.delete(key);
  } else {
    layoutPreviewHiddenElements.add(key);
  }
  renderLayoutElements();
  renderLayoutPreview();
}

function setAllLayoutPreviewElementsHidden(stateId, hidden) {
  const state = layoutGroup(stateId);
  for (const element of state?.elements || []) {
    const key = layoutPreviewHiddenKey(element.id, stateId);
    if (hidden) layoutPreviewHiddenElements.add(key);
    else layoutPreviewHiddenElements.delete(key);
  }
  renderLayoutElements();
  renderLayoutPreview();
}

function layoutVisibilityToggle(elementId, stateId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "layout-visibility-toggle";
  const isHidden = isLayoutPreviewElementHidden(elementId, stateId);
  button.classList.toggle("is-hidden", isHidden);
  button.title = isHidden ? "Show in preview" : "Hide in preview";
  button.innerHTML = `<span class="layout-eye-icon" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      setAllLayoutPreviewElementsHidden(stateId, !isLayoutPreviewElementHidden(elementId, stateId));
      return;
    }
    toggleLayoutPreviewElement(elementId, stateId);
  });
  return button;
}

function renderLayoutElements() {
  const scrollTop = layoutElementList.scrollTop;
  layoutElementList.replaceChildren();
  const state = layoutGroup(selectedLayoutStateId);
  for (const element of state?.elements || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flow-action-row";
    button.classList.toggle("is-selected", selectedLayoutElementIds.has(element.id));
    button.innerHTML = `<span><strong></strong><span></span></span>`;
    button.querySelector("strong").textContent = element.name;
    button.querySelector("span span").textContent = `${Math.round(element.x)}, ${Math.round(element.y)} / ${Number(element.scale || 1).toFixed(2)}x`;
    const actions = document.createElement("span");
    actions.className = "layout-row-actions";
    const pill = document.createElement("span");
    pill.className = "flow-pill";
    pill.textContent = element.kind === "text" ? "Text" : "Art";
    actions.appendChild(pill);
    actions.appendChild(layoutVisibilityToggle(element.id, selectedLayoutStateId));
    button.appendChild(actions);
    button.addEventListener("click", (event) => selectLayoutElement(element.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey }));
    layoutElementList.appendChild(button);
  }
  layoutElementList.scrollTop = scrollTop;
}

function layoutPreviewScale() {
  const canvas = activeLayoutData().canvas || (layoutToolMode === "controller" ? { width: 390, height: 844 } : { width: 1920, height: 1080 });
  return fitLayoutStagePreview() || layoutStagePreview.clientWidth / canvas.width;
}

function renderLayoutPreview() {
  layoutStagePreview.replaceChildren();
  layoutStagePreview.classList.toggle("is-controller-preview", layoutToolMode === "controller");
  const state = layoutGroup(selectedLayoutStateId);
  const scale = fitLayoutStagePreview() || 1;
  const previewElements = selectedLayoutStateId === "global"
    ? (state?.elements || [])
    : [...(state?.elements || []), ...(activeGlobalLayout().elements || [])];
  const hiddenGlobals = new Set(state?.hiddenGlobals || []);
  for (const element of previewElements) {
    if (isLayoutPreviewElementHidden(element.id, selectedLayoutStateId)) continue;
    const node = document.createElement("div");
    node.className = "layout-preview-element";
    const globalElements = activeGlobalLayout().elements || [];
    const isEditableElement = selectedLayoutStateId === "global" || !globalElements.some((globalElement) => globalElement.id === element.id);
    const isGlobalPreview = selectedLayoutStateId !== "global" && !isEditableElement;
    const isHiddenGlobal = isGlobalPreview && hiddenGlobals.has(element.id);
    node.classList.toggle("is-selected", selectedLayoutElementIds.has(element.id));
    node.classList.toggle("is-global-preview", selectedLayoutStateId !== "global" && !isEditableElement);
    node.classList.toggle("is-hidden-global", isHiddenGlobal);
    node.dataset.elementId = element.id;
    node.style.left = `${element.x * scale}px`;
    node.style.top = `${element.y * scale}px`;
    node.style.width = `${element.width * scale}px`;
    node.style.height = `${element.height * scale}px`;
    node.style.transform = `translate(-50%, -50%) scale(${element.scale || 1})`;
    node.style.setProperty("--layout-fit-scale", scale);
    node.appendChild(layoutPreviewContent(element));
    if (isEditableElement) {
      node.addEventListener("pointerdown", (event) => startLayoutDrag(event, element));
    } else {
      node.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectLayoutElement(element.id, { additive: event.metaKey || event.ctrlKey });
      });
    }
    if (isEditableElement && selectedLayoutElementIds.has(element.id)) {
      const handle = document.createElement("span");
      handle.className = "layout-resize-handle";
      handle.addEventListener("pointerdown", (event) => startLayoutScale(event, element));
      node.appendChild(handle);
    }
    layoutStagePreview.appendChild(node);
  }
}

function layoutPreviewContent(element) {
  const id = String(element.id || "").toLowerCase();
  const content = document.createElement("div");
  content.className = "layout-preview-content";
  if (layoutToolMode === "controller") {
    if (id === "jointitle") {
      content.appendChild(layoutPreviewTextNode(element, "Join Lobby"));
    } else if (id === "stagecodefield") {
      content.innerHTML = `<label class="layout-preview-input-label">Stage Code<div class="layout-preview-input">ABCD</div></label>`;
    } else if (id === "playernamefield") {
      content.innerHTML = `<label class="layout-preview-input-label">Player Name<div class="layout-preview-input">Ava</div></label>`;
    } else if (id === "joinbutton") {
      content.innerHTML = `<div class="layout-preview-button">Join</div>`;
    } else if (id === "controlleravatar") {
      content.innerHTML = `<div class="player-avatar avatar-rex" style="--avatar-color:#7c3aed">${playerAvatarArt("rex")}</div>`;
    } else if (id === "controllerplayername") {
      content.appendChild(layoutPreviewTextNode(element, "Ava"));
    } else if (id === "controllermeta") {
      content.appendChild(layoutPreviewTextNode(element, "VIP Player"));
    } else if (id === "startgamebutton") {
      content.innerHTML = `<div class="layout-preview-button">Start Game</div>`;
    } else if (id === "controllerplayerbanner") {
      content.innerHTML = `
        <div class="controller-player-banner">
          <div class="player-avatar avatar-rex" style="--avatar-color:#7c3aed">${playerAvatarArt("rex")}</div>
          <div class="controller-player-banner-name">Ava</div>
        </div>
      `;
    } else if (id === "controllerintromessage") {
      content.appendChild(layoutPreviewTextNode(element, "Welcome to the Game"));
    } else if (id === "intropresentbutton") {
      content.innerHTML = `<div class="layout-preview-button">Present HI THERE</div>`;
    } else if (id === "controllerinvalidbanner") {
      content.innerHTML = `<div class="layout-preview-invalid-banner">Your submission was invalid</div>`;
    } else if (id === "controllertextinput") {
      content.innerHTML = `<div class="layout-preview-input">Answer here</div>`;
    } else if (id === "controllertextsubmitbutton") {
      content.innerHTML = `<div class="layout-preview-button">Submit</div>`;
    } else if (element.kind === "text") {
      content.appendChild(layoutPreviewTextNode(element, element.name));
    } else {
      content.innerHTML = `<div class="layout-preview-art-label"></div>`;
      content.querySelector(".layout-preview-art-label").textContent = element.name;
    }
  } else if (id === "stagetitle") {
    content.innerHTML = `<div class="layout-preview-title">Party Game Template</div>`;
  } else if (id === "stagecodepanel") {
    content.innerHTML = `<div class="layout-preview-code-card"><span>Stage Code</span><strong>NUZ7</strong></div>`;
  } else if (id === "stagejoinqr") {
    content.innerHTML = `
      <div class="layout-preview-qr-card">
        <div class="layout-preview-qr-grid"></div>
        <span>Scan To Join</span>
      </div>
    `;
  } else if (id === "waitingstatus") {
    const pill = document.createElement("div");
    pill.className = "layout-preview-pill";
    pill.textContent = layoutDefaultText(element);
    applyLayoutPreviewTextStyle(pill, element);
    content.appendChild(pill);
  } else if (id === "joinprompt") {
    const pill = document.createElement("div");
    pill.className = "layout-preview-pill layout-preview-join";
    pill.textContent = layoutDefaultText(element);
    applyLayoutPreviewTextStyle(pill, element);
    content.appendChild(pill);
  } else if (id === "startpopup") {
    content.innerHTML = `<div class="layout-preview-countdown"><span>Starting in</span><strong>3</strong></div>`;
  } else if (id === "craftingtimer") {
    content.innerHTML = `<div class="layout-preview-countdown"><span>Timer</span><strong>30</strong></div>`;
  } else if (id === "playerlobby") {
    content.appendChild(layoutPreviewPlayers());
  } else if (id === "stagecodebadge") {
    content.innerHTML = `<div class="layout-preview-badge"><span>Stage</span><strong>NUZ7</strong></div>`;
  } else if (id === "stageintrotitle") {
    content.innerHTML = `<div class="layout-preview-title">Game Intro</div>`;
  } else if (id === "stagepresentationtext") {
    content.appendChild(layoutPreviewTextNode(element, "This is test number 1"));
  } else if (id === "stageprompttext") {
    content.appendChild(layoutPreviewTextNode(element, "Prompt Text"));
  } else if (id === "roundintrotext") {
    content.appendChild(layoutPreviewTextNode(element, "Round One"));
  } else if (id === "roundintroinfotext") {
    content.appendChild(layoutPreviewTextNode(element, "Additional round info"));
  } else if (id === "presentclickwidget") {
    content.innerHTML = `<div class="click-symbol"><span class="click-pulse"></span><span class="click-cursor"></span></div>`;
  } else if (element.kind === "text") {
    content.appendChild(layoutPreviewTextNode(element, element.name));
  } else {
    content.textContent = element.name;
  }
  return content;
}

function layoutDefaultText(element) {
  const id = String(element?.id || "").toLowerCase();
  const existing = element?.defaultText;
  if (existing !== undefined && existing !== null && String(existing).length) return String(existing);
  if (id === "waitingstatus") return "Waiting for Ava to start the game";
  if (id === "joinprompt") return "Join the Lobby at bit.ly/popcontroller";
  if (id === "stagepresentationtext") return "This is test number 1";
  if (id === "stageprompttext") return "Prompt Text";
  if (id === "roundintrotext") return "Round One";
  if (id === "roundintroinfotext") return "Additional round info";
  if (id === "jointitle") return "Join Lobby";
  if (id === "controllerplayername") return "Ava";
  if (id === "controllermeta") return "VIP Player";
  if (id === "controllerintromessage") return "Welcome to the Game";
  return String(element?.name || "Text");
}

function layoutComputedFontSize(element) {
  const baseSize = Number(element.fontSize || 58);
  if (!element.autoFitText) return baseSize;
  return fittedLayoutTextSize(element, layoutDefaultText(element), baseSize);
}

function applyLayoutPreviewTextStyle(node, element) {
  node.style.setProperty("--layout-text-font-size", `${layoutComputedFontSize(element)}px`);
  node.style.setProperty("--layout-text-color", normalizeUiColor(element.fontColor) || "#ffffff");
}

function layoutPreviewTextNode(element, fallbackText) {
  const node = document.createElement("div");
  node.className = "layout-preview-presentation";
  applyLayoutPreviewTextStyle(node, element);
  node.textContent = element.defaultText !== undefined && String(element.defaultText).length ? String(element.defaultText) : fallbackText;
  return node;
}

function layoutPreviewPlayers() {
  const wrap = document.createElement("div");
  wrap.className = "layout-preview-players";
  const samplePlayers = [
    { name: "Ava", shape: "rex", color: "#7c3aed", vip: true },
    { name: "Ben", shape: "trike", color: "#ff9e2c" },
    { name: "Cal", shape: "bronto", color: "#ff4fa3" },
    { name: "Dee", shape: "stego", color: "#f97316" }
  ];
  for (const player of samplePlayers) {
    const tile = document.createElement("article");
    tile.className = "layout-preview-player";
    tile.innerHTML = `
      <div class="player-avatar ${avatarClass(player.shape)}" style="--avatar-color:${player.color}">${playerAvatarArt(player.shape)}</div>
      <div class="player-name">${player.name}</div>
      ${player.vip ? `<div class="vip-badge">VIP</div>` : ""}
    `;
    wrap.appendChild(tile);
  }
  return wrap;
}

function startLayoutMarquee(event) {
  const marqueeRoot = layoutStagePreview.parentElement || layoutStagePreview;
  return window.PartyGameToolAffordances?.startSelectionMarquee(event, {
    root: marqueeRoot,
    itemRoot: layoutStagePreview,
    className: "layout-selection-marquee",
    itemSelector: ".layout-preview-element:not(.is-global-preview)",
    getItemId: (node) => node.dataset.elementId,
    shouldIgnoreTarget: (target) => Boolean(target.closest?.(".layout-preview-element")),
    onSelectionChange: (selectedIds) => {
      setLayoutSelection(selectedIds);
      renderLayoutElements();
      renderLayoutFields();
      renderLayoutActions();
      for (const node of layoutStagePreview.querySelectorAll(".layout-preview-element")) {
        node.classList.toggle("is-selected", selectedLayoutElementIds.has(node.dataset.elementId) && !node.classList.contains("is-global-preview"));
      }
    },
    onComplete: () => renderLayoutTool()
  });
}

function startLayoutDrag(event, element) {
  if (event.target.closest(".layout-resize-handle")) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.metaKey || event.ctrlKey) {
    selectLayoutElement(element.id, { additive: true });
    return;
  }
  if (!selectedLayoutElementIds.has(element.id)) {
    setLayoutSelection([element.id]);
  }
  pushLayoutHistory();
  const scale = layoutPreviewScale() || 1;
  const startX = event.clientX;
  const startY = event.clientY;
  const movingElements = selectedEditableLayoutElements();
  const origins = new Map(movingElements.map((item) => [item.id, { x: Number(item.x || 0), y: Number(item.y || 0) }]));
  let lockedAxis = null;
  let moved = false;
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    let deltaX = (moveEvent.clientX - startX) / scale;
    let deltaY = (moveEvent.clientY - startY) / scale;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
    moved = true;
    if (moveEvent.shiftKey) {
      if (!lockedAxis) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (Math.max(absX, absY) >= 2) lockedAxis = absX >= absY ? "x" : "y";
      }
      if (lockedAxis === "x") {
        deltaY = 0;
        if (moveEvent.metaKey) deltaX = Math.round(deltaX / 10) * 10;
      } else if (lockedAxis === "y") {
        deltaX = 0;
        if (moveEvent.metaKey) deltaY = Math.round(deltaY / 10) * 10;
      }
    }
    for (const item of movingElements) {
      const origin = origins.get(item.id);
      item.x = Number((origin.x + deltaX).toFixed(3));
      item.y = Number((origin.y + deltaY).toFixed(3));
    }
    renderLayoutTool();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    if (!moved) renderLayoutTool();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function startLayoutScale(event, element) {
  event.preventDefault();
  event.stopPropagation();
  if (!selectedLayoutElementIds.has(element.id)) setLayoutSelection([element.id]);
  pushLayoutHistory();
  const previewScale = layoutPreviewScale() || 1;
  const startX = event.clientX;
  const startY = event.clientY;
  const scalingElements = selectedEditableLayoutElements();
  const origins = new Map(scalingElements.map((item) => [item.id, Number(item.scale || 1)]));
  const originScale = Number(element.scale || 1);
  const baseSize = Math.max(Number(element.width || 1), Number(element.height || 1));
  event.currentTarget.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    const delta = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY) / previewScale;
    const nextPrimaryScale = Math.max(0.1, Math.min(6, originScale + delta / baseSize));
    const scaleDelta = nextPrimaryScale - originScale;
    for (const item of scalingElements) {
      const nextScale = Math.max(0.1, Math.min(6, origins.get(item.id) + scaleDelta));
      item.scale = Number(nextScale.toFixed(3));
    }
    renderLayoutTool();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function renderLayoutFields() {
  layoutEditorFields.replaceChildren();
  const state = layoutGroup(selectedLayoutStateId);
  const elements = selectedLayoutElements();
  const element = elements[elements.length - 1] || null;
  const isGlobalOverride = selectedLayoutStateId !== "global" && (activeGlobalLayout().elements || []).some((globalElement) => globalElement.id === element?.id);
  const hasAnyGlobalOverride = selectedLayoutStateId !== "global" && elements.some((item) => (activeGlobalLayout().elements || []).some((globalElement) => globalElement.id === item.id));
  layoutEditorTitle.textContent = elements.length > 1 ? `${elements.length} Objects Selected` : element ? element.name : state ? state.name : "Stage Layouts";
  layoutEditorHelp.textContent = elements.length > 1
    ? `Editing ${state.name}. Drag the selected group or change fields to move values relatively.`
    : isGlobalOverride
    ? `Editing ${state.name}. This global element keeps its global position, but can be hidden for this moment.`
    : element
    ? `Editing ${state.name}. Drag the highlighted box or resize from its corner.`
    : `Choose an element to edit its fixed ${layoutToolMode === "controller" ? "controller" : "stage"} position.`;
  if (!element) return;
  if (elements.length > 1 && hasAnyGlobalOverride) {
    layoutEditorHelp.textContent = `Editing ${state.name}. Select one global element at a time to hide it for this moment.`;
    return;
  }
  if (isGlobalOverride) {
    const hidden = new Set(state.hiddenGlobals || []).has(element.id);
    layoutEditorFields.appendChild(layoutToggleField("Hidden In This Moment", hidden, (value) => updateLayoutGlobalHidden(element.id, value)));
    return;
  }
  layoutEditorFields.appendChild(layoutNumberField("X", element.x, (value) => updateLayoutNumber("x", value)));
  layoutEditorFields.appendChild(layoutNumberField("Y", element.y, (value) => updateLayoutNumber("y", value)));
  layoutEditorFields.appendChild(layoutNumberField("Scale", element.scale, (value) => updateLayoutNumber("scale", Math.max(0.1, value)), 0.05));
  layoutEditorFields.appendChild(layoutNumberField("Width", element.width, (value) => updateLayoutNumber("width", Math.max(24, value))));
  layoutEditorFields.appendChild(layoutNumberField("Height", element.height, (value) => updateLayoutNumber("height", Math.max(24, value))));
  if (elements.length === 1 && element.kind === "text") {
    layoutEditorFields.appendChild(layoutTextAreaField("Default Text", layoutDefaultText(element), (value) => updateLayoutTextValue(element, "defaultText", value)));
    layoutEditorFields.appendChild(layoutNumberField("Font Size", element.fontSize || 58, (value) => updateLayoutTextValue(element, "fontSize", Math.max(6, value)), 1, "layout-text-field", element.autoFitText === true));
    layoutEditorFields.appendChild(layoutToggleField("Auto Fit Text", element.autoFitText === true, (value) => updateLayoutTextValue(element, "autoFitText", value)));
    layoutEditorFields.appendChild(layoutColorField("Font Color", normalizeUiColor(element.fontColor) || "#ffffff", (value, options) => updateLayoutTextValue(element, "fontColor", value, options)));
  }
}

function layoutNumberField(label, value, onChange, step = 1, extraClass = "", disabled = false) {
  const field = document.createElement("label");
  field.className = `layout-number-field ${extraClass}`.trim();
  field.classList.toggle("is-disabled", disabled);
  field.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(step);
  input.value = Number(value || 0);
  input.disabled = disabled;
  input.addEventListener("change", () => {
    const next = Number(input.value);
    onChange(Number.isFinite(next) ? next : Number(value || 0));
  });
  field.appendChild(input);
  return field;
}

function layoutTextAreaField(label, value, onChange) {
  const field = document.createElement("label");
  field.className = "layout-number-field layout-text-field is-wide";
  field.textContent = label;
  const input = document.createElement("textarea");
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  field.appendChild(input);
  return field;
}

function layoutToggleField(label, value, onChange) {
  const field = document.createElement("label");
  field.className = "layout-number-field layout-text-field";
  field.textContent = label;
  const input = document.createElement("select");
  input.innerHTML = `<option value="false">False</option><option value="true">True</option>`;
  input.value = value ? "true" : "false";
  input.addEventListener("change", () => onChange(input.value === "true"));
  field.appendChild(input);
  return field;
}

function layoutColorField(label, value, onChange) {
  return window.PartyGameColorControl.create({
    document,
    label,
    value,
    className: "layout-number-field layout-text-field layout-color-field layout-color-control",
    normalizeColor: window.PartyGameColorControl.normalize,
    onChange: (normalized, meta) => {
      onChange(normalized, {
        history: meta.captureHistory,
        colorCommit: meta.commit,
        previewOnly: meta.previewOnly
      });
    }
  });
}

function updateLayoutPreviewTextStyle(element) {
  const node = layoutStagePreview.querySelector(`.layout-preview-element[data-element-id="${CSS.escape(element.id)}"]`);
  if (!node) return;
  const textNode = node.querySelector(".layout-preview-presentation, .layout-preview-pill");
  if (textNode) applyLayoutPreviewTextStyle(textNode, element);
}

function updateLayoutNumber(key, value) {
  pushLayoutHistory();
  const elements = selectedLayoutElements();
  const primary = layoutElement(selectedLayoutStateId, selectedLayoutElementId) || elements[elements.length - 1];
  if (!primary) return;
  const delta = Number(value) - Number(primary[key] || 0);
  for (const element of selectedEditableLayoutElements()) {
    const nextValue = Number(element[key] || 0) + delta;
    element[key] = Number(Number(nextValue).toFixed(3));
  }
  renderLayoutTool();
}

function updateLayoutTextValue(element, key, value, options = {}) {
  if (options.history !== false) pushLayoutHistory();
  if (key === "fontSize") {
    element[key] = Number(Number(value).toFixed(3));
  } else {
    element[key] = value;
  }
  if (options.previewOnly === true) {
    updateLayoutPreviewTextStyle(element);
    updateGlobalSaveButton();
    return;
  }
  if (options.colorCommit === true) {
    updateLayoutPreviewTextStyle(element);
    publishRuntimeLocalChanges();
    updateGlobalSaveButton();
    return;
  }
  if (options.redraw === false) {
    renderLayoutPreview();
    publishRuntimeLocalChanges();
    updateGlobalSaveButton();
    return;
  }
  renderLayoutTool();
}

function updateLayoutGlobalHidden(elementId, isHidden) {
  const state = layoutGroup(selectedLayoutStateId);
  if (!state || selectedLayoutStateId === "global") return;
  pushLayoutHistory();
  const hiddenGlobals = new Set(state.hiddenGlobals || []);
  if (isHidden) {
    hiddenGlobals.add(elementId);
  } else {
    hiddenGlobals.delete(elementId);
  }
  state.hiddenGlobals = [...hiddenGlobals];
  renderLayoutTool();
}

function openLayoutObjectPicker() {
  if (!layoutGroup(selectedLayoutStateId)) return;
  layoutObjectPicker.classList.remove("hidden");
  layoutObjectSearch.value = "";
  renderLayoutObjectOptions();
  layoutObjectSearch.focus();
}

function closeLayoutObjectPicker() {
  layoutObjectPicker.classList.add("hidden");
}

function renderLayoutObjectOptions() {
  const query = layoutObjectSearch.value.trim().toLowerCase();
  const matches = layoutObjectMatches(query).slice(0, 12);
  layoutObjectOptions.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "flow-search-option";
    empty.textContent = "No matching objects";
    layoutObjectOptions.appendChild(empty);
    return;
  }
  for (const item of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flow-search-option";
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector("strong").textContent = item.name;
    button.querySelector("span").textContent = item.kind === "text" ? "Text Field" : "Game Art";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => addLayoutObject(item));
    layoutObjectOptions.appendChild(button);
  }
}

function addLayoutObject(item) {
  const group = layoutGroup(selectedLayoutStateId);
  if (!group) return;
  pushLayoutHistory();
  if (!Array.isArray(group.elements)) group.elements = [];
  const element = makeLayoutObject(item);
  group.elements.push(element);
  setLayoutSelection(element.id);
  closeLayoutObjectPicker();
  renderLayoutTool();
}

function removeSelectedLayoutObject() {
  const group = layoutGroup(selectedLayoutStateId);
  const selectedIds = new Set(selectedLayoutElementIds);
  if (!group || !selectedIds.size) return;
  const firstIndex = (group.elements || []).findIndex((element) => selectedIds.has(element.id));
  if (firstIndex < 0) return;
  pushLayoutHistory();
  group.elements = (group.elements || []).filter((element) => !selectedIds.has(element.id));
  setLayoutSelection(group.elements[firstIndex]?.id || group.elements[firstIndex - 1]?.id || "");
  renderLayoutTool();
}

function handleLayoutDocumentClick(event) {
  if (layoutObjectPicker.classList.contains("hidden")) return;
  if (event.target.closest("#layoutObjectPicker") || event.target.closest("#addLayoutObjectButton") || event.target.closest("#layoutPreviewAddObjectButton")) return;
  closeLayoutObjectPicker();
}

function revertStageLayouts() {
  const snapshot = activeLayoutSavedSnapshot();
  if (!snapshot) return;
  setActiveLayoutData(JSON.parse(snapshot));
  getLayoutHistoryManager().clear();
  selectedLayoutStateId = layoutGroup(selectedLayoutStateId)?.id || "global";
  setLayoutSelection(layoutElement(selectedLayoutStateId, selectedLayoutElementId)?.id || layoutGroup(selectedLayoutStateId)?.elements?.[0]?.id || "");
  closeLayoutObjectPicker();
  renderLayoutTool();
}

async function saveStageLayouts() {
  const result = await postJson("/api/stage-layouts", { layouts: serializeStageLayoutsForSave(stageLayouts) });
  stageLayouts = result.layouts || stageLayouts;
  layoutSavedSnapshot = JSON.stringify(serializeStageLayoutsForSave(stageLayouts));
  updateLayoutStorageStatus(result.storage);
  renderLayoutTool();
}

async function saveControllerLayouts() {
  const result = await postJson("/api/controller-layouts", { layouts: serializeStageLayoutsForSave(controllerLayouts) });
  controllerLayouts = result.layouts || controllerLayouts;
  controllerLayoutSavedSnapshot = JSON.stringify(serializeStageLayoutsForSave(controllerLayouts));
  updateLayoutStorageStatus(result.storage);
  renderLayoutTool();
}

async function setupLayoutTool(mode = "stage") {
  layoutToolMode = mode === "controller" ? "controller" : "stage";
  layoutScreen.classList.remove("hidden");
  if (layoutToolInitialized) {
    if (!activeLayoutSavedSnapshot()) {
      await loadLayoutToolData().catch((error) => {
        layoutStorageStatus.textContent = error.message;
      });
    }
    renderLayoutTool();
    return;
  }
  layoutToolInitialized = true;
  addLayoutObjectButton.addEventListener("click", openLayoutObjectPicker);
  layoutPreviewAddObjectButton.addEventListener("click", openLayoutObjectPicker);
  removeLayoutObjectButton.addEventListener("click", removeSelectedLayoutObject);
  layoutPreviewRemoveObjectButton.addEventListener("click", removeSelectedLayoutObject);
  window.PartyGameToolAffordances?.bindScrollStableControls?.(layoutEditorFields);
  layoutObjectSearch.addEventListener("input", renderLayoutObjectOptions);
  layoutObjectSearch.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLayoutObjectPicker();
    if (event.key === "Enter") {
      event.preventDefault();
      const first = layoutObjectMatches(layoutObjectSearch.value.trim().toLowerCase())[0];
      if (first) addLayoutObject(first);
    }
  });
  (layoutStagePreview.parentElement || layoutStagePreview).addEventListener("pointerdown", startLayoutMarquee);
  document.addEventListener("click", handleLayoutDocumentClick);
  revertLayoutButton.addEventListener("click", revertStageLayouts);
  window.addEventListener("keydown", handleLayoutHotkeys);
  window.addEventListener("resize", () => {
    if (!layoutScreen.classList.contains("hidden")) renderLayoutPreview();
  });
  try {
    await loadLayoutToolData();
  } catch (error) {
    layoutStorageStatus.textContent = error.message;
  }
}
