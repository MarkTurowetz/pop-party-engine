"use strict";

const FORBIDDEN_SVG_PATTERNS = Object.freeze([
  { code: "SCRIPT", pattern: /<\s*script\b/i },
  { code: "EVENT_HANDLER", pattern: /\son[a-z]+\s*=/i },
  { code: "JAVASCRIPT_URL", pattern: /javascript\s*:/i },
  { code: "FOREIGN_OBJECT", pattern: /<\s*foreignObject\b/i },
  { code: "EXTERNAL_REFERENCE", pattern: /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/)/i },
  { code: "EXTERNAL_CSS", pattern: /@import\s+|url\(\s*["']?\s*(?:https?:|\/\/)/i },
  { code: "XML_ENTITY", pattern: /<!ENTITY\b/i }
]);

function assertSafeSvg(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes || "");
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text)) throw new Error("SVG root element is missing");
  for (const forbidden of FORBIDDEN_SVG_PATTERNS) {
    if (forbidden.pattern.test(text)) throw new Error(`SVG contains unsafe ${forbidden.code.toLowerCase().replaceAll("_", " ")}`);
  }
  return bytes;
}

function svgResponseHeaders() {
  return {
    "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin"
  };
}

module.exports = { FORBIDDEN_SVG_PATTERNS, assertSafeSvg, svgResponseHeaders };
