"use strict";

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function parseCodeLiteral(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  if (/^true$/i.test(text)) return true;
  if (/^false$/i.test(text)) return false;
  if (/^null$/i.test(text)) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    const body = text.slice(1, -1);
    return text.startsWith("\"")
      ? JSON.parse(text)
      : body.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    return JSON.parse(text);
  }
  return text;
}

function splitStatements(code) {
  return String(code || "")
    .split(/[\n;]/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function applyDynamicGameStateCode(room, code) {
  if (!room) return { statements: 0, applied: 0, errors: [] };
  const statements = splitStatements(code);
  const errors = [];
  room.G = isPlainObject(room.G) ? room.G : {};
  let applied = 0;

  for (const statement of statements) {
    const assignment = statement.match(/^([gG](?:\.[A-Za-z_$][\w$]*)*)\s*=\s*(.+)$/);
    if (!assignment) {
      errors.push(`Unsupported statement: ${statement}`);
      continue;
    }

    const [, rawPath, rawValue] = assignment;
    if (/^[gG]$/.test(rawPath)) {
      try {
        const value = parseCodeLiteral(rawValue);
        room.G = isPlainObject(value) ? value : {};
        applied += 1;
      } catch (error) {
        errors.push(`Could not parse value for ${rawPath}: ${error.message}`);
      }
      continue;
    }

    const pathParts = rawPath.split(".").slice(1);
    if (!pathParts.length) {
      errors.push(`Missing G path: ${statement}`);
      continue;
    }

    try {
      let target = room.G;
      for (const part of pathParts.slice(0, -1)) {
        if (!isPlainObject(target[part])) target[part] = {};
        target = target[part];
      }
      target[pathParts[pathParts.length - 1]] = parseCodeLiteral(rawValue);
      applied += 1;
    } catch (error) {
      errors.push(`Could not apply ${rawPath}: ${error.message}`);
    }
  }

  room.lastCodeNodeResult = {
    statements: statements.length,
    applied,
    errors,
    evaluatedAt: Date.now()
  };
  return room.lastCodeNodeResult;
}

module.exports = {
  applyDynamicGameStateCode,
  parseCodeLiteral,
  splitStatements
};
