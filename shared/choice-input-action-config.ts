// Dual-use (server require + client global) choice-input action config. Built to
// shared/choice-input-action-config.js via `npm run build:shared` (committed output).

(function (root: Record<string, unknown>, factory: () => unknown): void {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PartyChoiceInputActions = api;
  }
})((typeof globalThis !== "undefined" ? globalThis : window) as unknown as Record<string, unknown>, function () {
  "use strict";

  type ActionOrType = string | { type?: string } | null | undefined;

  interface ChoiceInputConfig {
    kind: string;
    prompt: string;
    submittedLabel: string;
    inputMode?: string;
    locked?: boolean;
  }

  const CHOICE_INPUT_ACTION_CONFIGS: Record<string, ChoiceInputConfig> = {
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

  function choiceInputActionConfig(actionOrType: ActionOrType): ChoiceInputConfig | null {
    const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
    return (type != null ? CHOICE_INPUT_ACTION_CONFIGS[type] : null) || null;
  }

  function isChoiceInputAction(actionOrType: ActionOrType): boolean {
    return Boolean(choiceInputActionConfig(actionOrType));
  }

  return {
    CHOICE_INPUT_ACTION_CONFIGS,
    choiceInputActionConfig,
    isChoiceInputAction
  };
});
