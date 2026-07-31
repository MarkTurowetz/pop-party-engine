"use strict";

function controllerViewVisitKey(lobby, player, phase) {
  const gameSessionId = Number(lobby?.gameSessionId || 0);
  const candidates = [
    lobby?.gamePlugin?.input,
    lobby?.microphoneAccess,
    lobby?.textInput,
    player?.input,
    lobby?.input
  ];
  const activeInput = candidates.find((input) => Boolean(input?.actionId && input?.visitId));
  if (activeInput) return `game:${gameSessionId}:input:${String(activeInput.actionId)}:${Number(activeInput.visitId)}`;
  const momentVisitId = Number(lobby?.momentVisitId || 0);
  const action = lobby?.action;
  return `game:${gameSessionId}:moment:${momentVisitId}:action:${String(action?.id || phase || "lobby")}`;
}

module.exports = Object.freeze({ controllerViewVisitKey });
