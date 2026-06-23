const { normalizeColor: normalizeSharedColor } = require("../shared/color-utils");

function normalizeStageCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizePlayerId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

function cleanPlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function normalizeFlowId(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

function cleanFlowText(value, fallback = "") {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ").slice(0, 240);
  return cleaned || fallback;
}

function cleanChoiceOptions(value) {
  const incoming = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const options = incoming
    .map((item) => String(item || "").trim().replace(/\s+/g, " ").slice(0, 80))
    .filter(Boolean)
    .slice(0, 12);
  return options.length ? options : ["A", "B", "C", "D"];
}

function normalizeFlowVariableName(value, fallback = "multipleChoicePrompt") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.$-]+/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizePlayerFilter(value) {
  const cleaned = String(value || "").trim();
  return ["all", "correct", "wrong", "votingWinner", "votingLosers"].includes(cleaned) ? cleaned : "all";
}

function normalizeVotingCardFilter(value) {
  const cleaned = String(value || "").trim();
  if (cleaned === "correct") return "winners";
  if (cleaned === "wrong") return "losers";
  return ["all", "winners", "losers"].includes(cleaned) ? cleaned : "all";
}

function normalizeChoiceInputMode(value) {
  const mode = String(value || "").trim();
  return ["singleSelect", "submitOnce", "continuous"].includes(mode) ? mode : "singleSelect";
}

function cleanSubmittedText(value, limit = 240) {
  const maxLength = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 240)));
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, maxLength);
}

function normalizeCharacterLimit(value) {
  const limit = Math.floor(Number(value || 0));
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(1, Math.min(1000, limit));
}

function normalizeColor(value) {
  return normalizeSharedColor(value);
}

function normalizeDurationSeconds(value, fallback = 30) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(1, Math.min(3600, number)).toFixed(2));
}

function normalizeConstantString(value, fallback, maxLength = 80) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return cleaned || fallback;
}

function normalizeConstantInteger(value, fallback, min = 0, max = 9999) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeConstantFloat(value, fallback, min = -999999, max = 999999) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Number(number.toFixed(4))));
}

function normalizeLayoutNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(min, Math.min(max, number)).toFixed(3));
}

function cleanLayoutSelector(value) {
  return String(value || "").trim().replace(/[\n\r]/g, "").slice(0, 120);
}

function cleanLayoutText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, 500);
}

module.exports = {
  cleanChoiceOptions,
  cleanFlowText,
  cleanLayoutSelector,
  cleanLayoutText,
  cleanPlayerName,
  cleanSubmittedText,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeColor,
  normalizeConstantFloat,
  normalizeConstantInteger,
  normalizeConstantString,
  normalizeDurationSeconds,
  normalizeFlowId,
  normalizeFlowVariableName,
  normalizeLayoutNumber,
  normalizePlayerFilter,
  normalizePlayerId,
  normalizeStageCode,
  normalizeVotingCardFilter
};
