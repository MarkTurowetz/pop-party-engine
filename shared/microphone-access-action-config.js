"use strict";
// Dual-use (server require + client global) microphone-access action config. Built to
// shared/microphone-access-action-config.js via `npm run build:shared` (committed output).
(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    else {
        root.PartyMicrophoneAccessActions = api;
    }
})((typeof globalThis !== "undefined" ? globalThis : window), function () {
    "use strict";
    const MICROPHONE_ACCESS_ACTION_CONFIGS = {
        requestMicrophoneAccessInput: {
            mode: "vip",
            prompt: "Give microphone access to the game",
            buttonLabel: "Yes"
        }
    };
    function microphoneAccessActionConfig(actionOrType) {
        const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
        return (type != null ? MICROPHONE_ACCESS_ACTION_CONFIGS[type] : null) || null;
    }
    function isMicrophoneAccessAction(actionOrType) {
        return Boolean(microphoneAccessActionConfig(actionOrType));
    }
    function normalizeMicrophoneAccessMode(value) {
        return value === "all" ? "all" : "vip";
    }
    return {
        MICROPHONE_ACCESS_ACTION_CONFIGS,
        isMicrophoneAccessAction,
        microphoneAccessActionConfig,
        normalizeMicrophoneAccessMode
    };
});
