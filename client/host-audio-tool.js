let draggedHostAudioLineId = "";

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
  return (Array.isArray(lines) ? lines : []).map((line, index) => ({
    id: normalizeHostAudioId(line?.id || `${hostAudioId}-line-${index + 1}`, `${hostAudioId}-line-${index + 1}`),
    text: String(line?.text || "").slice(0, 240),
    url: String(line?.url || line?.audioUrl || "").trim().slice(0, 2000)
  }));
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

function ensureSelectedHostAudioLine() {
  if (!selectedHostAudioLine()) selectedHostAudioLineId = "";
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
  const baseId = normalizeHostAudioId(name || `host-audio-${Date.now().toString(36)}`, "host-audio");
  const usedIds = new Set((hostAudios.hostAudios || []).map((item) => item.id));
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = normalizeHostAudioId(`${baseId}-${suffix}`, `host-audio-${suffix}`);
    suffix += 1;
  }
  return id;
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
  const result = await getJson("/api/host-audios");
  hostAudios = normalizeClientHostAudios(result.hostAudios || {});
  hostAudiosSavedSnapshot = JSON.stringify(serializeHostAudiosForSave(result.savedHostAudios || result.hostAudios || hostAudios));
  selectedHostAudioId = selectedHostAudioId && hostAudios.hostAudios.some((item) => item.id === selectedHostAudioId)
    ? selectedHostAudioId
    : hostAudios.hostAudios[0]?.id || "";
  ensureSelectedHostAudioLine();
  updateHostAudioStorageStatus(result.storage);
  if (!silent) renderHostAudioTool();
  updateGlobalSaveButton();
  return hostAudios;
}

function isHostAudiosDirty() {
  return hostAudiosSavedSnapshot && JSON.stringify(serializeHostAudiosForSave(hostAudios)) !== hostAudiosSavedSnapshot;
}

function publishHostAudioChanges({ render = true } = {}) {
  if (render) renderHostAudioTool();
  if (!render && revertHostAudiosButton) revertHostAudiosButton.disabled = !isHostAudiosDirty();
  if (typeof publishRuntimeLocalChanges === "function") publishRuntimeLocalChanges();
  updateGlobalSaveButton();
}

function addHostAudio() {
  const nextNumber = (hostAudios.hostAudios || []).length + 1;
  const name = `Host Audio ${nextNumber}`;
  const item = {
    id: createHostAudioId(name),
    name,
    lines: []
  };
  hostAudios.hostAudios.push(item);
  selectedHostAudioId = item.id;
  selectedHostAudioLineId = "";
  publishHostAudioChanges();
}

function deleteSelectedHostAudio() {
  if (!selectedHostAudioId) return;
  hostAudios.hostAudios = (hostAudios.hostAudios || []).filter((item) => item.id !== selectedHostAudioId);
  selectedHostAudioId = hostAudios.hostAudios[0]?.id || "";
  selectedHostAudioLineId = "";
  publishHostAudioChanges();
}

function addHostAudioLine() {
  const hostAudio = selectedHostAudio();
  if (!hostAudio) return;
  const index = (hostAudio.lines || []).length;
  hostAudio.lines = hostAudio.lines || [];
  const line = {
    id: normalizeHostAudioId(`${hostAudio.id}-line-${Date.now().toString(36)}`, `${hostAudio.id}-line-${index + 1}`),
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
  hostAudio.lines = (hostAudio.lines || []).filter((line) => line.id !== lineId);
  if (selectedHostAudioLineId === lineId) {
    selectedHostAudioLineId = hostAudio.lines[Math.min(index, hostAudio.lines.length - 1)]?.id || "";
  }
  publishHostAudioChanges();
}

function selectHostAudioLine(lineId) {
  const hostAudio = selectedHostAudio();
  if (!(hostAudio?.lines || []).some((line) => line.id === lineId)) return;
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
  const [line] = lines.splice(fromIndex, 1);
  const adjustedTargetIndex = lines.findIndex((item) => item.id === targetLineId);
  const insertIndex = adjustedTargetIndex + (placeAfter ? 1 : 0);
  lines.splice(Math.max(0, Math.min(lines.length, insertIndex)), 0, line);
  selectedHostAudioLineId = line.id;
  draggedHostAudioLineId = "";
  publishHostAudioChanges();
}

function updateHostAudioName(value) {
  const hostAudio = selectedHostAudio();
  if (!hostAudio) return;
  hostAudio.name = value.trim().slice(0, 80) || hostAudio.name;
  publishHostAudioChanges();
}

function updateHostAudioLine(lineId, patch, options = {}) {
  const hostAudio = selectedHostAudio();
  const line = (hostAudio?.lines || []).find((item) => item.id === lineId);
  if (!line) return;
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flow-state-header";
    button.classList.toggle("is-selected", item.id === selectedHostAudioId);
    button.innerHTML = `<span><strong></strong><span></span></span><span class="flow-pill"></span>`;
    button.querySelector("strong").textContent = item.name;
    button.querySelector("span span").textContent = item.id;
    button.querySelector(".flow-pill").textContent = `${(item.lines || []).length} lines`;
    const select = () => {
      selectedHostAudioId = item.id;
      renderHostAudioTool();
    };
    button.addEventListener("click", select);
    button.addEventListener("dblclick", select);
    hostAudioList.appendChild(button);
  }
}

function createHostAudioLineCard(line, index) {
  const card = document.createElement("div");
  card.className = "host-audio-line-card";
  const isSelected = line.id === selectedHostAudioLineId;
  card.classList.toggle("is-selected", isSelected);
  card.draggable = true;
  card.dataset.lineId = line.id;
  card.tabIndex = 0;

  const header = document.createElement("div");
  header.className = "host-audio-line-header";
  const title = document.createElement("strong");
  title.textContent = `Line ${index + 1}`;
  const actions = document.createElement("div");
  actions.className = "host-audio-line-actions";
  if (isSelected) {
    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "secondary-button";
    upButton.textContent = "↑";
    upButton.title = "Move line up";
    upButton.setAttribute("aria-label", "Move line up");
    upButton.disabled = index <= 0;
    upButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveHostAudioLine(line.id, -1);
    });
    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "secondary-button";
    downButton.textContent = "↓";
    downButton.title = "Move line down";
    downButton.setAttribute("aria-label", "Move line down");
    downButton.disabled = index >= (selectedHostAudio()?.lines || []).length - 1;
    downButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveHostAudioLine(line.id, 1);
    });
    actions.append(upButton, downButton);
  }
  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "secondary-button";
  playButton.textContent = "Play";
  playButton.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.className = "secondary-button";
  stopButton.textContent = "Stop";
  stopButton.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "secondary-button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    removeHostAudioLine(line.id);
  });
  actions.append(playButton, stopButton, deleteButton);
  header.append(title, actions);

  const textField = document.createElement("label");
  textField.className = "field-label flow-form-grid";
  textField.textContent = "Line Text";
  const textInput = document.createElement("textarea");
  textInput.className = "text-input flow-textarea";
  textInput.value = line.text || "";
  textInput.addEventListener("input", () => updateHostAudioLine(line.id, { text: textInput.value.slice(0, 240) }, { render: false }));
  textField.appendChild(textInput);

  const urlField = document.createElement("label");
  urlField.className = "field-label flow-form-grid";
  urlField.textContent = "Audio URL";
  const urlInput = document.createElement("input");
  urlInput.className = "text-input";
  urlInput.type = "url";
  urlInput.value = line.url || "";
  urlInput.addEventListener("change", () => updateHostAudioLine(line.id, { url: urlInput.value.trim().slice(0, 2000) }));
  urlField.appendChild(urlInput);

  card.addEventListener("click", (event) => {
    if (event.target.closest("input, textarea, button")) return;
    selectHostAudioLine(line.id);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("input, textarea, button")) return;
    event.preventDefault();
    selectHostAudioLine(line.id);
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

  card.append(header, textField, urlField);
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
  const result = await postJson("/api/host-audios", { hostAudios: serializeHostAudiosForSave(hostAudios) });
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
  hostAudios = normalizeClientHostAudios(JSON.parse(hostAudiosSavedSnapshot));
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
  }
  try {
    await loadHostAudios();
  } catch (error) {
    hostAudioEditorTitle.textContent = "Host Audios Offline";
    hostAudioEditorHelp.textContent = error.message;
  }
}
