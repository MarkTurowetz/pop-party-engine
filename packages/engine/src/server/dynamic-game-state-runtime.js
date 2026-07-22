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
  const statements = [];
  let statement = "";
  let quote = "";
  let escaped = false;
  let depth = 0;
  for (const character of String(code || "")) {
    if (quote) {
      statement += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      statement += character;
      continue;
    }
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth = Math.max(0, depth - 1);
    if ((character === ";" || character === "\n") && depth === 0) {
      if (statement.trim()) statements.push(statement.trim());
      statement = "";
      continue;
    }
    statement += character;
  }
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

const unsafePathParts = new Set(["__proto__", "prototype", "constructor"]);

function gameStatePathParts(rawPath) {
  const path = String(rawPath || "").trim();
  if (!/^[gG](?:\.[A-Za-z_$][\w$]*)*$/.test(path)) throw new Error(`Invalid G path: ${path}`);
  const parts = path.split(".").slice(1);
  if (parts.some((part) => unsafePathParts.has(part))) throw new Error(`Unsafe G path: ${path}`);
  return parts;
}

function gameStatePathValue(root, rawPath) {
  let value = root;
  for (const part of gameStatePathParts(rawPath)) {
    if (value == null || !Object.prototype.hasOwnProperty.call(Object(value), part)) return undefined;
    value = value[part];
  }
  return value;
}

function setGameStatePathValue(root, rawPath, value) {
  const parts = gameStatePathParts(rawPath);
  if (!parts.length) throw new Error("Assign the G root with a plain object");
  let target = root;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(target[part])) target[part] = {};
    target = target[part];
  }
  target[parts[parts.length - 1]] = value;
}

function tokenizeCodeExpression(expression) {
  const text = String(expression || "");
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    if (/\s/.test(text[index])) {
      index += 1;
      continue;
    }
    const rest = text.slice(index);
    const numberMatch = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      tokens.push({ type: "value", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }
    const quote = text[index];
    if (quote === "\"" || quote === "'") {
      let value = "";
      let closed = false;
      index += 1;
      while (index < text.length) {
        const character = text[index];
        index += 1;
        if (character === quote) {
          closed = true;
          break;
        }
        if (character !== "\\") {
          value += character;
          continue;
        }
        if (index >= text.length) break;
        const escaped = text[index];
        index += 1;
        value += escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped;
      }
      if (!closed) throw new Error("Unterminated string literal");
      tokens.push({ type: "value", value });
      continue;
    }
    const identifierMatch = rest.match(/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/);
    if (identifierMatch) {
      const identifier = identifierMatch[0];
      if (/^true$/i.test(identifier)) tokens.push({ type: "value", value: true });
      else if (/^false$/i.test(identifier)) tokens.push({ type: "value", value: false });
      else if (/^null$/i.test(identifier)) tokens.push({ type: "value", value: null });
      else if (/^[gG](?:\.|$)/.test(identifier)) tokens.push({ type: "path", value: identifier });
      else throw new Error(`Unsupported expression token: ${identifier}`);
      index += identifier.length;
      continue;
    }
    const operator = rest.startsWith("**") ? "**" : text[index];
    if (!["+", "-", "*", "/", "%", "**", "(", ")"].includes(operator)) {
      throw new Error(`Unsupported expression token: ${text[index]}`);
    }
    tokens.push({ type: operator === "(" || operator === ")" ? "paren" : "operator", value: operator });
    index += operator.length;
  }
  return tokens;
}

function numericOperand(value, operator) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${operator} requires numeric operands`);
  return number;
}

function applyArithmeticOperator(left, right, operator) {
  if (operator === "+" && (typeof left === "string" || typeof right === "string")) return String(left) + String(right);
  const leftNumber = numericOperand(left, operator);
  const rightNumber = numericOperand(right, operator);
  if (operator === "+") return leftNumber + rightNumber;
  if (operator === "-") return leftNumber - rightNumber;
  if (operator === "*") return leftNumber * rightNumber;
  if (operator === "/") return leftNumber / rightNumber;
  if (operator === "%") return leftNumber % rightNumber;
  if (operator === "**") return leftNumber ** rightNumber;
  throw new Error(`Unsupported arithmetic operator: ${operator}`);
}

function evaluateCodeExpression(root, expression) {
  const tokens = tokenizeCodeExpression(expression);
  let index = 0;
  const peek = () => tokens[index] || null;
  const take = () => tokens[index++] || null;

  const parsePrimary = () => {
    const token = take();
    if (!token) throw new Error("Expected a value");
    if (token.type === "value") return token.value;
    if (token.type === "path") {
      const value = gameStatePathValue(root, token.value);
      if (value === undefined) throw new Error(`Unknown G variable: ${token.value}`);
      return value;
    }
    if (token.type === "paren" && token.value === "(") {
      const value = parseAdditive();
      const close = take();
      if (close?.type !== "paren" || close.value !== ")") throw new Error("Expected closing parenthesis");
      return value;
    }
    throw new Error(`Expected a value, received ${token.value}`);
  };

  const parseUnary = () => {
    const token = peek();
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      take();
      const value = numericOperand(parseUnary(), token.value);
      return token.value === "-" ? -value : value;
    }
    return parsePrimary();
  };

  const parseExponent = () => {
    const left = parseUnary();
    if (peek()?.type === "operator" && peek().value === "**") {
      take();
      return applyArithmeticOperator(left, parseExponent(), "**");
    }
    return left;
  };

  const parseMultiplicative = () => {
    let value = parseExponent();
    while (peek()?.type === "operator" && ["*", "/", "%"].includes(peek().value)) {
      const operator = take().value;
      value = applyArithmeticOperator(value, parseExponent(), operator);
    }
    return value;
  };

  const parseAdditive = () => {
    let value = parseMultiplicative();
    while (peek()?.type === "operator" && ["+", "-"].includes(peek().value)) {
      const operator = take().value;
      value = applyArithmeticOperator(value, parseMultiplicative(), operator);
    }
    return value;
  };

  if (!tokens.length) return "";
  const value = parseAdditive();
  if (index !== tokens.length) throw new Error(`Unexpected expression token: ${tokens[index].value}`);
  return value;
}

function parseCodeValue(root, rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    return parseCodeLiteral(text);
  }
  const looksLikeExpression = /^[gG](?:\.|$)/.test(text) || /[+\-*/%()]/.test(text) || /^(?:true|false|null|-?\d)/i.test(text) || text.startsWith("\"") || text.startsWith("'");
  return looksLikeExpression ? evaluateCodeExpression(root, text) : parseCodeLiteral(text);
}

function applyDynamicGameStateCode(room, code) {
  if (!room) return { statements: 0, applied: 0, errors: [] };
  const statements = splitStatements(code);
  const errors = [];
  room.G = isPlainObject(room.G) ? room.G : {};
  let applied = 0;

  for (const statement of statements) {
    const update = statement.match(/^(?:([gG](?:\.[A-Za-z_$][\w$]*)*)\s*(\+\+|--)|(\+\+|--)\s*([gG](?:\.[A-Za-z_$][\w$]*)*))$/);
    if (update) {
      const rawPath = update[1] || update[4];
      const operator = update[2] || update[3];
      try {
        const current = gameStatePathValue(room.G, rawPath);
        if (current === undefined) throw new Error(`Unknown G variable: ${rawPath}`);
        setGameStatePathValue(room.G, rawPath, applyArithmeticOperator(current, 1, operator[0]));
        applied += 1;
      } catch (error) {
        errors.push(`Could not apply ${statement}: ${error.message}`);
      }
      continue;
    }

    const compoundAssignment = statement.match(/^([gG](?:\.[A-Za-z_$][\w$]*)*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
    if (compoundAssignment) {
      const [, rawPath, operator, rawValue] = compoundAssignment;
      try {
        const current = gameStatePathValue(room.G, rawPath);
        if (current === undefined) throw new Error(`Unknown G variable: ${rawPath}`);
        const right = parseCodeValue(room.G, rawValue);
        setGameStatePathValue(room.G, rawPath, applyArithmeticOperator(current, right, operator[0]));
        applied += 1;
      } catch (error) {
        errors.push(`Could not apply ${statement}: ${error.message}`);
      }
      continue;
    }

    const assignment = statement.match(/^([gG](?:\.[A-Za-z_$][\w$]*)*)\s*=\s*(.+)$/);
    if (!assignment) {
      errors.push(`Unsupported statement: ${statement}`);
      continue;
    }

    const [, rawPath, rawValue] = assignment;
    if (/^[gG]$/.test(rawPath)) {
      try {
        const value = parseCodeValue(room.G, rawValue);
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
      setGameStatePathValue(room.G, rawPath, parseCodeValue(room.G, rawValue));
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
  evaluateCodeExpression,
  parseCodeLiteral,
  splitStatements
};
