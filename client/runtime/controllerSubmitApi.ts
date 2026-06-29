// Typed port of the legacy client/controller-submit-api.js IIFE. Installs
// window.createControllerSubmitApi for the legacy controller runtime.

type Json = unknown;

interface ControllerState {
  playerId?: string;
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
  presentIntro(options?: { startToken?: string }): Promise<Json>;
  previewText(actionId: string, text: string): Promise<Json>;
  submitChoice(actionId: string, optionIndex: number, cardId?: string): Promise<Json>;
  submitText(actionId: string, text: string): Promise<Json>;
  startOrCancelGame(options?: { isCancel?: boolean; startToken?: string }): Promise<Json>;
  updateAvatar(shape: string): Promise<Json>;
}

export function createControllerSubmitApi(options: ControllerSubmitApiOptions): ControllerSubmitApi {
  const { getControllerState, postJson } = options;

  function payloadBase(): { playerId?: string; stageCode?: string } | null {
    const state = getControllerState();
    if (!state) return null;
    return { playerId: state.playerId, stageCode: state.stageCode };
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
    return postJson("/api/controller-choice", { ...base, actionId, cardId, optionIndex });
  }

  function submitText(actionId: string, text: string): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-text-submit", { ...base, actionId, text });
  }

  function previewText(actionId: string, text: string): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-text-preview", { ...base, actionId, text });
  }

  function grantMicrophoneAccess(actionId: string): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-microphone-access", { ...base, actionId });
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

  function presentIntro({ startToken = "" }: { startToken?: string } = {}): Promise<Json> {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/present-hi", { ...base, startToken });
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
    presentIntro,
    previewText,
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
