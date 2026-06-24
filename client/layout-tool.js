function activeLayoutData() {
  return layoutToolMode === "controller" ? controllerLayouts : stageLayouts;
}

let layoutArtCatalogRefreshPromise = null;

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
    hiddenInStates: group.id === "global" ? group.hiddenInStates === true : false,
    hiddenGlobals: Array.isArray(group.hiddenGlobals) ? [...group.hiddenGlobals] : [],
    elements: (group.elements || [])
      .filter((element) => !element.artCompositionId || typeof isArtCompositionPendingDelete !== "function" || !isArtCompositionPendingDelete(element.artCompositionId))
      .map((element) => ({
      id: element.id,
      name: element.name,
      selector: element.selector,
      kind: element.kind || "art",
      artCompositionId: element.artCompositionId || "",
      x: Number(Number(element.x || 0).toFixed(3)),
      y: Number(Number(element.y || 0).toFixed(3)),
      width: Number(Number(element.width || 0).toFixed(3)),
      height: Number(Number(element.height || 0).toFixed(3)),
      scale: Number(Number(element.scale || 1).toFixed(3)),
      rotation: Number(Number(element.rotation || 0).toFixed(3)),
      defaultAnimationState: String(element.defaultAnimationState || ""),
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
  const selection = PartyGameToolAffordances.normalizeSelection(ids, validIds);
  selectedLayoutElementIds = selection.idSet;
  selectedLayoutElementId = selection.primaryId;
}

function selectLayoutElement(elementId, options = {}) {
  if (options.additive) {
    const validIds = new Set((layoutGroup(selectedLayoutStateId)?.elements || []).map((element) => element.id));
    if (selectedLayoutStateId !== "global") {
      for (const element of activeGlobalLayout().elements || []) validIds.add(element.id);
    }
    setLayoutSelection(PartyGameToolAffordances.toggleSelectionId(selectedLayoutElementIds, elementId, validIds));
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

function removeArtCompositionFromLayoutData(layouts, compositionId) {
  if (!layouts || !compositionId) return 0;
  const removedElementIds = new Set();
  let removedCount = 0;
  const groups = [layouts.global, ...(layouts.states || [])].filter(Boolean);
  for (const group of groups) {
    const before = group.elements || [];
    group.elements = before.filter((element) => {
      if (element.artCompositionId !== compositionId) return true;
      if (element.id) removedElementIds.add(element.id);
      removedCount += 1;
      return false;
    });
  }
  if (removedElementIds.size) {
    for (const group of groups) {
      if (!Array.isArray(group.hiddenGlobals)) continue;
      group.hiddenGlobals = group.hiddenGlobals.filter((elementId) => !removedElementIds.has(elementId));
    }
  }
  return removedCount;
}

function removeArtCompositionLayoutInstances(compositionId) {
  const removedCount = removeArtCompositionFromLayoutData(stageLayouts, compositionId)
    + removeArtCompositionFromLayoutData(controllerLayouts, compositionId);
  if (!removedCount) return 0;
  if ([...selectedLayoutElementIds].some((elementId) => !layoutElement(selectedLayoutStateId, elementId))) {
    setLayoutSelection(layoutGroup(selectedLayoutStateId)?.elements?.[0]?.id || "");
  }
  if (layoutScreen && !layoutScreen.classList.contains("hidden")) renderLayoutTool();
  updateGlobalSaveButton();
  return removedCount;
}

function baseLayoutObjectCatalog() {
  const catalogArtCompositions = typeof mergeArtCompositionDrafts === "function"
    ? mergeArtCompositionDrafts(artCompositions || [])
    : artCompositions || [];
  const artCompositionIds = new Set((catalogArtCompositions || []).map((composition) => composition.id));
  const artSurface = layoutToolMode === "controller" ? "controller" : "stage";
  const artPrefabObjects = (catalogArtCompositions || [])
    .filter((composition) => layoutArtCompositionSurface(composition) === artSurface)
    .map((composition) => ({
      id: `art-${composition.id}`,
      name: composition.name || "Art Asset",
      selector: "",
      kind: "art",
      artCompositionId: composition.id,
      width: Number(composition.canvas?.width || 240),
      height: Number(composition.canvas?.height || 120),
      instanced: true
    }));
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
      { id: "controllerTextDone", name: "Text Done Message", selector: "#controllerTextDone", kind: "text", width: 330, height: 150 },
      ...artPrefabObjects
    ];
  }
  const legacyStageObjects = [
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
  ].filter((item) => !stageLayoutCatalogCompositionId(item.id, artCompositionIds));
  return [
    ...artPrefabObjects,
    ...legacyStageObjects
  ];
}

function layoutArtCompositionSurface(composition) {
  return composition?.surface === "controller" ? "controller" : "stage";
}

function layoutSerializedArtComposition(composition) {
  if (typeof serializeArtCompositionsForSave === "function") {
    return JSON.stringify(serializeArtCompositionsForSave([composition])[0]);
  }
  return JSON.stringify(composition || {});
}

function layoutUnsavedArtCompositions(beforeLoad = []) {
  if (!artCompositionsSavedSnapshot) return [];
  let savedById = new Map();
  try {
    savedById = new Map(JSON.parse(artCompositionsSavedSnapshot).map((composition) => [composition.id, JSON.stringify(composition)]));
  } catch (error) {
    savedById = new Map();
  }
  return (beforeLoad || []).filter((composition) => {
    const saved = savedById.get(composition.id);
    return !saved || layoutSerializedArtComposition(composition) !== saved;
  });
}

async function refreshLayoutArtCatalog() {
  if (layoutToolMode !== "stage") return;
  const localChanges = layoutUnsavedArtCompositions(artCompositions || []);
  await loadArtAssets().catch(() => {});
  if (!localChanges.length) return;
  const byId = new Map((artCompositions || []).map((composition) => [composition.id, composition]));
  for (const composition of localChanges) byId.set(composition.id, composition);
  artCompositions = [...byId.values()];
}

function refreshLayoutArtCatalogInBackground(options = {}) {
  if (layoutToolMode !== "stage") return Promise.resolve();
  if (!layoutArtCatalogRefreshPromise) {
    layoutArtCatalogRefreshPromise = refreshLayoutArtCatalog()
      .catch(() => {})
      .finally(() => {
        layoutArtCatalogRefreshPromise = null;
      });
  }
  return layoutArtCatalogRefreshPromise.then(() => {
    if (options.renderPicker && !layoutObjectPicker.classList.contains("hidden")) renderLayoutObjectOptions();
    if (options.renderPreview && !layoutScreen.classList.contains("hidden")) renderLayoutPreview();
  });
}

function stageLayoutCatalogCompositionId(elementId, compositionIds = new Set()) {
  const definition = window.PartyGameStageWidgetBindings?.definitionForLayoutElement?.(elementId);
  const compositionId = definition?.compositionId || "";
  return compositionId && compositionIds.has(compositionId) ? compositionId : "";
}

function layoutObjectCatalog() {
  const group = layoutGroup(selectedLayoutStateId);
  const existingIds = new Set((group?.elements || []).map((element) => String(element.id || "").toLowerCase()));
  const existingSelectors = new Set((group?.elements || []).map((element) => String(element.selector || "").toLowerCase()));
  return baseLayoutObjectCatalog().filter((item) => {
    if (item.instanced || item.artCompositionId) return true;
    return !existingIds.has(item.id.toLowerCase()) && !existingSelectors.has(item.selector.toLowerCase());
  });
}

function layoutObjectMatches(query) {
  const catalog = layoutObjectCatalog();
  if (!query) return catalog;
  return catalog
    .map((item) => ({ item, score: layoutObjectFuzzyScore(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    .map((entry) => entry.item);
}

function layoutObjectFuzzyScore(item, query) {
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return 0;
  const name = String(item?.name || "").toLowerCase();
  const id = String(item?.id || "").toLowerCase();
  const kind = String(item?.kind || "").toLowerCase();
  const selector = String(item?.selector || "").toLowerCase();
  const artCompositionId = String(item?.artCompositionId || "").toLowerCase();
  const fields = [name, id, artCompositionId, kind, selector].filter(Boolean);
  if (name === cleanQuery) return 0;
  if (id === cleanQuery || artCompositionId === cleanQuery) return 1;
  if (name.startsWith(cleanQuery)) return 2;
  if (fields.some((field) => field.startsWith(cleanQuery))) return 3;
  if (name.split(/\s+/).some((word) => word.startsWith(cleanQuery))) return 4;
  if (fields.some((field) => field.includes(cleanQuery))) return 10;
  const haystack = `${name} ${id} ${artCompositionId} ${kind} ${selector}`;
  const score = simpleLayoutFuzzyScore(haystack, cleanQuery);
  if (score < 0) return -1;
  return 100 + score;
}

function simpleLayoutFuzzyScore(text, query) {
  let score = 0;
  let textIndex = 0;
  const haystack = String(text || "").toLowerCase();
  for (const character of String(query || "").toLowerCase()) {
    const foundIndex = haystack.indexOf(character, textIndex);
    if (foundIndex < 0) return -1;
    score += foundIndex - textIndex;
    textIndex = foundIndex + 1;
  }
  return score + Math.abs(haystack.length - String(query || "").length) * 0.01;
}

function makeLayoutObject(item) {
  const canvas = activeLayoutData().canvas || (layoutToolMode === "controller" ? { width: 390, height: 844 } : { width: 1920, height: 1080 });
  const isPrefabInstance = Boolean(item.artCompositionId);
  return {
    id: isPrefabInstance ? uniqueLayoutElementId(item.artCompositionId || item.id) : item.id,
    name: item.name,
    selector: isPrefabInstance ? "" : item.selector,
    kind: item.kind || "art",
    artCompositionId: item.artCompositionId || "",
    x: Math.round(canvas.width / 2),
    y: Math.round(canvas.height / 2),
    width: item.width || 240,
    height: item.height || 120,
    scale: 1,
    rotation: 0,
    defaultAnimationState: isPrefabInstance ? "park" : "",
    defaultText: item.kind === "text" ? layoutDefaultText(item) : "",
    fontSize: item.kind === "text" ? 58 : 58,
    autoFitText: false,
    fontColor: item.kind === "text" ? (layoutToolMode === "controller" ? "#17131f" : "#ffffff") : "#ffffff"
  };
}

function uniqueLayoutElementId(baseId) {
  const group = layoutGroup(selectedLayoutStateId);
  const cleanBase = String(baseId || "art").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "art";
  const existingIds = new Set((group?.elements || []).map((element) => String(element.id || "").toLowerCase()));
  let index = 1;
  let id = `${cleanBase}-instance-${index}`;
  while (existingIds.has(id)) {
    index += 1;
    id = `${cleanBase}-instance-${index}`;
  }
  return id;
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
  if (window.PartyGameToolAffordances?.handleToolHistoryHotkey(event, {
    onUndo: undoLayoutChange,
    onRedo: redoLayoutChange
  })) return;
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
      className: state.id === "global" ? "flow-state-header has-disclosure" : "flow-state-header",
      selected: state.id === selectedLayoutStateId,
      title: state.name,
      summary: state.id,
      pill: `${state.elements?.length || 0} assets`,
      leadingNodes: state.id === "global" ? [globalLayerVisibilityToggle()] : [],
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
  const keys = (state?.elements || []).map((element) => layoutPreviewHiddenKey(element.id, stateId));
  PartyGameToolAffordances.setMembershipForIds(layoutPreviewHiddenElements, keys, hidden);
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
    if (PartyGameToolAffordances.eventIsMetaToggle(event)) {
      setAllLayoutPreviewElementsHidden(stateId, !isLayoutPreviewElementHidden(elementId, stateId));
      return;
    }
    toggleLayoutPreviewElement(elementId, stateId);
  });
  return button;
}

function globalLayerVisibilityToggle() {
  const global = activeGlobalLayout();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "layout-visibility-toggle";
  button.classList.toggle("is-hidden", global.hiddenInStates === true);
  button.title = global.hiddenInStates === true ? "Show global layer in layouts" : "Hide global layer in layouts";
  button.innerHTML = `<span class="layout-eye-icon" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    pushLayoutHistory();
    activeGlobalLayout().hiddenInStates = activeGlobalLayout().hiddenInStates !== true;
    renderLayoutTool();
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
  const showGlobalLayer = selectedLayoutStateId === "global" || activeGlobalLayout().hiddenInStates !== true;
  const previewElements = selectedLayoutStateId === "global"
    ? (state?.elements || [])
    : [...(state?.elements || []), ...(showGlobalLayer ? activeGlobalLayout().elements || [] : [])];
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
    node.style.transform = `translate(-50%, -50%) rotate(${Number(element.rotation || 0)}deg) scale(${element.scale || 1})`;
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
      window.PartyGameToolAffordances.appendTransformHandles(node, {
        primary: element.id === selectedLayoutElementId,
        onResize: (event) => startLayoutScale(event, element),
        rotationOrigins: () => selectedEditableLayoutElements().map((item) => ({ id: item.id, rotation: Number(item.rotation || 0) })),
        onRotateStart: pushLayoutHistory,
        onRotate: (items) => {
          const byId = new Map(items.map((item) => [item.id, item.rotation]));
          for (const item of selectedEditableLayoutElements()) {
            item.rotation = Number(Number(byId.get(item.id) || 0).toFixed(3));
          }
          renderLayoutTool();
        }
      });
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
  } else if (renderLayoutArtCompositionPreview(content, element)) {
    return content;
  } else if (renderLayoutWidgetArtPreview(content, id)) {
    return content;
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

function renderLayoutArtCompositionPreview(content, element) {
  const compositionId = element?.artCompositionId || "";
  if (!compositionId) return false;
  return renderLayoutArtComposition(content, compositionId, {});
}

function renderLayoutWidgetArtPreview(content, elementId) {
  const binding = layoutWidgetArtPreviewBinding(elementId);
  return binding ? renderLayoutArtComposition(content, binding.compositionId, binding.textOverrides || {}) : false;
}

function renderLayoutArtComposition(content, compositionId, textOverrides = {}) {
  const composition = artComposition(compositionId);
  const artRuntime = window.PartyGameArtObject;
  if (!content || !composition || !artRuntime) return false;
  content.classList.add("is-art-composition-preview");
  const components = (composition.components || []).map((component) => layoutWidgetArtPreviewComponent(component, textOverrides));
  const renderer = new artRuntime.ArtObjectTreeRenderer({
    host: content,
    document,
    gameObjectApi: window.PartyGameGameObject || window.PartyGameStageGameObject,
    visualAnimation: window.PartyGameVisualObject
  });
  renderer.render(components, composition.canvas || { width: 1, height: 1 }, { instant: true });
  return true;
}

function layoutWidgetArtPreviewComponent(component, textOverrides = {}) {
  const clone = {
    ...component,
    children: (component.children || []).map((child) => layoutWidgetArtPreviewComponent(child, textOverrides))
  };
  if (Object.prototype.hasOwnProperty.call(textOverrides, clone.id)) {
    clone.defaultText = String(textOverrides[clone.id] ?? "");
  }
  return clone;
}

function layoutWidgetArtPreviewBinding(elementId) {
  const definition = window.PartyGameStageWidgetBindings?.definitionForLayoutElement?.(elementId);
  if (!definition) return null;
  return {
    compositionId: definition.compositionId,
    textOverrides: window.PartyGameStageWidgetBindings?.previewTextOverrides?.(elementId) || {}
  };
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
    shouldIgnoreTarget: (target) => Boolean(target.closest?.(".layout-preview-element, .layout-resize-handle, .layout-rotation-handle")),
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
  if (event.target.closest(".layout-resize-handle, .layout-rotation-handle")) return;
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
  const movingElements = selectedEditableLayoutElements();
  const origins = new Map(movingElements.map((item) => [item.id, { x: Number(item.x || 0), y: Number(item.y || 0) }]));
  let moved = false;
  PartyGameToolAffordances.startPointerDrag(event, {
    scale: layoutPreviewScale() || 1,
    onMove: (moveEvent, dragState) => {
      const { deltaX, deltaY } = PartyGameToolAffordances.dragDeltaFromEvent(moveEvent, dragState, { axisLock: true });
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
      moved = true;
      for (const item of movingElements) {
        const origin = origins.get(item.id);
        item.x = Number((origin.x + deltaX).toFixed(3));
        item.y = Number((origin.y + deltaY).toFixed(3));
      }
      renderLayoutTool();
    },
    onEnd: () => {
      if (!moved) renderLayoutTool();
    }
  });
}

function startLayoutScale(event, element) {
  event.preventDefault();
  event.stopPropagation();
  if (!selectedLayoutElementIds.has(element.id)) setLayoutSelection([element.id]);
  pushLayoutHistory();
  const scalingElements = selectedEditableLayoutElements();
  const origins = new Map(scalingElements.map((item) => [item.id, Number(item.scale || 1)]));
  const originScale = Number(element.scale || 1);
  const baseSize = Math.max(Number(element.width || 1), Number(element.height || 1));
  PartyGameToolAffordances.startPointerDrag(event, {
    scale: layoutPreviewScale() || 1,
    originScale,
    baseSize,
    onMove: (moveEvent, dragState) => {
      const nextPrimaryScale = PartyGameToolAffordances.scaledValueFromPointer(moveEvent, dragState, { min: 0.1, max: 6 });
      const scaleDelta = nextPrimaryScale - originScale;
      for (const item of scalingElements) {
        const nextScale = Math.max(0.1, Math.min(6, origins.get(item.id) + scaleDelta));
        item.scale = Number(nextScale.toFixed(3));
      }
      renderLayoutTool();
    }
  });
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
  layoutEditorFields.appendChild(layoutNumberField("Rotation", element.rotation || 0, (value) => updateLayoutNumber("rotation", value)));
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
  refreshLayoutArtCatalogInBackground({ renderPicker: true });
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
    button.querySelector("span").textContent = item.artCompositionId ? "Art Prefab" : item.kind === "text" ? "Text Field" : "Game Art";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => addLayoutObject(item));
    layoutObjectOptions.appendChild(button);
  }
}

function handleLayoutArtAssetsChanged() {
  if (layoutToolMode !== "stage" || layoutScreen.classList.contains("hidden")) return;
  if (!layoutObjectPicker.classList.contains("hidden")) renderLayoutObjectOptions();
  renderLayoutPreview();
  refreshLayoutArtCatalogInBackground({ renderPicker: true, renderPreview: true });
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
  refreshLayoutArtCatalogInBackground({ renderPicker: true, renderPreview: true });
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
  listenForArtAssetsChanged(handleLayoutArtAssetsChanged);
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
