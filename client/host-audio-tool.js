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
  publishHostAudioChanges();
}

function deleteSelectedHostAudio() {
  if (!selectedHostAudioId) return;
  hostAudios.hostAudios = (hostAudios.hostAudios || []).filter((item) => item.id !== selectedHostAudioId);
  selectedHostAudioId = hostAudios.hostAudios[0]?.id || "";
  publishHostAudioChanges();
}

function addHostAudioLine() {
  const hostAudio = selectedHostAudio();
  if (!hostAudio) return;
  const index = (hostAudio.lines || []).length;
  hostAudio.lines = hostAudio.lines || [];
  hostAudio.lines.push({
    id: normalizeHostAudioId(`${hostAudio.id}-line-${Date.now().toString(36)}`, `${hostAudio.id}-line-${index + 1}`),
    text: "",
    url: ""
  });
  publishHostAudioChanges();
}

function removeHostAudioLine(lineId) {
  const hostAudio = selectedHostAudio();
  if (!hostAudio) return;
  hostAudio.lines = (hostAudio.lines || []).filter((line) => line.id !== lineId);
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

  const header = document.createElement("div");
  header.className = "host-audio-line-header";
  const title = document.createElement("strong");
  title.textContent = `Line ${index}`;
  const actions = document.createElement("div");
  actions.className = "host-audio-line-actions";
  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "secondary-button";
  playButton.textContent = "Play";
  playButton.addEventListener("click", () => {});
  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.className = "secondary-button";
  stopButton.textContent = "Stop";
  stopButton.addEventListener("click", () => {});
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "secondary-button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => removeHostAudioLine(line.id));
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
    return;
  }

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
  updateHostAudioStorageStatus(result.storage);
  renderHostAudioTool();
  if (typeof publishRuntimeLocalChanges === "function") publishRuntimeLocalChanges({ hostAudios: null, clearHostAudios: true });
}

function revertHostAudios() {
  if (!hostAudiosSavedSnapshot) return;
  hostAudios = normalizeClientHostAudios(JSON.parse(hostAudiosSavedSnapshot));
  selectedHostAudioId = hostAudios.hostAudios[0]?.id || "";
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
