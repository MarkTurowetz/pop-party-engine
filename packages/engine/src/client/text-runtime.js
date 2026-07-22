"use strict";

const ALLOWED_TAG = /<\/?(?:br|strong|b|em|i|u|s|sub|sup)\s*\/?>/gi;
const ALLOWED_TOKEN = /(<\/?(?:br|strong|b|em|i|u|s|sub|sup)\s*\/?>|&(?:#\d+|#x[\da-f]+|[a-z][\w]+);)/gi;
const gameTextDefaultFontFamily = 'ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif';
const gameTextFontOptions = Object.freeze([
  Object.freeze({ value: gameTextDefaultFontFamily, label: "Game UI" }),
  Object.freeze({ value: '"Avenir Next", Avenir, system-ui, sans-serif', label: "Avenir Next" }),
  Object.freeze({ value: '"Trebuchet MS", "Avenir Next", system-ui, sans-serif', label: "Trebuchet MS" }),
  Object.freeze({ value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', label: "Impact" }),
  Object.freeze({ value: 'Georgia, "Times New Roman", serif', label: "Georgia" }),
  Object.freeze({ value: '"Courier New", Courier, monospace', label: "Courier New" })
]);
const gameTextFontValues = new Set(gameTextFontOptions.map((option) => option.value));

function normalizeGameTextFontFamily(value, fallback = gameTextDefaultFontFamily) {
  const text = String(value || "").trim();
  if (gameTextFontValues.has(text)) return text;
  const fallbackText = String(fallback || "").trim();
  if (gameTextFontValues.has(fallbackText)) return fallbackText;
  return gameTextDefaultFontFamily;
}

function normalizedAllowedTag(tag) {
  const closing = /^<\//.test(tag);
  const name = tag.match(/^<\/?\s*([a-z]+)/i)?.[1]?.toLowerCase() || "";
  if (name === "br") return "<br />";
  return closing ? `</${name}>` : `<${name}>`;
}

function normalizeGameTextMarkup(value) {
  return String(value ?? "").replace(/\\n/g, "\n");
}

function transformGameTextMarkup(value, transform) {
  const text = normalizeGameTextMarkup(value);
  if (!transform || transform === "none") return text;
  return text
    .split(ALLOWED_TOKEN)
    .map((part) => {
      if (!part || /^<|^&/.test(part)) return part;
      if (transform === "uppercase") return part.toUpperCase();
      if (transform === "lowercase") return part.toLowerCase();
      if (transform === "capitalize") return part.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
      return part;
    })
    .join("");
}

function decodeEntity(entity) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  const body = entity.slice(1, -1);
  if (body[0] === "#") {
    const hexadecimal = body[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (Number.isFinite(codePoint)) {
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }
  }
  return named[body.toLowerCase()] || entity;
}

function gameTextPlainText(value) {
  return normalizeGameTextMarkup(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(ALLOWED_TAG, "")
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\w]+);/gi, decodeEntity);
}

function gameTextHtml(value) {
  const tokens = [];
  const tokenized = normalizeGameTextMarkup(value).replace(ALLOWED_TOKEN, (token) => {
    tokens.push(token.startsWith("<") ? normalizedAllowedTag(token) : token);
    return `\ue000${tokens.length - 1}\ue001`;
  });
  return tokenized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br />")
    .replace(/\ue000(\d+)\ue001/g, (_match, index) => tokens[Number(index)] || "");
}

function setGameTextHtml(target, value) {
  if (!target || typeof target !== "object") throw new Error("Game text target is required");
  const html = gameTextHtml(value);
  if (target.innerHTML !== html) target.innerHTML = html;
  if (!target.ownerDocument) target.textContent = gameTextPlainText(value);
}

module.exports = Object.freeze({
  gameTextDefaultFontFamily,
  gameTextFontOptions,
  gameTextHtml,
  gameTextPlainText,
  normalizeGameTextFontFamily,
  normalizeGameTextMarkup,
  setGameTextHtml,
  transformGameTextMarkup
});
