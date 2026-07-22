"use strict";

function createRuntimeFault(room, details = {}) {
  if (room.runtimeFault) return room.runtimeFault;
  const stateId = String(details.stateId || room.flowStateId || room.phase || "");
  const actionId = String(details.actionId || room.presentedAction?.id || "");
  room.runtimeFault = {
    id: `${Number(room.gameSessionId || 0)}:${Number(room.momentVisitId || 0)}:${String(details.code || "RUNTIME_FAULT")}`,
    code: String(details.code || "RUNTIME_FAULT"),
    message: String(details.message || "The game cannot continue because required runtime data is invalid."),
    gameSessionId: Number(room.gameSessionId || 0),
    momentVisitId: Number(room.momentVisitId || 0),
    stateId,
    actionId,
    expected: String(details.expected || ""),
    actual: String(details.actual || ""),
    sourceRef: details.sourceRef && typeof details.sourceRef === "object" ? { ...details.sourceRef } : null,
    createdAt: Date.now()
  };
  return room.runtimeFault;
}

function clearRuntimeFault(room) {
  room.runtimeFault = null;
}

module.exports = { clearRuntimeFault, createRuntimeFault };
