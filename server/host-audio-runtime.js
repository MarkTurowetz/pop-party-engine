"use strict";

const HOST_AUDIO_PLAY_MODES = new Set(["random", "sequence", "index"]);

function createHostAudioRuntime({ normalizeFlowId, random = Math.random }) {
  function cleanHostAudioText(value, fallback = "") {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 240) || fallback;
  }

  function cleanHostAudioUrl(value) {
    return String(value ?? "").trim().slice(0, 2000);
  }

  function normalizeHostAudioPlayMode(value) {
    return HOST_AUDIO_PLAY_MODES.has(value) ? value : "random";
  }

  function normalizeLineIndex(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(9999, Math.floor(number)));
  }

  function normalizeHostAudioLine(line, lineIndex, hostAudioId) {
    const fallbackId = `${hostAudioId}-line-${lineIndex + 1}`;
    return {
      id: normalizeFlowId(line?.id || fallbackId, fallbackId),
      text: cleanHostAudioText(line?.text, ""),
      url: cleanHostAudioUrl(line?.url || line?.audioUrl)
    };
  }

  function normalizeHostAudio(hostAudio, index) {
    const fallbackName = `Host Audio ${index + 1}`;
    const name = cleanHostAudioText(hostAudio?.name, fallbackName);
    const id = normalizeFlowId(hostAudio?.id || name, `host-audio-${index + 1}`);
    const lines = (Array.isArray(hostAudio?.lines) ? hostAudio.lines : [])
      .map((line, lineIndex) => normalizeHostAudioLine(line, lineIndex, id));
    return { id, name, lines };
  }

  function normalizeHostAudios(source) {
    const rawHostAudios = Array.isArray(source)
      ? source
      : Array.isArray(source?.hostAudios)
        ? source.hostAudios
        : [];
    const seenIds = new Set();
    const hostAudios = rawHostAudios.map((hostAudio, index) => {
      const normalized = normalizeHostAudio(hostAudio, index);
      let id = normalized.id;
      let suffix = 2;
      while (seenIds.has(id)) {
        id = normalizeFlowId(`${normalized.id}-${suffix}`, `host-audio-${index + 1}-${suffix}`);
        suffix += 1;
      }
      seenIds.add(id);
      return { ...normalized, id };
    });
    return { hostAudios };
  }

  function findHostAudio(source, hostAudioId) {
    const normalizedId = normalizeFlowId(hostAudioId, "");
    return normalizeHostAudios(source).hostAudios.find((hostAudio) => hostAudio.id === normalizedId) || null;
  }

  function hostAudioSelectionKey(room, action) {
    return [room?.phase || "", room?.actionIndex ?? "", action?.id || ""].join(":");
  }

  function nextSequenceIndex(room, hostAudioId, lineCount) {
    room.hostAudioSequenceIndexes = room.hostAudioSequenceIndexes || {};
    const current = normalizeLineIndex(room.hostAudioSequenceIndexes[hostAudioId]);
    const selected = lineCount > 0 ? current % lineCount : 0;
    room.hostAudioSequenceIndexes[hostAudioId] = lineCount > 0 ? (selected + 1) % lineCount : 0;
    return selected;
  }

  function selectHostAudioLineIndex(room, action, hostAudio, lineCount) {
    const mode = normalizeHostAudioPlayMode(action?.playMode);
    if (mode === "index") return Math.min(lineCount - 1, normalizeLineIndex(action?.lineIndex));
    if (mode === "sequence") return nextSequenceIndex(room, hostAudio.id, lineCount);
    return Math.floor(random() * lineCount);
  }

  function serializeHostAudioLineSelection(hostAudio, line, lineIndex) {
    return {
      hostAudioId: hostAudio.id,
      hostAudioName: hostAudio.name,
      lineId: line?.id || "",
      lineIndex,
      text: line?.text || "",
      url: line?.url || ""
    };
  }

  function resolveHostAudioAction(room, action, source) {
    if (!action || action.type !== "playHostAudio") return action;
    const hostAudio = findHostAudio(source, action.hostAudioId);
    const lines = (hostAudio?.lines || []).filter((line) => line && (line.url || line.text));
    if (!hostAudio || lines.length === 0) {
      return {
        ...action,
        hostAudioName: hostAudio?.name || "",
        hostAudioLine: null,
        audioUrl: "",
        hostAudioText: ""
      };
    }

    const key = hostAudioSelectionKey(room, action);
    room.hostAudioActionSelections = room.hostAudioActionSelections || {};
    let selection = room.hostAudioActionSelections[key];
    if (!selection || selection.hostAudioId !== hostAudio.id) {
      const lineIndex = selectHostAudioLineIndex(room, action, hostAudio, lines.length);
      selection = serializeHostAudioLineSelection(hostAudio, lines[lineIndex], lineIndex);
      room.hostAudioActionSelections[key] = selection;
    }

    return {
      ...action,
      hostAudioName: selection.hostAudioName,
      hostAudioLine: selection,
      audioUrl: selection.url,
      hostAudioText: selection.text
    };
  }

  return {
    normalizeHostAudios,
    normalizeHostAudioPlayMode,
    normalizeLineIndex,
    resolveHostAudioAction
  };
}

module.exports = { createHostAudioRuntime };
