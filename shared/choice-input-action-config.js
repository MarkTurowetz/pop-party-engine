(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PartyChoiceInputActions = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const CHOICE_INPUT_ACTION_CONFIGS = {
    multipleChoiceInput: {
      kind: "multipleChoice",
      prompt: "Answer this question by tapping an answer",
      submittedLabel: "Answers"
    },
    triviaInput: {
      kind: "trivia",
      prompt: "Answer this question by tapping an answer",
      submittedLabel: "Answers"
    },
    voteOnAnswersInput: {
      kind: "vote",
      prompt: "Vote for your favorite answer",
      inputMode: "submitOnce",
      locked: true,
      submittedLabel: "Votes Submitted"
    }
  };

  function choiceInputActionConfig(actionOrType) {
    const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
    return CHOICE_INPUT_ACTION_CONFIGS[type] || null;
  }

  function isChoiceInputAction(actionOrType) {
    return Boolean(choiceInputActionConfig(actionOrType));
  }

  return {
    CHOICE_INPUT_ACTION_CONFIGS,
    choiceInputActionConfig,
    isChoiceInputAction
  };
});
