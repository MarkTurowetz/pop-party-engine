// Typed port of the legacy client/controller-submit-api.js IIFE. Installs
// window.createControllerSubmitApi for the legacy controller runtime.

type Json = unknown;

interface ControllerState {
  lobby?: Record<string, unknown>;
  playerId?: string;
  player?: Record<string, unknown>;
  stageCode?: string;
}

export interface ControllerSubmitApiOptions {
  getControllerState: () => ControllerState | null | undefined;
  postJson: (url: string, body: Record<string, unknown>) => Promise<Json>;
}

export interface ControllerSubmitApi {
  heartbeat(): Promise<Json>;
  grantMicrophoneAccess(actionId: string): Promise<Json>;
  inputEvent(actionId: string, eventType: string): Promise<Json>;
  join(stageCode: string, playerName: string, playerId: string): Promise<Json>;
  submitChoice(actionId: string, optionIndex: number, cardId?: string): Promise<Json>;
  submitText(actionId: string, text: string): Promise<Json>;
  startOrCancelGame(options?: { isCancel?: boolean; startToken?: string }): Promise<Json>;
  updateAvatar(shape: string): Promise<Json>;
}

export function createControllerSubmitApi(options: ControllerSubmitApiOptions): ControllerSubmitApi {
  const { getControllerState, postJson } = options;

  function payloadBase(): { gameSessionId: number; playerId?: string; stageCode?: string } | null {
    const state = getControllerState();
    if (!state) return null;
    return {
      gameSessionId: Number(state.lobby?.gameSessionId || 0),
      playerId: state.playerId,
      stageCode: state.stageCode
    };
  }

  function inputVisitId(actionId: string): number {
    const state = getControllerState();
    const lobby = state?.lobby;
    const playerInput = state?.player?.input as Record<string, unknown> | undefined;
    const candidates = [lobby?.textInput, lobby?.microphoneAccess, playerInput, lobby?.input] as Array<Record<string, unknown> | undefined>;
    const input = candidates.find((candidate) => String(candidate?.actionId || "") === actionId);
    return Number(input?.visitId || 0);
  }

  function join(stageCode: string, playerName: string, playerId: string): Promise<Json> {
    return postJson("/api/join", { stageCode, playerName, playerId });
  }

  function heartbeat(): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/heartbeat", base);
  }

  function submitChoice(actionId: string, optionIndex: number, cardId = ""): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-choice", { ...base, actionId, cardId, inputVisitId: inputVisitId(actionId), optionIndex });
  }

  function submitText(actionId: string, text: string): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-text-submit", { ...base, actionId, inputVisitId: inputVisitId(actionId), text });
  }

  function grantMicrophoneAccess(actionId: string): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-microphone-access", { ...base, actionId, inputVisitId: inputVisitId(actionId) });
  }

  function inputEvent(actionId: string, eventType: string): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/input-event", { ...base, actionId, eventType });
  }

  function startOrCancelGame({ isCancel = false, startToken = "" }: { isCancel?: boolean; startToken?: string } = {}): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson(isCancel ? "/api/cancel-start" : "/api/start", { ...base, startToken });
  }

  function updateAvatar(shape: string): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/avatar", { ...base, shape });
  }

  return {
    heartbeat,
    grantMicrophoneAccess,
    inputEvent,
    join,
    submitChoice,
    submitText,
    startOrCancelGame,
    updateAvatar
  };
}

declare global {
  interface Window {
    createControllerSubmitApi?: typeof createControllerSubmitApi;
  }
}

export function installControllerSubmitApiGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerSubmitApi = createControllerSubmitApi;
}

installControllerSubmitApiGlobals(typeof window !== "undefined" ? window : globalThis);
