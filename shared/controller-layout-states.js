"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.semanticControllerLayoutStateIds = exports.controllerLayoutStateIds = void 0;
exports.isSemanticControllerLayoutStateId = isSemanticControllerLayoutStateId;
exports.controllerLayoutCandidateIds = controllerLayoutCandidateIds;
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
function controllerLayoutCandidateIds(phase, selectedLayoutId, hasControllerState = true) {
    const candidates = [];
    const add = (value) => {
        const id = String(value || "").trim();
        if (id && !candidates.includes(id))
            candidates.push(id);
    };
    if (!hasControllerState) {
        add(exports.controllerLayoutStateIds.join);
        add(exports.controllerLayoutStateIds.lobby);
        return candidates;
    }
    const phaseId = String(phase || "").trim();
    if (phaseId === exports.controllerLayoutStateIds.join) {
        add(exports.controllerLayoutStateIds.join);
        add(exports.controllerLayoutStateIds.lobby);
        return candidates;
    }
    if (isSemanticControllerLayoutStateId(phaseId)) {
        add(phaseId);
        add(exports.controllerLayoutStateIds.presentation);
        add(exports.controllerLayoutStateIds.lobby);
        return candidates;
    }
    const selectedId = String(selectedLayoutId || "").trim();
    add(selectedId || (phaseId === "starting" ? exports.controllerLayoutStateIds.lobby : phaseId || exports.controllerLayoutStateIds.lobby));
    add(phaseId === "lobby" || phaseId === "starting" ? exports.controllerLayoutStateIds.lobby : exports.controllerLayoutStateIds.presentation);
    add(exports.controllerLayoutStateIds.lobby);
    return candidates;
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
