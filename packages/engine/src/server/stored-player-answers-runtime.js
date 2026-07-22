"use strict";

function currentAnswerStateId(room) {
  return String(room?.flowStateId || room?.phase || "").trim();
}

function canStoreAnswersForState(stateId) {
  return Boolean(stateId) && stateId !== "lobby" && stateId !== "starting";
}

function answerOutputKey(stateId, visitId) {
  return `${String(stateId || "").trim()}@${Math.max(0, Number(visitId || 0))}`;
}

function ensureSessionOutputs(room) {
  const sessionId = Number(room.gameSessionId || 0);
  if (!room.sessionOutputs || Number(room.sessionOutputs.sessionId) !== sessionId) {
    room.sessionOutputs = { sessionId, byVisit: {}, latestByState: {} };
  }
  return room.sessionOutputs;
}

function sessionAnswerOutput(room, stateId, visitId, { create = false } = {}) {
  if (!canStoreAnswersForState(stateId)) return null;
  const outputs = create ? ensureSessionOutputs(room) : room.sessionOutputs;
  if (!outputs || Number(outputs.sessionId) !== Number(room.gameSessionId || 0)) return null;
  const key = answerOutputKey(stateId, visitId);
  if (!outputs.byVisit[key] && create) {
    outputs.byVisit[key] = {
      type: "playerAnswers",
      sessionId: Number(room.gameSessionId || 0),
      stateId: String(stateId),
      visitId: Math.max(0, Number(visitId || 0)),
      records: {}
    };
    outputs.latestByState[stateId] = key;
  }
  return outputs.byVisit[key] || null;
}

function resolveSessionAnswerOutput(room, sourceRef = {}) {
  if (Number(sourceRef.sessionId) !== Number(room.gameSessionId || 0)) return null;
  return sessionAnswerOutput(room, sourceRef.stateId, sourceRef.visitId) || null;
}

function latestSessionAnswerOutput(room, stateId) {
  const outputs = room.sessionOutputs;
  if (!outputs || Number(outputs.sessionId) !== Number(room.gameSessionId || 0)) return null;
  const key = outputs.latestByState?.[stateId];
  return key ? outputs.byVisit?.[key] || null : null;
}

function storedAnswerBucket(room, stateId = currentAnswerStateId(room)) {
  if (!canStoreAnswersForState(stateId)) return null;
  room.storedPlayerAnswers = room.storedPlayerAnswers || {};
  const round = room.currentRound || 1;
  room.storedPlayerAnswers[round] = room.storedPlayerAnswers[round] || {};
  room.storedPlayerAnswers[round][stateId] = room.storedPlayerAnswers[round][stateId] || {};
  return room.storedPlayerAnswers[round][stateId];
}

function storePlayerAnswerRecord(
  room,
  playerId,
  record,
  stateId = currentAnswerStateId(room),
  visitId = Number(room?.momentVisitId || 0)
) {
  const bucket = storedAnswerBucket(room, stateId);
  const id = String(playerId || "").trim();
  if (!bucket || !id || record == null) return false;
  const storedRecord = record && typeof record === "object" ? { ...record } : record;
  bucket[id] = storedRecord;
  const output = sessionAnswerOutput(room, stateId, visitId, { create: true });
  output.records[id] = storedRecord;
  return true;
}

function deletePlayerAnswerRecord(
  room,
  playerId,
  stateId = currentAnswerStateId(room),
  visitId = Number(room?.momentVisitId || 0)
) {
  const id = String(playerId || "").trim();
  if (!id || !canStoreAnswersForState(stateId)) return false;
  const round = room.currentRound || 1;
  const bucket = room.storedPlayerAnswers?.[round]?.[stateId];
  if (bucket) delete bucket[id];
  const output = sessionAnswerOutput(room, stateId, visitId);
  if (output?.records) delete output.records[id];
  return true;
}

function storeCurrentMomentAnswers(
  room,
  stateId = currentAnswerStateId(room),
  visitId = Number(room?.momentVisitId || 0)
) {
  const records = room?.playerAnswerRecords || {};
  if (!canStoreAnswersForState(stateId) || !Object.keys(records).length) return false;
  const bucket = storedAnswerBucket(room, stateId);
  const output = sessionAnswerOutput(room, stateId, visitId, { create: true });
  for (const [playerId, record] of Object.entries(records)) {
    const storedRecord = record && typeof record === "object" ? { ...record } : record;
    bucket[playerId] = storedRecord;
    output.records[playerId] = storedRecord;
  }
  return true;
}

module.exports = {
  answerOutputKey,
  currentAnswerStateId,
  deletePlayerAnswerRecord,
  latestSessionAnswerOutput,
  resolveSessionAnswerOutput,
  sessionAnswerOutput,
  storeCurrentMomentAnswers,
  storePlayerAnswerRecord
};
