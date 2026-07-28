export type ControllerSubmitJson = unknown;

export interface ControllerSubmitState {
  lobby?: Record<string, unknown>;
  playerId?: string;
  player?: Record<string, unknown>;
  stageCode?: string;
}

export interface ControllerSubmitApiOptions {
  getControllerState: () => ControllerSubmitState | null | undefined;
  postJson: (url: string, body: Record<string, unknown>) => Promise<ControllerSubmitJson>;
}

export interface ControllerSubmitApi {
  heartbeat(): Promise<ControllerSubmitJson>;
  grantMicrophoneAccess(actionId: string): Promise<ControllerSubmitJson>;
  inputEvent(actionId: string, eventType: string): Promise<ControllerSubmitJson>;
  join(stageCode: string, playerName: string, playerId: string): Promise<ControllerSubmitJson>;
  saveTextDraft(actionId: string, text: string, draftSequence: number): Promise<ControllerSubmitJson>;
  submitChoice(actionId: string, optionIndex: number, cardId?: string): Promise<ControllerSubmitJson>;
  submitText(actionId: string, text: string): Promise<ControllerSubmitJson>;
  startOrCancelGame(options?: { isCancel?: boolean; startToken?: string }): Promise<ControllerSubmitJson>;
  updateAvatar(shape: string): Promise<ControllerSubmitJson>;
}

export function createControllerSubmitApi(options: ControllerSubmitApiOptions): ControllerSubmitApi;
