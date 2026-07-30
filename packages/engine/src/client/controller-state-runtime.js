"use strict";

const { controllerLayoutStateIds } = require("../shared/controller-layout-states");
const { resolveControllerSubmissionConfirmation } = require("./controller-submission-confirmation");

function createControllerStateRuntime(options) {
  const {
    closeAvatarPicker,
    getChoiceInputView,
    getGlobalActionView,
    getGamePluginInputView = () => ({ render: () => false }),
    getLobbyView,
    getMicrophoneAccessView,
    getTextInputView,
    getVoiceInput
  } = options;

  function phaseFor(lobby) {
    return lobby?.phase || "lobby";
  }

  function isLobbyPhase(phase) {
    return phase === "lobby" || phase === "starting";
  }

  function controllerInputFor(lobby, player) {
    return player?.input || lobby?.input || null;
  }

  function hasChoiceInput(lobby, player) {
    const input = controllerInputFor(lobby, player);
    return Boolean(input?.type || input?.options?.length);
  }

  function renderPaused(context) {
    getVoiceInput().stopRecognition();
    return getGlobalActionView().renderMessage(context.lobby, "Game Paused", {
      id: "paused",
      layoutPhase: controllerLayoutStateIds.paused,
      showButton: false
    });
  }

  function renderRuntimeFault(context) {
    getVoiceInput().stopRecognition();
    const fault = context.lobby.runtimeFault || {};
    const code = String(fault.code || "RUNTIME_FAULT");
    const message = String(fault.message || "The game cannot continue because required data is invalid.");
    return getGlobalActionView().renderMessage(context.lobby, `${message} (${code})`, {
      id: `runtimeFault:${fault.id || code}`,
      layoutPhase: controllerLayoutStateIds.presentation,
      showButton: false
    });
  }

  function renderSubmissionConfirmation(context) {
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

  function renderInGame(context) {
    if (getGlobalActionView().render(context.lobby, context.me)) return true;
    getVoiceInput().stopRecognition();
    return getGlobalActionView().renderMessage(context.lobby, "Waiting for the next instruction", {
      id: `inGameWaiting:${context.lobby?.gameSessionId || 0}:${context.phase}`,
      layoutPhase: controllerLayoutStateIds.presentation,
      showButton: false
    });
  }

  const stateSpecs = [
    {
      id: "runtimeFault",
      matches: (context) => Boolean(context.lobby?.runtimeFault),
      render: renderRuntimeFault
    },
    {
      id: "paused",
      matches: (context) => context.lobby?.isPaused === true && !isLobbyPhase(context.phase),
      render: renderPaused
    },
    {
      id: "microphoneAccess",
      matches: (context) => Boolean(context.lobby?.microphoneAccess?.actionId),
      render: (context) => getMicrophoneAccessView().render(context.lobby, context.me)
    },
    {
      id: "submissionConfirmation",
      matches: (context) => Boolean(resolveControllerSubmissionConfirmation(context.lobby, context.me)),
      render: renderSubmissionConfirmation
    },
    {
      id: "gamePluginInput",
      matches: (context) => Boolean(context.lobby?.gamePlugin?.input?.actionId),
      render: (context) => getGamePluginInputView().render(context.lobby, context.me)
    },
    {
      id: "choiceInput",
      matches: (context) => hasChoiceInput(context.lobby, context.me),
      render: (context) => getChoiceInputView().render(context.lobby, context.me)
    },
    {
      id: "textInput",
      matches: (context) => Boolean(context.lobby?.textInput?.actionId),
      render: (context) => getTextInputView().render(context.lobby, context.me)
    },
    {
      id: "inGame",
      matches: (context) => !isLobbyPhase(context.phase),
      render: renderInGame
    }
  ];

  function render(lobby, me) {
    const phase = phaseFor(lobby);
    const context = { lobby, me, phase };
    for (const spec of stateSpecs) {
      if (!spec.matches(context)) continue;
      closeAvatarPicker({ commit: false });
      const renderResult = spec.render(context);
      if (renderResult === false) continue;
      return {
        countdownTimer: renderResult && renderResult !== true ? renderResult : null,
        id: spec.id
      };
    }
    const countdownTimer = getLobbyView().renderLobby(lobby, me, phase);
    return { countdownTimer, id: "lobby" };
  }

  return Object.freeze({ controllerInputFor, render, stateSpecs: Object.freeze(stateSpecs) });
}

module.exports = Object.freeze({ createControllerStateRuntime });
