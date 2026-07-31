"use strict";

const {
  evaluateCodeExpression,
  parseCodeLiteral
} = require("./dynamic-game-state-runtime");

const SUBROUTINE_VALUE_TYPES = Object.freeze([
  "string",
  "integer",
  "number",
  "boolean",
  "json"
]);
const unsafePathParts = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeSubroutineValueType(value) {
  const type = String(value || "").trim().toLowerCase();
  return SUBROUTINE_VALUE_TYPES.includes(type) ? type : "string";
}

function normalizeSubroutineVariableName(value, fallback) {
  const text = String(value || "").trim();
  const cleaned = text
    .replace(/^[^A-Za-z_$]+/, "")
    .replace(/[^A-Za-z0-9_$]+/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}

function uniqueName(value, fallback, used) {
  const base = normalizeSubroutineVariableName(value, fallback);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, Math.max(1, 64 - String(suffix).length))}${suffix}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function normalizeExpression(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 512);
}

function normalizeSubroutineInputs(values) {
  if (!Array.isArray(values)) return [];
  const used = new Set();
  return values.slice(0, 32).map((value, index) => {
    const name = uniqueName(value?.name, `input${index + 1}`, used);
    return {
      name,
      valueType: normalizeSubroutineValueType(value?.valueType),
      source: normalizeExpression(value?.source)
    };
  });
}

function normalizeSubroutineOutputs(values) {
  if (!Array.isArray(values)) return [];
  const used = new Set();
  return values.slice(0, 32).map((value, index) => {
    const name = uniqueName(value?.name, `output${index + 1}`, used);
    return {
      name,
      valueType: normalizeSubroutineValueType(value?.valueType)
    };
  });
}

function pathParts(path) {
  const text = String(path || "").trim();
  if (!/^[gGlL](?:\.[A-Za-z_$][\w$]*)+$/.test(text)) {
    throw new Error(`Expected a g.* or l.* path, received "${text}"`);
  }
  const parts = text.split(".").slice(1);
  if (parts.some((part) => unsafePathParts.has(part))) throw new Error(`Unsafe flow scope path: ${text}`);
  return { scope: text[0].toLowerCase(), parts };
}

function readScopePath(globals, locals, path) {
  const parsed = pathParts(path);
  let value = parsed.scope === "l" ? locals : globals;
  for (const part of parsed.parts) {
    if (value == null || !Object.prototype.hasOwnProperty.call(Object(value), part)) return undefined;
    value = value[part];
  }
  return value;
}

function writeScopePath(globals, locals, path, value) {
  const parsed = pathParts(path);
  let target = parsed.scope === "l" ? locals : globals;
  for (const part of parsed.parts.slice(0, -1)) {
    if (!isPlainObject(target[part])) target[part] = {};
    target = target[part];
  }
  target[parsed.parts.at(-1)] = cloneJson(value, null);
}

function evaluateSubroutineValue(room, expression, locals = room?.localVariables || {}) {
  const text = String(expression || "").trim();
  if (!text) return undefined;
  const globals = isPlainObject(room?.G) ? room.G : {};
  const localScope = isPlainObject(locals) ? locals : {};
  if (/^[gGlL](?:\.[A-Za-z_$][\w$]*)+$/.test(text)) {
    return cloneJson(readScopePath(globals, localScope, text), undefined);
  }
  const looksLikeExpression = /^[gGlL](?:\.|$)/.test(text)
    || /[+\-*/%()]/.test(text)
    || /^(?:true|false|null|-?\d)/i.test(text)
    || text.startsWith("\"")
    || text.startsWith("'");
  return looksLikeExpression
    ? cloneJson(evaluateCodeExpression(globals, text, localScope), undefined)
    : cloneJson(parseCodeLiteral(text), undefined);
}

function coerceSubroutineValue(value, valueType, label = "value") {
  const type = normalizeSubroutineValueType(valueType);
  if (type === "string") return value == null ? "" : String(value);
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === 1 || String(value).toLowerCase() === "true") return true;
    if (value === 0 || String(value).toLowerCase() === "false") return false;
    throw new Error(`${label} must be a boolean`);
  }
  if (type === "integer") {
    const number = Number(value);
    if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
    return number;
  }
  if (type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number`);
    return number;
  }
  const cloned = cloneJson(value, undefined);
  if (cloned === undefined) throw new Error(`${label} must be JSON-safe`);
  return cloned;
}

function defaultSubroutineValue(valueType) {
  const type = normalizeSubroutineValueType(valueType);
  if (type === "string") return "";
  if (type === "boolean") return false;
  if (type === "integer" || type === "number") return 0;
  return null;
}

function createSubroutineLocalScope(room, action) {
  const callerLocals = isPlainObject(room?.localVariables) ? room.localVariables : {};
  const locals = {};
  for (const input of normalizeSubroutineInputs(action?.inputs)) {
    const rawValue = input.source
      ? evaluateSubroutineValue(room, input.source, callerLocals)
      : defaultSubroutineValue(input.valueType);
    locals[input.name] = coerceSubroutineValue(rawValue, input.valueType, `Input "${input.name}"`);
  }
  return locals;
}

function applySubroutineOutputs(room, action, calleeLocals, callerLocals) {
  const locals = isPlainObject(callerLocals) ? callerLocals : {};
  const childLocals = isPlainObject(calleeLocals) ? calleeLocals : {};
  for (const output of normalizeSubroutineOutputs(action?.outputs)) {
    if (!Object.prototype.hasOwnProperty.call(childLocals, output.name)) {
      throw new Error(`Output "${output.name}" was not assigned in the child subroutine`);
    }
    const rawValue = cloneJson(childLocals[output.name], undefined);
    if (rawValue === undefined) {
      throw new Error(`Output "${output.name}" must be assigned a JSON-safe value`);
    }
    const value = coerceSubroutineValue(rawValue, output.valueType, `Output "${output.name}"`);
    locals[output.name] = cloneJson(value, null);
  }
  return locals;
}

module.exports = Object.freeze({
  SUBROUTINE_VALUE_TYPES,
  applySubroutineOutputs,
  coerceSubroutineValue,
  createSubroutineLocalScope,
  evaluateSubroutineValue,
  normalizeSubroutineInputs,
  normalizeSubroutineOutputs,
  normalizeSubroutineValueType,
  normalizeSubroutineVariableName,
  readScopePath,
  writeScopePath
});
