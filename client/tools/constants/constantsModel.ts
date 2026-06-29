import type { GameConstants, JsonObject } from "../../types/game-data";

/**
 * Typed port of shared/game-constants-schema.js + the legacy
 * normalizeClientGameConstants. Produces the byte-compatible save shape so the
 * React constants editor saves identically to the legacy tool. (When shared/ is
 * migrated to TS in Phase 5 this can re-export from there instead.)
 */
export const CUSTOM_CONSTANT_TYPES = ["int", "float", "string", "bool", "list"] as const;
export type CustomConstantType = (typeof CUSTOM_CONSTANT_TYPES)[number];

export type CustomConstantValue = number | boolean | string | string[];

export interface CustomConstant extends JsonObject {
  id: string;
  name: string;
  type: CustomConstantType;
  value: CustomConstantValue;
}

export interface NormalizedGameConstants extends GameConstants {
  playerColors: string[];
  craftingTimerDuration: number;
  startGameCountdownDuration: number;
  pointsForCorrectAnswer: number;
  gameTitle: string;
  numberOfRounds: number;
  randomChanceTest: number;
  speechToTextSendInputBuffer: number;
  overrideFirstGameOfSession: boolean;
  customConstants: CustomConstant[];
}

const RESERVED_CONSTANT_IDS = [
  "customConstants",
  "playerColors",
  "craftingTimerDuration",
  "startGameCountdownDuration",
  "pointsForCorrectAnswer",
  "gameTitle",
  "numberOfRounds",
  "randomChanceTest",
  "speechToTextSendInputBuffer",
  "overrideFirstGameOfSession"
];

const DEFAULT_PLAYER_COLORS = [
  "#22d3ee",
  "#60d394",
  "#ffe156",
  "#ff9e2c",
  "#ff4fa3",
  "#7c3aed",
  "#2458ff",
  "#ef4444",
  "#f97316"
];

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeCustomConstantType(value: unknown): CustomConstantType {
  const type = String(value || "").trim();
  return (CUSTOM_CONSTANT_TYPES as readonly string[]).includes(type) ? (type as CustomConstantType) : "string";
}

export function normalizeCustomConstantId(value: unknown, fallback = ""): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_$-]+/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

export function normalizeCustomConstantValue(value: unknown, type: CustomConstantType): CustomConstantValue {
  if (type === "int") {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) ? clampNumber(number, -999999, 999999) : 0;
  }
  if (type === "float") {
    const number = Number(value);
    return Number.isFinite(number) ? clampNumber(Number(number.toFixed(4)), -999999, 999999) : 0;
  }
  if (type === "bool") return value === true || String(value).toLowerCase() === "true";
  if (type === "list") {
    const incoming = Array.isArray(value) ? value : String(value || "").split(/\r?\n|,/);
    return incoming
      .map((item) => String(item || "").trim().replace(/\s+/g, " ").slice(0, 120))
      .filter(Boolean)
      .slice(0, 100);
  }
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 240);
}

export function normalizeCustomConstants(constants: Partial<GameConstants> = {}): CustomConstant[] {
  const sourceList = Array.isArray(constants.customConstants) ? constants.customConstants : [];
  const usedIds = new Set(RESERVED_CONSTANT_IDS.map((id) => id.toLowerCase()));
  const isUsedId = (id: string) => usedIds.has(String(id || "").toLowerCase());
  const reserveId = (id: string) => usedIds.add(String(id || "").toLowerCase());
  return sourceList.map((raw, index) => {
    const constant = (raw || {}) as Record<string, unknown>;
    const type = normalizeCustomConstantType(constant.type);
    const fallbackId = `customConstant${index + 1}`;
    let id = normalizeCustomConstantId(constant.id || constant.name, fallbackId);
    if (isUsedId(id)) id = fallbackId;
    const baseId = id || fallbackId;
    let suffix = 2;
    while (isUsedId(id)) {
      id = `${baseId}${suffix}`;
      suffix += 1;
    }
    reserveId(id);
    return {
      id,
      name: String(constant.name || id || fallbackId).trim().replace(/\s+/g, " ").slice(0, 80) || id,
      type,
      value: normalizeCustomConstantValue(constant.value, type)
    };
  });
}

export function applyCustomConstantsToObject<T extends Record<string, unknown>>(
  target: T,
  customConstants: CustomConstant[]
): T {
  for (const constant of customConstants || []) (target as Record<string, unknown>)[constant.id] = constant.value;
  return target;
}

function normalizeColor(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function normalizeGameConstants(constants: Partial<GameConstants> = {}): NormalizedGameConstants {
  const colors = Array.isArray(constants.playerColors)
    ? constants.playerColors.map(normalizeColor).filter(Boolean)
    : [];
  const customConstants = normalizeCustomConstants(constants);
  const normalized: NormalizedGameConstants = {
    playerColors: colors.length ? colors : [...DEFAULT_PLAYER_COLORS],
    craftingTimerDuration: clampNumber(Number(constants.craftingTimerDuration || 30), 1, 3600),
    startGameCountdownDuration: clampNumber(Number(constants.startGameCountdownDuration || 1), 1, 60),
    pointsForCorrectAnswer: clampNumber(Math.floor(Number(constants.pointsForCorrectAnswer ?? 200)), 0, 999999),
    gameTitle: String(constants.gameTitle || "Party Game Template").trim().slice(0, 80) || "Party Game Template",
    numberOfRounds: clampNumber(Math.floor(Number(constants.numberOfRounds || 3)), 1, 99),
    randomChanceTest: clampNumber(Number(constants.randomChanceTest ?? 0.5), 0, 1),
    speechToTextSendInputBuffer: clampNumber(Number(constants.speechToTextSendInputBuffer ?? 1), 0, 10),
    overrideFirstGameOfSession: constants.overrideFirstGameOfSession === true,
    customConstants
  };
  applyCustomConstantsToObject(normalized as unknown as Record<string, unknown>, customConstants);
  return normalized;
}

/** Stable snapshot string for dirty tracking (matches legacy JSON.stringify(gameConstants)). */
export function constantsSnapshot(constants: Partial<GameConstants> | null | undefined): string {
  return JSON.stringify(normalizeGameConstants(constants || {}));
}
