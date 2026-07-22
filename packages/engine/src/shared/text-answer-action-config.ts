// Dual-use (server require + client global) text-answer action config. Built to
// packages/engine/src/shared/text-answer-action-config.js via `npm run build:shared`.
// The emitted JavaScript is mirrored to shared/ for direct browser loading.

(function (root: Record<string, unknown>, factory: () => unknown): void {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PartyTextAnswerActions = api;
  }
})((typeof globalThis !== "undefined" ? globalThis : window) as unknown as Record<string, unknown>, function () {
  "use strict";

  type ActionOrType = string | { type?: string } | null | undefined;

  interface TextAnswerConfig {
    mode: string;
    payloadType: string;
    prompt: string;
    placeholder: string;
  }

  const TEXT_ANSWER_ACTION_CONFIGS: Record<string, TextAnswerConfig> = {
    textSubmissionInput: {
      mode: "textAll",
      payloadType: "text",
      prompt: "Write your answer",
      placeholder: "Answer here"
    },
    voiceSubmissionInput: {
      mode: "voiceVip",
      payloadType: "voice",
      prompt: "Say your answer",
      placeholder: "Speak your answer"
    }
  };

  function textAnswerActionConfig(actionOrType: ActionOrType): TextAnswerConfig | null {
    const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
    return (type != null ? TEXT_ANSWER_ACTION_CONFIGS[type] : null) || null;
  }

  function isTextAnswerAction(actionOrType: ActionOrType): boolean {
    return Boolean(textAnswerActionConfig(actionOrType));
  }

  function textAnswerPayloadTypeForMode(mode: unknown): string {
    const match = Object.values(TEXT_ANSWER_ACTION_CONFIGS).find((config) => config.mode === mode);
    return match?.payloadType || "text";
  }

  return {
    TEXT_ANSWER_ACTION_CONFIGS,
    isTextAnswerAction,
    textAnswerActionConfig,
    textAnswerPayloadTypeForMode
  };
});
