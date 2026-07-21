type Dict = Record<string, unknown>;

export function controllerViewVisitKey(lobby: Dict | null | undefined, player: Dict | null | undefined, phase: string): string {
  const gameSessionId = Number(lobby?.gameSessionId || 0);
  const candidates = [lobby?.microphoneAccess, lobby?.textInput, player?.input, lobby?.input] as Array<Dict | undefined>;
  const activeInput = candidates.find((input) => Boolean(input?.actionId && input?.visitId));
  if (activeInput) {
    return `game:${gameSessionId}:input:${String(activeInput.actionId)}:${Number(activeInput.visitId)}`;
  }
  const momentVisitId = Number(lobby?.momentVisitId || 0);
  const action = lobby?.action as Dict | undefined;
  return `game:${gameSessionId}:moment:${momentVisitId}:action:${String(action?.id || phase || "lobby")}`;
}
