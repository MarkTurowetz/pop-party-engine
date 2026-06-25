(function () {
  "use strict";

  function createControllerTextInputView({
    applyLayoutForPhase,
    dismissedInvalidKey,
    elements,
    getVoiceInput,
    hideViews,
    setPhaseActionId,
    submitText
  }) {
    function setInputLimit(limit) {
      if (limit > 0) {
        elements.input.maxLength = limit;
      } else {
        elements.input.removeAttribute("maxlength");
      }
    }

    function setVisibility({ isDone, isVoiceInput, showInvalid }) {
      elements.done.classList.toggle("hidden", !isDone);
      elements.input.classList.toggle("hidden", isDone || isVoiceInput);
      elements.submitButton.classList.toggle("hidden", isDone || isVoiceInput);
      elements.voiceButton.classList.toggle("hidden", isDone || !isVoiceInput);
      elements.voiceStatus.classList.toggle("hidden", isDone || !isVoiceInput);
      elements.invalidBanner.classList.toggle("hidden", !showInvalid || isDone);
    }

    function render(lobby, me) {
      const input = lobby.textInput || null;
      if (!input) return false;
      const isVoiceInput = input.type === "voice" || input.mode === "voiceVip";
      const voiceInput = getVoiceInput();
      if (isVoiceInput && !me.isVip) {
        voiceInput.renderWaiting(lobby);
        return true;
      }
      if (!isVoiceInput) voiceInput.stopRecognition();
      hideViews();
      setPhaseActionId(input.actionId);
      applyLayoutForPhase(lobby.phase || "lobby");
      elements.state.classList.remove("hidden");
      elements.prompt.textContent = input.prompt || (isVoiceInput ? "Say your answer" : "Write your answer");
      elements.invalidBanner.textContent = "Your submission was invalid";
      elements.input.placeholder = input.placeholder || "Answer here";
      setInputLimit(Number(input.characterLimit || 0));

      const isDone = me.answer?.done === true;
      const isInvalid = me.answer?.invalid === true;
      const invalidKey = `${input.actionId}:${me.answer?.nonce || 0}`;
      const showInvalid = isInvalid && dismissedInvalidKey() !== invalidKey;
      setVisibility({ isDone, isVoiceInput, showInvalid });

      if (isDone) {
        elements.done.textContent = isVoiceInput ? `You said: ${me.answer?.text || ""}` : `You wrote: ${me.answer?.text || ""}`;
      } else if (showInvalid) {
        elements.input.value = "";
      } else if (isVoiceInput && !voiceInput.isListening()) {
        voiceInput.resetUi();
      }

      elements.submitButton.disabled = elements.input.value.trim().length === 0;
      elements.submitButton.onclick = () => submitText(input.actionId);
      voiceInput.bindButton(input.actionId);
      setVisibility({ isDone, isVoiceInput, showInvalid });
      return true;
    }

    return { render };
  }

  window.createControllerTextInputView = createControllerTextInputView;
})();
