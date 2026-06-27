(function () {
  "use strict";

  function createControllerChoiceInputView({
    applyLayoutForPhase,
    bindPress,
    elements,
    hideViews,
    setButtonText,
    setText,
    setTextShown,
    showView,
    submitChoice
  }) {
    const writeText = typeof setText === "function"
      ? setText
      : (target, value) => {
        window.PartyGameControllerText?.setText(target, value);
      };
    const writeButtonText = typeof setButtonText === "function"
      ? setButtonText
      : writeText;
    const showText = typeof setTextShown === "function"
      ? setTextShown
      : (target, isShown) => target?.classList?.toggle("hidden", !isShown);

    function render(lobby, me) {
      const input = me.input || lobby.input || null;
      if (!input) return false;
      hideViews();
      applyLayoutForPhase(lobby.phase || "lobby");
      showView("choice");
      writeText(elements.prompt, input.prompt || "Answer this question by tapping an answer");
      elements.grid.replaceChildren();

      const selectedIndex = Number.isFinite(Number(me.answer?.optionIndex)) ? Number(me.answer.optionIndex) : -1;
      const isDone = input.mode === "submitOnce" && me.answer?.done === true;
      showText(elements.done, isDone, { instant: true });
      elements.grid.classList.toggle("hidden", isDone);
      if (isDone) {
        writeText(elements.done, `You chose: ${me.answer?.text || ""}`);
      }

      const visibleOptions = (input.options || []).filter((option) => input.type !== "vote" || option.authorPlayerId !== me.id);
      for (const option of visibleOptions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice-option-button";
        button.dataset.controllerOption = "";
        button.dataset.optionId = `choice.${option.index}`;
        button.classList.toggle("is-selected", Number(option.index) === selectedIndex);
        writeButtonText(button, option.label || option.text || `Option ${Number(option.index) + 1}`, {
          width: 320,
          height: 72,
          fontSize: 24
        });
        button.disabled = isDone;
        button.addEventListener("click", () => submitChoice(input.actionId, Number(option.index), option.cardId || ""));
        bindPress(button);
        elements.grid.appendChild(button);
      }

      return true;
    }

    return { render };
  }

  window.createControllerChoiceInputView = createControllerChoiceInputView;
})();
