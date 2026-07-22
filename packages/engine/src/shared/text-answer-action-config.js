"use strict";
// Dual-use (server require + client global) text-answer action config. Built to
// packages/engine/src/shared/text-answer-action-config.js via `npm run build:shared`.
// The emitted JavaScript is mirrored to shared/ for direct browser loading.
(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    else {
        root.PartyTextAnswerActions = api;
    }
})((typeof globalThis !== "undefined" ? globalThis : window), function () {
    "use strict";
    const TEXT_ANSWER_ACTION_CONFIGS = {
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
    function textAnswerActionConfig(actionOrType) {
        const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
        return (type != null ? TEXT_ANSWER_ACTION_CONFIGS[type] : null) || null;
    }
    function isTextAnswerAction(actionOrType) {
        return Boolean(textAnswerActionConfig(actionOrType));
    }
    function textAnswerPayloadTypeForMode(mode) {
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
