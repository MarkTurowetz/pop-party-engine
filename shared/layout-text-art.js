"use strict";
// Server-side (CommonJS require) layout text-art id helpers. Built to
// shared/layout-text-art.js via `npm run build:shared` (committed output). Wrapped in an
// IIFE so its declarations stay local to the shared/*.ts compilation's script scope.
(function () {
    "use strict";
    const layoutTextArtCompositionId = "layout-text-field";
    const layoutTextArtComponentId = "text";
    const legacyTextLayoutIds = new Set([
        "stagetitle",
        "stageintrotitle",
        "stagepresentationtext",
        "stageprompttext",
        "roundintrotext",
        "roundintroinfotext",
        "jointitle",
        "controllerplayername",
        "controllermeta",
        "controllerintromessage",
        "controllerglobalactionmessage",
        "controllerchoiceprompt",
        "controllerchoicedone",
        "controllermicaccessprompt",
        "controllermicaccessstatus",
        "controllertextprompt",
        "controllervoicestatus",
        "controllertextdone"
    ]);
    function normalizeLayoutTextArtId(value) {
        return String(value || "")
            .trim()
            .replace(/^#/, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }
    function isLayoutTextArtElementId(id) {
        const normalized = normalizeLayoutTextArtId(id);
        return (legacyTextLayoutIds.has(normalized) ||
            normalized.endsWith("momenttext") ||
            normalized.endsWith("controllertext"));
    }
    function isLayoutTextArtSelector(selector) {
        return isLayoutTextArtElementId(selector);
    }
    module.exports = {
        isLayoutTextArtElementId,
        isLayoutTextArtSelector,
        layoutTextArtComponentId,
        layoutTextArtCompositionId,
        normalizeLayoutTextArtId
    };
})();
