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
  return legacyTextLayoutIds.has(normalized)
    || normalized.endsWith("momenttext")
    || normalized.endsWith("controllertext");
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
