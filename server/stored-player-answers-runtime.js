"use strict";

function currentAnswerStateId(room) {
  return String(room?.flowStateId || room?.phase || "").trim();
}

function canStoreAnswersForState(stateId) {
  return Boolean(stateId) && stateId !== "lobby" && stateId !== "starting";
}

function storedAnswerBucket(room, stateId = currentAnswerStateId(room)) {
  if (!canStoreAnswersForState(stateId)) return null;
  room.storedPlayerAnswers = room.storedPlayerAnswers || {};
  const round = room.currentRound || 1;
  room.storedPlayerAnswers[round] = room.storedPlayerAnswers[round] || {};
  room.storedPlayerAnswers[round][stateId] = room.storedPlayerAnswers[round][stateId] || {};
  return room.storedPlayerAnswers[round][stateId];
}

function storePlayerAnswerRecord(room, playerId, record, stateId = currentAnswerStateId(room)) {
  const bucket = storedAnswerBucket(room, stateId);
  const id = String(playerId || "").trim();
  if (!bucket || !id || record == null) return false;
  bucket[id] = record && typeof record === "object" ? { ...record } : record;
  return true;
}

function storeCurrentMomentAnswers(room, stateId = currentAnswerStateId(room)) {
  const records = room?.playerAnswerRecords || {};
  if (!canStoreAnswersForState(stateId) || !Object.keys(records).length) return false;
  const bucket = storedAnswerBucket(room, stateId);
  for (const [playerId, record] of Object.entries(records)) {
    bucket[playerId] = record && typeof record === "object" ? { ...record } : record;
  }
  return true;
}

module.exports = {
  currentAnswerStateId,
  storeCurrentMomentAnswers,
  storePlayerAnswerRecord
};
