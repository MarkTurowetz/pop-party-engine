// Dual-use (server require + client global) custom game-constants schema/normalizers.
// Built to shared/game-constants-schema.js via `npm run build:shared` (committed output).

(function (root: Record<string, unknown>, factory: () => unknown): void {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PartyGameConstantsSchema = api;
  }
})((typeof globalThis !== "undefined" ? globalThis : window) as unknown as Record<string, unknown>, function () {
  "use strict";

  interface CustomConstant {
    id: string;
    name: string;
    type: string;
    value: unknown;
  }

  const CUSTOM_CONSTANT_TYPES = ["int", "float", "string", "bool", "list"];
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

  function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeCustomConstantId(value: unknown, fallback = ""): string {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_$-]+/g, "")
      .slice(0, 48);
    return cleaned || fallback;
  }

  function normalizeCustomConstantType(value: unknown): string {
    const type = String(value || "").trim();
    return CUSTOM_CONSTANT_TYPES.includes(type) ? type : "string";
  }

  function normalizeCustomConstantValue(value: unknown, type: string): unknown {
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
        .map((item: unknown) => String(item || "").trim().replace(/\s+/g, " ").slice(0, 120))
        .filter(Boolean)
        .slice(0, 100);
    }
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 240);
  }

  function normalizeCustomConstants(constants: { customConstants?: unknown } = {}): CustomConstant[] {
    const sourceList = Array.isArray(constants.customConstants) ? constants.customConstants : [];
    const usedIds = new Set(RESERVED_CONSTANT_IDS.map((id) => id.toLowerCase()));
    const isUsedId = (id: unknown): boolean => usedIds.has(String(id || "").toLowerCase());
    const reserveId = (id: unknown): Set<string> => usedIds.add(String(id || "").toLowerCase());
    return sourceList.map((constant: { type?: unknown; id?: unknown; name?: unknown; value?: unknown }, index: number) => {
      const type = normalizeCustomConstantType(constant?.type);
      const fallbackId = `customConstant${index + 1}`;
      let id = normalizeCustomConstantId(constant?.id || constant?.name, fallbackId);
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
        name: String(constant?.name || id || fallbackId).trim().replace(/\s+/g, " ").slice(0, 80) || id,
        type,
        value: normalizeCustomConstantValue(constant?.value, type)
      };
    });
  }

  function applyCustomConstantsToObject(target: Record<string, unknown> | null | undefined, customConstants: CustomConstant[] | null | undefined): Record<string, unknown> {
    const output = target || {};
    for (const constant of customConstants || []) output[constant.id] = constant.value;
    return output;
  }

  return {
    CUSTOM_CONSTANT_TYPES,
    RESERVED_CONSTANT_IDS,
    applyCustomConstantsToObject,
    normalizeCustomConstantId,
    normalizeCustomConstants,
    normalizeCustomConstantType,
    normalizeCustomConstantValue
  };
});
