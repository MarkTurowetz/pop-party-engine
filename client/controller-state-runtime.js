(function () {
  "use strict";

  function createControllerStateRuntime({
    closeAvatarPicker,
    getChoiceInputView,
    getGlobalActionView,
    getLobbyView,
    getMicrophoneAccessView,
    getTextInputView,
    getVoiceInput
  }) {
    function phaseFor(lobby) {
      return lobby?.phase || "lobby";
    }

    function isLobbyPhase(phase) {
      return phase === "lobby" || phase === "starting";
    }

    function controllerInputFor(lobby, me) {
      return me?.input || lobby?.input || null;
    }

    function hasChoiceInput(lobby, me) {
      const input = controllerInputFor(lobby, me);
      return Boolean(input?.type || input?.options?.length);
    }

    function renderPaused(context) {
      getVoiceInput().stopRecognition();
      return getGlobalActionView().renderMessage(context.lobby, "Game Paused", {
        id: "paused",
        layoutPhase: context.phase,
        showButton: false
      });
    }

    function renderInGame(context) {
      if (getGlobalActionView().render(context.lobby, context.me)) return true;
      getLobbyView().renderInGamePhase(context.me, context.phase);
      return true;
    }

    const stateSpecs = [
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

    return {
      controllerInputFor,
      render,
      stateSpecs
    };
  }

  window.createControllerStateRuntime = createControllerStateRuntime;
})();
