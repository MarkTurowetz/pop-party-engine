(function () {
  "use strict";

  function createControllerSubmitApi({ getControllerState, postJson }) {
    function payloadBase() {
      const state = getControllerState();
      if (!state) return null;
      return {
        playerId: state.playerId,
        stageCode: state.stageCode
      };
    }

    function join(stageCode, playerName, playerId) {
      return postJson("/api/join", { stageCode, playerName, playerId });
    }

    function submitChoice(actionId, optionIndex, cardId = "") {
      const base = payloadBase();
      if (!base) return Promise.resolve(null);
      return postJson("/api/controller-choice", {
        ...base,
        actionId,
        cardId,
        optionIndex
      });
    }

    function submitText(actionId, text) {
      const base = payloadBase();
      if (!base) return Promise.resolve(null);
      return postJson("/api/controller-text-submit", {
        ...base,
        actionId,
        text
      });
    }

    function startOrCancelGame({ isCancel = false, startToken = "" } = {}) {
      const base = payloadBase();
      if (!base) return Promise.resolve(null);
      return postJson(isCancel ? "/api/cancel-start" : "/api/start", {
        ...base,
        startToken
      });
    }

    function presentIntro({ startToken = "" } = {}) {
      const base = payloadBase();
      if (!base) return Promise.resolve(null);
      return postJson("/api/present-hi", {
        ...base,
        startToken
      });
    }

    function updateAvatar(shape) {
      const base = payloadBase();
      if (!base) return Promise.resolve(null);
      return postJson("/api/avatar", {
        ...base,
        shape
      });
    }

    return {
      join,
      presentIntro,
      submitChoice,
      submitText,
      startOrCancelGame,
      updateAvatar
    };
  }

  window.createControllerSubmitApi = createControllerSubmitApi;
})();
