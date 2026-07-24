"use strict";
// Engine-owned controller layout widget art-composition map.
// Built beside this source via `npm run build:shared`
// (committed output). Wrapped in an IIFE so declarations stay local to the shared compilation.
(function () {
    "use strict";
    const controllerPrimaryButtonArtCompositionId = "controller-primary-button";
    const controllerChoiceOptionArtCompositionId = "controller-choice-option";
    const controllerLayoutWidgetArtCompositionIds = Object.freeze({
        controlleravatar: "controller-avatar-button",
        controllerinvalidbanner: "controller-invalid-banner",
        controllermicaccessbutton: controllerPrimaryButtonArtCompositionId,
        controllerplayerbanner: "controller-player-banner",
        controllertextinput: "controller-text-input-field",
        controllertextsubmitbutton: controllerPrimaryButtonArtCompositionId,
        controllervoicebutton: controllerPrimaryButtonArtCompositionId,
        playernamefield: "controller-player-name-field",
        stagecodefield: "controller-stage-code-field",
    });
    function normalizeControllerLayoutWidgetId(value) {
        return String(value || "")
            .trim()
            .replace(/^#/, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }
    function controllerLayoutWidgetArtCompositionId(elementIdOrSelector) {
        return controllerLayoutWidgetArtCompositionIds[normalizeControllerLayoutWidgetId(elementIdOrSelector)] || "";
    }
    const api = {
        controllerChoiceOptionArtCompositionId,
        controllerLayoutWidgetArtCompositionId,
        controllerLayoutWidgetArtCompositionIds,
        controllerPrimaryButtonArtCompositionId,
        normalizeControllerLayoutWidgetId
    };
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
    if (typeof window !== "undefined")
        window.PartyControllerLayoutArtWidgets = api;
})();
