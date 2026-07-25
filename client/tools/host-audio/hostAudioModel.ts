import type { HostAudioLine, HostAudioSet, HostAudios } from "../../types/game-data";

/**
 * Typed port of the legacy normalizeClientHostAudios / serializeHostAudiosForSave
 * so the React host-audio editor saves byte-compatibly.
 */
export function makeHostAudioReferenceId(prefix = "host-audio"): string {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj?.randomUUID) return `${prefix}-${cryptoObj.randomUUID().replace(/-/g, "")}`;
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}-${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeHostAudioId(value: unknown, fallback = "host-audio"): string {
  const id = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || fallback;
}

function normalizeLines(lines: unknown, hostAudioId: string): HostAudioLine[] {
  const usedIds = new Set<string>();
  return (Array.isArray(lines) ? lines : []).map((rawLine, index) => {
    const line = (rawLine || {}) as Record<string, unknown>;
    const fallbackId = makeHostAudioReferenceId("host-line");
    const baseId = normalizeHostAudioId(line.id || fallbackId, fallbackId);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = normalizeHostAudioId(`${baseId}-${suffix}`, `${hostAudioId}-line-${index + 1}-${suffix}`);
      suffix += 1;
    }
    usedIds.add(id);
    const normalized: HostAudioLine = {
      id,
      text: String(line.text || "").slice(0, 240),
      url: String(line.url || line.audioUrl || "").trim().slice(0, 2000)
    };
    const blobPath = String(line.blobPath || "").trim().slice(0, 2000);
    if (blobPath) {
      normalized.blobPath = blobPath;
      normalized.sha256 = String(line.sha256 || "").trim().slice(0, 64);
      normalized.mimeType = String(line.mimeType || "").trim().slice(0, 120);
      normalized.sourceName = String(line.sourceName || "").trim().slice(0, 240);
    }
    return normalized;
  });
}

export function normalizeHostAudios(source: Partial<HostAudios> | HostAudioSet[] | null | undefined = {}): HostAudios {
  const rawHostAudios = Array.isArray(source)
    ? source
    : Array.isArray(source?.hostAudios)
      ? source.hostAudios
      : [];
  const usedIds = new Set<string>();
  const hostAudios: HostAudioSet[] = rawHostAudios.map((rawSet, index) => {
    const set = (rawSet || {}) as Record<string, unknown>;
    const name = String(set.name || `Host Audio ${index + 1}`).trim().slice(0, 80) || `Host Audio ${index + 1}`;
    const baseId = normalizeHostAudioId(set.id || name, `host-audio-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = normalizeHostAudioId(`${baseId}-${suffix}`, `host-audio-${index + 1}-${suffix}`);
      suffix += 1;
    }
    usedIds.add(id);
    return { id, name, lines: normalizeLines(set.lines, id) };
  });
  return { hostAudios };
}

export function hostAudiosSnapshot(source: Partial<HostAudios> | null | undefined): string {
  return JSON.stringify(normalizeHostAudios(source || {}));
}
