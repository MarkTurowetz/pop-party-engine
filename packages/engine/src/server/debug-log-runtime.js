"use strict";

const {
  evaluateSubroutineValue,
  readScopePath
} = require("./subroutine-interface-runtime");

const MAX_DEBUG_VALUE_LENGTH = 2000;

function formatDebugValue(value) {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return `${value}n`;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function applyLogValueAction(room, action) {
  const expression = String(action?.value || "l.value").trim() || "l.value";
  let valueText = "";
  let error = "";
  try {
    const value = /^[gGlL](?:\.[A-Za-z_$][\w$]*)+$/.test(expression)
      ? readScopePath(room?.G || {}, room?.localVariables || {}, expression)
      : evaluateSubroutineValue(room, expression, room?.localVariables);
    valueText = formatDebugValue(
      value
    );
  } catch (evaluationError) {
    error = String(evaluationError?.message || evaluationError || "Unknown evaluation error");
    valueText = `[evaluation error: ${error}]`;
  }
  const sequence = Math.max(0, Number(room?.debugLogSequence || 0)) + 1;
  room.debugLogSequence = sequence;
  room.debugLog = {
    actionId: String(action?.id || ""),
    expression,
    valueText: valueText.slice(0, MAX_DEBUG_VALUE_LENGTH),
    message: `${expression} = ${valueText}`.slice(0, MAX_DEBUG_VALUE_LENGTH),
    sequence,
    error
  };
  return room.debugLog;
}

module.exports = Object.freeze({
  MAX_DEBUG_VALUE_LENGTH,
  applyLogValueAction,
  formatDebugValue
});
