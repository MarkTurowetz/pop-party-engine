"use strict";

function submittedText(player) {
  const answer = player.answer;
  if (answer?.done !== true) return "";
  return String(answer.text || "").trim();
}

function resolveControllerSubmissionConfirmation(lobby, player) {
  const text = submittedText(player);
  if (!text) return null;
  const choiceInput = player.input || lobby.input || null;
  if (choiceInput?.actionId
    && String(choiceInput.type || "").trim().toLowerCase() !== "vote"
    && String(choiceInput.mode || "").trim().toLowerCase() === "submitonce") {
    return { actionId: String(choiceInput.actionId), kind: "choice", message: `You answered: ${text}` };
  }
  const textInput = lobby.textInput || null;
  const textInputType = String(textInput?.type || "").trim().toLowerCase();
  const textInputMode = String(textInput?.mode || "").trim().toLowerCase();
  if (textInput?.actionId && textInputType !== "voice" && textInputMode !== "voicevip") {
    return { actionId: String(textInput.actionId), kind: "writing", message: `You wrote: ${text}` };
  }
  return null;
}

module.exports = Object.freeze({ resolveControllerSubmissionConfirmation });
