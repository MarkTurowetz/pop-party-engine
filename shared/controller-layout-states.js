"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.semanticControllerLayoutStateIds = exports.controllerLayoutStateIds = void 0;
exports.isSemanticControllerLayoutStateId = isSemanticControllerLayoutStateId;
exports.controllerChoiceLayoutStateId = controllerChoiceLayoutStateId;
exports.controllerTextLayoutStateId = controllerTextLayoutStateId;
exports.controllerLayoutStateIds = Object.freeze({
    join: "join",
    lobby: "lobby",
    presentation: "controller-presentation",
    multipleChoice: "controller-multiple-choice",
    voting: "controller-voting",
    textInput: "controller-text-input",
    voiceInput: "controller-voice-input",
    microphoneAccess: "controller-microphone-access",
    paused: "controller-paused"
});
exports.semanticControllerLayoutStateIds = Object.freeze([
    exports.controllerLayoutStateIds.presentation,
    exports.controllerLayoutStateIds.multipleChoice,
    exports.controllerLayoutStateIds.voting,
    exports.controllerLayoutStateIds.textInput,
    exports.controllerLayoutStateIds.voiceInput,
    exports.controllerLayoutStateIds.microphoneAccess,
    exports.controllerLayoutStateIds.paused
]);
const semanticStateIdSet = new Set(exports.semanticControllerLayoutStateIds);
function isSemanticControllerLayoutStateId(value) {
    return semanticStateIdSet.has(String(value || ""));
}
function controllerChoiceLayoutStateId(inputType) {
    return String(inputType || "").trim().toLowerCase() === "vote"
        ? exports.controllerLayoutStateIds.voting
        : exports.controllerLayoutStateIds.multipleChoice;
}
function controllerTextLayoutStateId(inputType, inputMode = "") {
    const type = String(inputType || "").trim().toLowerCase();
    const mode = String(inputMode || "").trim().toLowerCase();
    return type === "voice" || mode === "voicevip"
        ? exports.controllerLayoutStateIds.voiceInput
        : exports.controllerLayoutStateIds.textInput;
}
