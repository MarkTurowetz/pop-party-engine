export type ControllerStateRuntimeDictionary = Record<string, unknown>;

export interface ControllerStateRenderContext {
  lobby: ControllerStateRuntimeDictionary;
  me: ControllerStateRuntimeDictionary;
  phase: string;
}

export interface ControllerStateViewWithRender {
  render: (lobby: ControllerStateRuntimeDictionary, me: ControllerStateRuntimeDictionary) => boolean | number | null;
}

export interface ControllerStateRuntimeOptions {
  closeAvatarPicker: (options: { commit: boolean }) => void;
  getChoiceInputView: () => ControllerStateViewWithRender;
  getGlobalActionView: () => {
    render: (lobby: ControllerStateRuntimeDictionary, me: ControllerStateRuntimeDictionary) => boolean;
    renderMessage: (lobby: ControllerStateRuntimeDictionary, message: string, options: ControllerStateRuntimeDictionary) => boolean | number | null;
  };
  getLobbyView: () => {
    renderInGamePhase: (me: ControllerStateRuntimeDictionary, phase: string) => void;
    renderLobby: (lobby: ControllerStateRuntimeDictionary, me: ControllerStateRuntimeDictionary, phase: string) => number | null;
  };
  getMicrophoneAccessView: () => ControllerStateViewWithRender;
  getTextInputView: () => ControllerStateViewWithRender;
  getVoiceInput: () => { stopRecognition: () => void };
}

export interface ControllerStateSpec {
  id: string;
  matches: (context: ControllerStateRenderContext) => boolean;
  render: (context: ControllerStateRenderContext) => boolean | number | null;
}

export interface ControllerStateRuntime {
  controllerInputFor(lobby: ControllerStateRuntimeDictionary, player: ControllerStateRuntimeDictionary): ControllerStateRuntimeDictionary | null;
  render(lobby: ControllerStateRuntimeDictionary, me: ControllerStateRuntimeDictionary): { countdownTimer: number | null; id: string };
  stateSpecs: readonly ControllerStateSpec[];
}

export function createControllerStateRuntime(options: ControllerStateRuntimeOptions): ControllerStateRuntime;
