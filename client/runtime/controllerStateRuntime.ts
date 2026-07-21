// Typed port of the legacy client/controller-state-runtime.js IIFE — the controller
// view state machine. Installs window.createControllerStateRuntime for the legacy
// controller runtime.

import { controllerLayoutStateIds } from "../../shared/controller-layout-states";
import { resolveControllerSubmissionConfirmation } from "./controllerSubmissionConfirmation";

type Dict = Record<string, unknown>;
interface RenderContext {
  lobby: Dict;
  me: Dict;
  phase: string;
}

interface ViewWithRender {
  render: (lobby: Dict, me: Dict) => boolean | number | null;
}

export interface ControllerStateRuntimeOptions {
  closeAvatarPicker: (options: { commit: boolean }) => void;
  getChoiceInputView: () => ViewWithRender;
  getGlobalActionView: () => {
    render: (lobby: Dict, me: Dict) => boolean;
    renderMessage: (lobby: Dict, message: string, options: Dict) => boolean | number | null;
  };
  getLobbyView: () => {
    renderInGamePhase: (me: Dict, phase: string) => void;
    renderLobby: (lobby: Dict, me: Dict, phase: string) => number | null;
  };
  getMicrophoneAccessView: () => ViewWithRender;
  getTextInputView: () => ViewWithRender;
  getVoiceInput: () => { stopRecognition: () => void };
}

interface StateSpec {
  id: string;
  matches: (context: RenderContext) => boolean;
  render: (context: RenderContext) => boolean | number | null;
}

export function createControllerStateRuntime(options: ControllerStateRuntimeOptions) {
  const {
    closeAvatarPicker,
    getChoiceInputView,
    getGlobalActionView,
    getLobbyView,
    getMicrophoneAccessView,
    getTextInputView,
    getVoiceInput
  } = options;

  function phaseFor(lobby: Dict): string {
    return (lobby?.phase as string) || "lobby";
  }

  function isLobbyPhase(phase: string): boolean {
    return phase === "lobby" || phase === "starting";
  }

  function controllerInputFor(lobby: Dict, me: Dict): Dict | null {
    return ((me?.input || lobby?.input) as Dict) || null;
  }

  function hasChoiceInput(lobby: Dict, me: Dict): boolean {
    const input = controllerInputFor(lobby, me);
    return Boolean(input?.type || (input?.options as unknown[])?.length);
  }

  function renderPaused(context: RenderContext): boolean | number | null {
    getVoiceInput().stopRecognition();
    return getGlobalActionView().renderMessage(context.lobby, "Game Paused", {
      id: "paused",
      layoutPhase: controllerLayoutStateIds.paused,
      showButton: false
    });
  }

  function renderRuntimeFault(context: RenderContext): boolean | number | null {
    getVoiceInput().stopRecognition();
    const fault = (context.lobby.runtimeFault || {}) as Dict;
    const code = String(fault.code || "RUNTIME_FAULT");
    const message = String(fault.message || "The game cannot continue because required data is invalid.");
    return getGlobalActionView().renderMessage(context.lobby, `${message} (${code})`, {
      id: `runtimeFault:${fault.id || code}`,
      layoutPhase: controllerLayoutStateIds.presentation,
      showButton: false
    });
  }

  function renderSubmissionConfirmation(context: RenderContext): boolean | number | null {
    const confirmation = resolveControllerSubmissionConfirmation(context.lobby, context.me);
    if (!confirmation) return false;
    getVoiceInput().stopRecognition();
    return getGlobalActionView().renderMessage(context.lobby, confirmation.message, {
      id: `submissionConfirmation:${confirmation.actionId}`,
      actionId: confirmation.actionId,
      layoutPhase: controllerLayoutStateIds.presentation,
      showButton: false
    });
  }

  function renderInGame(context: RenderContext): boolean {
    if (getGlobalActionView().render(context.lobby, context.me)) return true;
    getLobbyView().renderInGamePhase(context.me, context.phase);
    return true;
  }

  const stateSpecs: StateSpec[] = [
    {
      id: "runtimeFault",
      matches: (context) => Boolean(context.lobby?.runtimeFault),
      render: renderRuntimeFault
    },
    {
      id: "paused",
      matches: (context) => (context.lobby?.isPaused as boolean) === true && !isLobbyPhase(context.phase),
      render: renderPaused
    },
    {
      id: "microphoneAccess",
      matches: (context) => Boolean((context.lobby?.microphoneAccess as Dict)?.actionId),
      render: (context) => getMicrophoneAccessView().render(context.lobby, context.me)
    },
    {
      id: "submissionConfirmation",
      matches: (context) => Boolean(resolveControllerSubmissionConfirmation(context.lobby, context.me)),
      render: renderSubmissionConfirmation
    },
    {
      id: "choiceInput",
      matches: (context) => hasChoiceInput(context.lobby, context.me),
      render: (context) => getChoiceInputView().render(context.lobby, context.me)
    },
    {
      id: "textInput",
      matches: (context) => Boolean((context.lobby?.textInput as Dict)?.actionId),
      render: (context) => getTextInputView().render(context.lobby, context.me)
    },
    {
      id: "inGame",
      matches: (context) => !isLobbyPhase(context.phase),
      render: renderInGame
    }
  ];

  function render(lobby: Dict, me: Dict): { countdownTimer: number | null; id: string } {
    const phase = phaseFor(lobby);
    const context: RenderContext = { lobby, me, phase };
    for (const spec of stateSpecs) {
      if (!spec.matches(context)) continue;
      closeAvatarPicker({ commit: false });
      const renderResult = spec.render(context);
      if (renderResult === false) continue;
      return {
        countdownTimer: renderResult && renderResult !== true ? (renderResult as number) : null,
        id: spec.id
      };
    }
    const countdownTimer = getLobbyView().renderLobby(lobby, me, phase);
    return { countdownTimer, id: "lobby" };
  }

  return { controllerInputFor, render, stateSpecs };
}

declare global {
  interface Window {
    createControllerStateRuntime?: typeof createControllerStateRuntime;
  }
}

export function installControllerStateRuntimeGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerStateRuntime = createControllerStateRuntime;
}

installControllerStateRuntimeGlobals(typeof window !== "undefined" ? window : globalThis);
