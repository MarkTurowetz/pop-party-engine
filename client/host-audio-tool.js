let draggedHostAudioLineId = "";
let hostAudioPreview = {
  audio: null,
  lineId: "",
  status: "stopped"
};

function makeHostAudioReferenceId(prefix = "host-audio") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID().replace(/-/g, "")}`;
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  return `${prefix}-${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeHostAudioId(value, fallback = "host-audio") {
  const id = String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return id || fallback;
}

function normalizeClientHostAudios(source = {}) {
  const rawHostAudios = Array.isArray(source) ? source : Array.isArray(source.hostAudios) ? source.hostAudios : [];
  const usedIds = new Set();
  const hostAudioItems = rawHostAudios.map((hostAudio, index) => {
    const name = String(hostAudio?.name || `Host Audio ${index + 1}`).trim().slice(0, 80) || `Host Audio ${index + 1}`;
    const baseId = normalizeHostAudioId(hostAudio?.id || name, `host-audio-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = normalizeHostAudioId(`${baseId}-${suffix}`, `host-audio-${index + 1}-${suffix}`);
      suffix += 1;
    }
    usedIds.add(id);
    return {
      id,
      name,
      lines: normalizeClientHostAudioLines(hostAudio?.lines, id)
    };
  });
  return { hostAudios: hostAudioItems };
}

function normalizeClientHostAudioLines(lines, hostAudioId) {
  const usedIds = new Set();
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const fallbackId = makeHostAudioReferenceId("host-line");
    const baseId = normalizeHostAudioId(line?.id || fallbackId, fallbackId);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = normalizeHostAudioId(`${baseId}-${suffix}`, `${hostAudioId}-line-${index + 1}-${suffix}`);
      suffix += 1;
    }
    usedIds.add(id);
    return {
      id,
      text: String(line?.text || "").slice(0, 240),
      url: String(line?.url || line?.audioUrl || "").trim().slice(0, 2000)
    };
  });
}

function serializeHostAudiosForSave(source = hostAudios) {
  return normalizeClientHostAudios(source);
}

function selectedHostAudio() {
  return (hostAudios.hostAudios || []).find((item) => item.id === selectedHostAudioId) || null;
}

function selectedHostAudioLine() {
  return (selectedHostAudio()?.lines || []).find((line) => line.id === selectedHostAudioLineId) || null;
}

function resetHostAudioPreviewAudio(audio = hostAudioPreview.audio) {
  if (!audio) return;
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch (error) {
    // Some streams do not allow seeking before metadata is ready.
  }
}

function clearHostAudioPreview({ render = true } = {}) {
  if (hostAudioPreview.audio) {
    hostAudioPreview.audio.removeEventListener("ended", handleHostAudioPreviewEnded);
    hostAudioPreview.audio.removeEventListener("error", handleHostAudioPreviewEnded);
    resetHostAudioPreviewAudio(hostAudioPreview.audio);
  }
  hostAudioPreview = {
    audio: null,
    lineId: "",
    status: "stopped"
  };
  if (render) renderHostAudioTool();
}

function handleHostAudioPreviewEnded() {
  clearHostAudioPreview();
}

function isHostAudioPreviewActiveForLine(lineId) {
  return hostAudioPreview.lineId === lineId && hostAudioPreview.audio && hostAudioPreview.status !== "stopped";
}

function isHostAudioPreviewPlayingForLine(lineId) {
  return isHostAudioPreviewActiveForLine(lineId) && hostAudioPreview.status === "playing";
}

function playHostAudioPreview(lineId, url) {
  const audioUrl = String(url || "").trim();
  if (!audioUrl) return;
  if (hostAudioPreview.audio && hostAudioPreview.lineId !== lineId) {
    clearHostAudioPreview({ render: false });
  }
  if (!hostAudioPreview.audio || hostAudioPreview.lineId !== lineId) {
    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", handleHostAudioPreviewEnded);
    audio.addEventListener("error", handleHostAudioPreviewEnded);
    hostAudioPreview = {
      audio,
      lineId,
      status: "playing"
    };
  } else {
    resetHostAudioPreviewAudio(hostAudioPreview.audio);
    hostAudioPreview.status = "playing";
  }
  hostAudioPreview.audio.play().then(() => {
    hostAudioPreview.status = "playing";
    renderHostAudioTool();
  }).catch(() => {
    clearHostAudioPreview();
  });
  renderHostAudioTool();
}

function stopHostAudioPreview(lineId = "", options = {}) {
  if (lineId && hostAudioPreview.lineId !== lineId) return;
  clearHostAudioPreview(options);
}

function ensureSelectedHostAudioLine() {
  if (!selectedHostAudioLine()) selectedHostAudioLineId = "";
  if (hostAudioPreview.lineId && !selectedHostAudioLine()) clearHostAudioPreview({ render: false });
}

function hostAudioHistorySnapshot() {
  return JSON.stringify(serializeHostAudiosForSave(hostAudios));
}

function getHostAudioHistoryManager() {
  if (!hostAudioHistoryManager && window.PartyGameToolHistory) {
    hostAudioHistoryManager = window.PartyGameToolHistory.createHistory({
      snapshot: hostAudioHistorySnapshot,
      restore: restoreHostAudioHistory,
      limit: 30
    });
  }
  return hostAudioHistoryManager;
}

function pushHostAudioHistory() {
  getHostAudioHistoryManager()?.push();
}

function restoreHostAudioHistory(snapshot) {
  const preferredHostAudioId = selectedHostAudioId;
  const preferredLineId = selectedHostAudioLineId;
  hostAudios = normalizeClientHostAudios(JSON.parse(snapshot));
  selectedHostAudioId = preferredHostAudioId && hostAudios.hostAudios.some((item) => item.id === preferredHostAudioId)
    ? preferredHostAudioId
    : hostAudios.hostAudios[0]?.id || "";
  selectedHostAudioLineId = preferredLineId;
  ensureSelectedHostAudioLine();
  renderHostAudioTool();
  if (typeof publishRuntimeLocalChanges === "function") publishRuntimeLocalChanges();
  updateGlobalSaveButton();
}

function undoHostAudioChange() {
  getHostAudioHistoryManager()?.undo();
}

function redoHostAudioChange() {
  getHostAudioHistoryManager()?.redo();
}

function handleHostAudioHotkeys(event) {
  if (hostAudioScreen.classList.contains("hidden")) return;
  window.PartyGameToolAffordances?.handleToolHistoryHotkey(event, {
    onUndo: undoHostAudioChange,
    onRedo: redoHostAudioChange
  });
}

function hostAudioDisplayName(hostAudioId) {
  return (hostAudios.hostAudios || []).find((item) => item.id === hostAudioId)?.name || hostAudioId || "No Host Audio";
}

function hostAudioFlowOptions() {
  return (hostAudios.hostAudios || []).map((item) => ({
    id: item.id,
    name: item.name,
    detail: `${(item.lines || []).length} lines`
  }));
}

function firstHostAudioId() {
  return (hostAudios.hostAudios || [])[0]?.id || "";
}

function createHostAudioId(name) {
  const baseId = normalizeHostAudioId(name || makeHostAudioReferenceId("host-audio"), "host-audio");
  const usedIds = new Set((hostAudios.hostAudios || []).map((item) => item.id));
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = normalizeHostAudioId(`${baseId}-${suffix}`, `host-audio-${suffix}`);
    suffix += 1;
  }
  return id;
}

function createPermanentHostAudioId() {
  return createHostAudioId(makeHostAudioReferenceId("host-audio"));
}

function createPermanentHostAudioLineId() {
  const hostAudio = selectedHostAudio();
  const usedIds = new Set((hostAudio?.lines || []).map((line) => line.id));
  let id = normalizeHostAudioId(makeHostAudioReferenceId("host-line"), "host-line");
  while (usedIds.has(id)) id = normalizeHostAudioId(makeHostAudioReferenceId("host-line"), "host-line");
  return id;
}

function firstHostAudioLinePreview(hostAudio) {
  const text = String((hostAudio?.lines || [])[0]?.text || "").trim();
  return text || "First line: empty";
}

function hostAudioLinePreview(line) {
  const text = String(line?.text || "").trim();
  if (text) return text;
  const url = String(line?.url || "").trim();
  return url ? "Audio URL set" : "Empty line";
}

function updateHostAudioStorageStatus(storage) {
  if (!hostAudioStorageStatus) return;
  if (!storage) {
    hostAudioStorageStatus.textContent = "Audio storage: unknown";
    return;
  }
  if (storage.durable) {
    hostAudioStorageStatus.textContent = `Audio storage: GitHub ${storage.repo || ""}${storage.branch ? ` / ${storage.branch}` : ""}`;
    return;
  }
  hostAudioStorageStatus.textContent = storage.error || "Audio storage: local fallback only";
}

async function loadHostAudios({ silent = false } = {}) {
  const result = await (window.PartyGameToolContext?.api?.hostAudio?.loadHostAudios?.() || getJson("/api/host-audios"));
  clearHostAudioPreview({ render: false });
  hostAudios = normalizeClientHostAudios(result.hostAudios || {});
  hostAudiosSavedSnapshot = JSON.stringify(serializeHostAudiosForSave(result.savedHostAudios || result.hostAudios || hostAudios));
  selectedHostAudioId = selectedHostAudioId && hostAudios.hostAudios.some((item) => item.id === selectedHostAudioId)
    ? selectedHostAudioId
    : hostAudios.hostAudios[0]?.id || "";
  ensureSelectedHostAudioLine();
  getHostAudioHistoryManager()?.clear();
  updateHostAudioStorageStatus(result.storage);
  if (!silent) renderHostAudioTool();
  updateGlobalSaveButton();
  return hostAudios;
}

function isHostAudiosDirty() {
  return hostAudiosSavedSnapshot && JSON.stringify(serializeHostAudiosForSave(hostAudios)) !== hostAudiosSavedSnapshot;
}

function publishHostAudioChanges({ render = true, renderList = false } = {}) {
  if (render) renderHostAudioTool();
  if (!render && renderList) renderHostAudioList();
  if (!render && revertHostAudiosButton) revertHostAudiosButton.disabled = !isHostAudiosDirty();
  if (typeof publishRuntimeLocalChanges === "function") publishRuntimeLocalChanges();
  updateGlobalSaveButton();
}

function addHostAudio() {
  pushHostAudioHistory();
  const item = {
    id: createPermanentHostAudioId(),
    name: "Host Audio",
    lines: []
  };
  hostAudios.hostAudios.push(item);
  selectedHostAudioId = item.id;
  selectedHostAudioLineId = "";
  publishHostAudioChanges();
}

function deleteSelectedHostAudio() {
  if (!selectedHostAudioId) return;
  pushHostAudioHistory();
  clearHostAudioPreview({ render: false });
  hostAudios.hostAudios = (hostAudios.hostAudios || []).filter((item) => item.id !== selectedHostAudioId);
  selectedHostAudioId = hostAudios.hostAudios[0]?.id || "";
  selectedHostAudioLineId = "";
  publishHostAudioChanges();
}

function addHostAudioLine() {
  const hostAudio = selectedHostAudio();
  if (!hostAudio) return;
  pushHostAudioHistory();
  hostAudio.lines = hostAudio.lines || [];
  const line = {
    id: createPermanentHostAudioLineId(),
    text: "",
    url: ""
  };
  hostAudio.lines.push(line);
  selectedHostAudioLineId = line.id;
  publishHostAudioChanges();
}

function removeHostAudioLine(lineId) {
  const hostAudio = selectedHostAudio();
  if (!hostAudio) return;
  const index = (hostAudio.lines || []).findIndex((line) => line.id === lineId);
  if (index < 0) return;
  pushHostAudioHistory();
  stopHostAudioPreview(lineId, { render: false });
  hostAudio.lines = (hostAudio.lines || []).filter((line) => line.id !== lineId);
  if (selectedHostAudioLineId === lineId) {
    selectedHostAudioLineId = hostAudio.lines[Math.min(index, hostAudio.lines.length - 1)]?.id || "";
  }
  publishHostAudioChanges();
}

function selectHostAudioLine(lineId) {
  const hostAudio = selectedHostAudio();
  if (!(hostAudio?.lines || []).some((line) => line.id === lineId)) return;
  if (selectedHostAudioLineId !== lineId) clearHostAudioPreview({ render: false });
  selectedHostAudioLineId = lineId;
  renderHostAudioTool();
}

function moveHostAudioLine(lineId, offset) {
  const hostAudio = selectedHostAudio();
  const lines = hostAudio?.lines || [];
  const fromIndex = lines.findIndex((line) => line.id === lineId);
  if (fromIndex < 0) return;
  const toIndex = Math.max(0, Math.min(lines.length - 1, fromIndex + offset));
  if (fromIndex === toIndex) return;
  pushHostAudioHistory();
  const [line] = lines.splice(fromIndex, 1);
  lines.splice(toIndex, 0, line);
  selectedHostAudioLineId = line.id;
  publishHostAudioChanges();
}

function reorderHostAudioLine(draggedLineId, targetLineId, placeAfter = false) {
  const hostAudio = selectedHostAudio();
  const lines = hostAudio?.lines || [];
  const fromIndex = lines.findIndex((line) => line.id === draggedLineId);
  const targetIndex = lines.findIndex((line) => line.id === targetLineId);
  if (fromIndex < 0 || targetIndex < 0 || draggedLineId === targetLineId) return;
  pushHostAudioHistory();
  const [line] = lines.splice(fromIndex, 1);
  const adjustedTargetIndex = lines.findIndex((item) => item.id === targetLineId);
  const insertIndex = adjustedTargetIndex + (placeAfter ? 1 : 0);
  lines.splice(Math.max(0, Math.min(lines.length, insertIndex)), 0, line);
  selectedHostAudioLineId = line.id;
  draggedHostAudioLineId = "";
  publishHostAudioChanges();
}

function updateHostAudioName(value) {
  renameHostAudio(selectedHostAudioId, value);
}

function renameHostAudio(hostAudioId, value, options = {}) {
  const hostAudio = (hostAudios.hostAudios || []).find((item) => item.id === hostAudioId);
  if (!hostAudio) return;
  const nextName = value.trim().slice(0, 80) || "Host Audio";
  if (hostAudio.name === nextName) return;
  if (options.captureHistory !== false) pushHostAudioHistory();
  hostAudio.name = nextName;
  if (hostAudio.id === selectedHostAudioId && hostAudioNameInput) hostAudioNameInput.value = hostAudio.name;
  publishHostAudioChanges(options.publishOptions || {});
}

function updateHostAudioLine(lineId, patch, options = {}) {
  const hostAudio = selectedHostAudio();
  const line = (hostAudio?.lines || []).find((item) => item.id === lineId);
  if (!line) return;
  if (options.captureHistory !== false) pushHostAudioHistory();
  Object.assign(line, patch);
  publishHostAudioChanges(options);
}

function renderHostAudioList() {
  if (!hostAudioList) return;
  hostAudioList.replaceChildren();
  if (!hostAudios.hostAudios.length) {
    const empty = document.createElement("p");
    empty.className = "art-shared-note";
    empty.textContent = "No host audios yet.";
    hostAudioList.appendChild(empty);
    return;
  }
  for (const item of hostAudios.hostAudios) {
    const titleInput = document.createElement("input");
    titleInput.className = "text-input host-audio-list-title";
    titleInput.value = item.name || "Host Audio";
    titleInput.addEventListener("click", (event) => event.stopPropagation());
    titleInput.addEventListener("keydown", (event) => event.stopPropagation());
    titleInput.addEventListener("change", () => {
      renameHostAudio(item.id, titleInput.value);
    });
    const select = () => {
      selectedHostAudioId = item.id;
      renderHostAudioTool();
    };
    const { row } = window.PartyGameToolAffordances.createToolSidebarRow({
      className: "host-audio-list-item",
      copyClassName: "host-audio-list-copy",
      summaryClassName: "host-audio-list-preview",
      selected: item.id === selectedHostAudioId,
      titleNode: titleInput,
      summary: firstHostAudioLinePreview(item),
      pill: `${(item.lines || []).length} lines`,
      onActivate: select,
      activateOnDoubleClick: true
    });
    hostAudioList.appendChild(row);
  }
}

function hostAudioLineActionButton(label, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = label;
  if (options.title) button.title = options.title;
  if (options.ariaLabel) button.setAttribute("aria-label", options.ariaLabel);
  if (options.disabled) button.disabled = true;
  if (options.pressed) button.setAttribute("aria-pressed", "true");
  if (options.className) button.classList.add(...String(options.className).split(/\s+/).filter(Boolean));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick?.(event);
  });
  return button;
}

function createHostAudioLineCard(line, index) {
  const isSelected = line.id === selectedHostAudioLineId;
  const textField = document.createElement("label");
  textField.className = "field-label flow-form-grid";
  textField.textContent = "Line Text";
  const textInput = document.createElement("textarea");
  textInput.className = "text-input flow-textarea";
  textInput.value = line.text || "";
  let textHistoryCaptured = false;
  textInput.addEventListener("focus", () => {
    textHistoryCaptured = false;
  });
  textInput.addEventListener("input", () => {
    if (!textHistoryCaptured) {
      pushHostAudioHistory();
      textHistoryCaptured = true;
    }
    updateHostAudioLine(line.id, { text: textInput.value.slice(0, 240) }, { render: false, renderList: index === 0, captureHistory: false });
  });
  textField.appendChild(textInput);

  const urlField = document.createElement("label");
  urlField.className = "field-label flow-form-grid";
  urlField.textContent = "Audio URL";
  const urlInput = document.createElement("input");
  urlInput.className = "text-input";
  urlInput.type = "url";
  urlInput.value = line.url || "";
  let urlHistoryCaptured = false;
  urlInput.addEventListener("focus", () => {
    urlHistoryCaptured = false;
  });
  urlInput.addEventListener("input", () => {
    if (!urlHistoryCaptured) {
      pushHostAudioHistory();
      urlHistoryCaptured = true;
    }
    if (isHostAudioPreviewActiveForLine(line.id)) stopHostAudioPreview(line.id, { render: false });
    updateHostAudioLine(line.id, { url: urlInput.value.trim().slice(0, 2000) }, { render: false, renderList: index === 0, captureHistory: false });
  });
  urlInput.addEventListener("change", () => {
    const nextUrl = urlInput.value.trim().slice(0, 2000);
    if (line.url !== nextUrl) updateHostAudioLine(line.id, { url: nextUrl });
  });
  urlField.appendChild(urlInput);

  const toolbar = document.createElement("div");
  toolbar.className = "host-audio-line-toolbar";
  let previewPlayButton = null;
  let previewStopButton = null;
  if (isSelected) {
    const hasAudioUrl = Boolean(String(urlInput.value || "").trim());
    const isPreviewActive = isHostAudioPreviewActiveForLine(line.id);
    const isPreviewPlaying = isHostAudioPreviewPlayingForLine(line.id);
    previewPlayButton = hostAudioLineActionButton("Play", () => {
      playHostAudioPreview(line.id, urlInput.value);
    }, {
      title: isPreviewActive ? "Restart audio preview" : "Play audio preview",
      ariaLabel: "Play audio preview",
      disabled: !hasAudioUrl,
      pressed: isPreviewPlaying,
      className: isPreviewPlaying ? "host-audio-preview-button is-active" : "host-audio-preview-button"
    });
    previewStopButton = hostAudioLineActionButton("Stop", () => {
      stopHostAudioPreview(line.id);
    }, {
      title: "Stop preview and return to the beginning",
      ariaLabel: "Stop audio preview",
      disabled: !isPreviewActive,
      className: "host-audio-preview-button"
    });
    toolbar.append(
      hostAudioLineActionButton("↑", () => moveHostAudioLine(line.id, -1), {
        title: "Move line up",
        ariaLabel: "Move line up",
        disabled: index <= 0
      }),
      hostAudioLineActionButton("↓", () => moveHostAudioLine(line.id, 1), {
        title: "Move line down",
        ariaLabel: "Move line down",
        disabled: index >= (selectedHostAudio()?.lines || []).length - 1
      }),
      previewPlayButton,
      previewStopButton,
      hostAudioLineActionButton("Delete", () => removeHostAudioLine(line.id))
    );
    urlInput.addEventListener("input", () => {
      const hasUrl = Boolean(String(urlInput.value || "").trim());
      if (previewPlayButton && !isHostAudioPreviewActiveForLine(line.id)) {
        previewPlayButton.disabled = !hasUrl;
        previewPlayButton.classList.remove("is-active");
        previewPlayButton.removeAttribute("aria-pressed");
      }
      if (previewStopButton) {
        previewStopButton.disabled = !isHostAudioPreviewActiveForLine(line.id);
      }
    });
  }

  const { row: card } = window.PartyGameToolAffordances.createToolAccordionRow({
    className: "host-audio-line-card",
    headerClassName: "host-audio-line-header",
    copyClassName: "host-audio-line-copy",
    summaryClassName: "host-audio-line-summary",
    actionsClassName: "host-audio-line-actions",
    fieldsClassName: "host-audio-line-fields",
    expanded: isSelected,
    draggable: true,
    dataset: { lineId: line.id },
    title: `Line ${index + 1}`,
    summary: hostAudioLinePreview(line),
    actions: [],
    fields: isSelected ? [textField, urlField, toolbar] : [textField, urlField],
    onActivate: () => selectHostAudioLine(line.id)
  });
  card.addEventListener("dragstart", (event) => {
    if (event.target.closest("input, textarea, button")) {
      event.preventDefault();
      return;
    }
    selectedHostAudioLineId = line.id;
    draggedHostAudioLineId = line.id;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", line.id);
  });
  card.addEventListener("dragover", (event) => {
    const draggedLineId = draggedHostAudioLineId;
    if (!draggedLineId || draggedLineId === line.id) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    const placeAfter = event.clientY > rect.top + rect.height / 2;
    card.classList.toggle("is-drop-before", !placeAfter);
    card.classList.toggle("is-drop-after", placeAfter);
  });
  card.addEventListener("dragleave", () => {
    card.classList.remove("is-drop-before", "is-drop-after");
  });
  card.addEventListener("drop", (event) => {
    const draggedLineId = draggedHostAudioLineId || event.dataTransfer.getData("text/plain");
    if (!draggedLineId || draggedLineId === line.id) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    reorderHostAudioLine(draggedLineId, line.id, event.clientY > rect.top + rect.height / 2);
  });
  card.addEventListener("dragend", () => {
    const shouldRenderSelection = draggedHostAudioLineId === line.id;
    draggedHostAudioLineId = "";
    card.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    if (shouldRenderSelection) renderHostAudioTool();
  });

  return card;
}

function renderHostAudioEditor() {
  const hostAudio = selectedHostAudio();
  if (!hostAudio) {
    hostAudioEditorTitle.textContent = "Host Audios";
    hostAudioEditorHelp.textContent = "Create a host audio to edit its lines.";
    hostAudioNameInput.value = "";
    hostAudioNameInput.disabled = true;
    hostAudioLineList.replaceChildren();
    addHostAudioLineButton.disabled = true;
    deleteHostAudioButton.disabled = true;
    selectedHostAudioLineId = "";
    return;
  }

  ensureSelectedHostAudioLine();
  hostAudioEditorTitle.textContent = hostAudio.name;
  hostAudioEditorHelp.textContent = `${(hostAudio.lines || []).length} lines`;
  hostAudioNameInput.disabled = false;
  hostAudioNameInput.value = hostAudio.name;
  addHostAudioLineButton.disabled = false;
  deleteHostAudioButton.disabled = false;
  hostAudioLineList.replaceChildren();
  if (!hostAudio.lines.length) {
    const empty = document.createElement("p");
    empty.className = "art-shared-note";
    empty.textContent = "Add a line to this host audio.";
    hostAudioLineList.appendChild(empty);
    return;
  }
  hostAudio.lines.forEach((line, index) => {
    hostAudioLineList.appendChild(createHostAudioLineCard(line, index));
  });
}

function renderHostAudioTool() {
  renderHostAudioList();
  renderHostAudioEditor();
  if (revertHostAudiosButton) revertHostAudiosButton.disabled = !isHostAudiosDirty();
}

async function saveHostAudios() {
  const result = await (window.PartyGameToolContext?.api?.hostAudio?.saveHostAudios?.(serializeHostAudiosForSave(hostAudios))
    || postJson("/api/host-audios", { hostAudios: serializeHostAudiosForSave(hostAudios) }));
  clearHostAudioPreview({ render: false });
  hostAudios = normalizeClientHostAudios(result.hostAudios || {});
  hostAudiosSavedSnapshot = JSON.stringify(serializeHostAudiosForSave(hostAudios));
  selectedHostAudioId = selectedHostAudioId && hostAudios.hostAudios.some((item) => item.id === selectedHostAudioId)
    ? selectedHostAudioId
    : hostAudios.hostAudios[0]?.id || "";
  ensureSelectedHostAudioLine();
  updateHostAudioStorageStatus(result.storage);
  renderHostAudioTool();
  if (typeof publishRuntimeLocalChanges === "function") publishRuntimeLocalChanges({ hostAudios: null, clearHostAudios: true });
}

function revertHostAudios() {
  if (!hostAudiosSavedSnapshot) return;
  clearHostAudioPreview({ render: false });
  hostAudios = normalizeClientHostAudios(JSON.parse(hostAudiosSavedSnapshot));
  getHostAudioHistoryManager()?.clear();
  selectedHostAudioId = hostAudios.hostAudios[0]?.id || "";
  ensureSelectedHostAudioLine();
  publishHostAudioChanges();
}

async function setupHostAudioTool() {
  hostAudioScreen.classList.remove("hidden");
  if (hostAudioToolInitialized) {
    renderHostAudioTool();
    return;
  }
  if (!hostAudioToolInitialized) {
    hostAudioToolInitialized = true;
    addHostAudioButton.addEventListener("click", addHostAudio);
    addHostAudioLineButton.addEventListener("click", addHostAudioLine);
    deleteHostAudioButton.addEventListener("click", deleteSelectedHostAudio);
    revertHostAudiosButton.addEventListener("click", revertHostAudios);
    hostAudioNameInput.addEventListener("change", () => updateHostAudioName(hostAudioNameInput.value));
    window.addEventListener("keydown", handleHostAudioHotkeys);
  }
  try {
    await loadHostAudios();
  } catch (error) {
    hostAudioEditorTitle.textContent = "Host Audios Offline";
    hostAudioEditorHelp.textContent = error.message;
  }
}
