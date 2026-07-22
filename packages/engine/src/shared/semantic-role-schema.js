"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredCoreSemanticRoles = exports.coreSemanticRoleDefinitions = exports.SemanticRoleValidationError = void 0;
exports.normalizeSemanticRoleTarget = normalizeSemanticRoleTarget;
exports.normalizeSemanticRoleMap = normalizeSemanticRoleMap;
exports.validateSemanticRoleDocument = validateSemanticRoleDocument;
exports.semanticRoleTargetKey = semanticRoleTargetKey;
class SemanticRoleValidationError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "SemanticRoleValidationError";
        this.code = code;
        this.details = Object.freeze({ ...details });
    }
}
exports.SemanticRoleValidationError = SemanticRoleValidationError;
exports.coreSemanticRoleDefinitions = Object.freeze({
    "engine.stage.activeBackground": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["backgroundDefault"] }),
    "engine.stage.playerIdentityWidget": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["playerAnswerBubbleMC", "playerAvatarMC", "playerNameMC", "vipMC", "pointPopupContainer"] }),
    "engine.stage.playerAnswerBubble": Object.freeze({ surface: "stage", terminalKind: "reference" }),
    "engine.stage.playerPointsPopup": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["pointText", "pointShadow"] }),
    "engine.stage.playerPointsPopupContainer": Object.freeze({ surface: "stage", terminalKind: "container" }),
    "engine.stage.votingCard": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["voteCount", "author", "voters", "answer"] }),
    "engine.stage.timer": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["craftingTimerMC"] }),
    "engine.stage.transition": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["wipeArtMC"] }),
    "engine.stage.joinQrCode": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["qRLabel", "qRPlaceholder", "qRCard"] }),
    "engine.stage.roomCode": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["badgeCode", "badgeLabel", "badgeCard"] }),
    "engine.stage.roomCodePanel": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["panelCode", "panelLabel", "panelCard"] }),
    "engine.stage.joinPrompt": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["joinText", "joinPill"] }),
    "engine.stage.waitingStatus": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["statusText", "statusPill"] }),
    "engine.stage.countdown": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["popupText", "popupCard"] }),
    "engine.stage.presentationAdvancePrompt": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["cursorShape"] }),
    "engine.stage.layoutText": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["text"] }),
    "engine.shared.playerAvatar": Object.freeze({ surface: "stage", terminalKind: "composition", requiredInstanceLabels: ["playerAvatarBehaviors"] }),
    "engine.controller.playerIdentity": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["playerAvatarMc", "playerNameMc"] }),
    "engine.controller.textInput": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["placeholderText", "inputCard"] }),
    "engine.controller.submitControl": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["buttonText", "buttonCard"] }),
    "engine.controller.choiceControl": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["optionText", "optionCard"] }),
    "engine.controller.invalidSubmission": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["invalidText", "invalidCard"] }),
    "engine.controller.stageCodeInput": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["fieldLabel", "fieldValue", "fieldCard"] }),
    "engine.controller.playerNameInput": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["fieldLabel", "fieldValue", "fieldCard"] }),
    "engine.controller.avatarChoice": Object.freeze({ surface: "controller", terminalKind: "composition", requiredInstanceLabels: ["avatarCard"] })
});
exports.requiredCoreSemanticRoles = Object.freeze(Object.keys(exports.coreSemanticRoleDefinitions));
const roleIdPattern = /^(?:engine|[a-z][a-z0-9-]{2,63})\.(?:[a-z][A-Za-z0-9]*\.)*[a-z][A-Za-z0-9]*$/;
const compositionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const instanceLabelPattern = /^[a-z][A-Za-z0-9]*$/;
function fail(code, message, details = {}) {
    throw new SemanticRoleValidationError(code, message, details);
}
function plainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeSemanticRoleTarget(value, role = "") {
    if (!plainObject(value))
        fail("SEMANTIC_ROLE_TARGET_INVALID", "Semantic role targets must be objects", { role });
    const unknownKeys = Object.keys(value).filter((key) => key !== "compositionId" && key !== "instancePath");
    if (unknownKeys.length)
        fail("SEMANTIC_ROLE_TARGET_UNKNOWN_FIELD", "Semantic role target contains unsupported fields", { role, fields: unknownKeys });
    const compositionId = String(value.compositionId || "").trim();
    if (!compositionIdPattern.test(compositionId))
        fail("SEMANTIC_ROLE_COMPOSITION_INVALID", "Semantic role target requires a valid compositionId", { role, compositionId });
    const rawPath = value.instancePath == null ? [] : value.instancePath;
    if (!Array.isArray(rawPath))
        fail("SEMANTIC_ROLE_PATH_INVALID", "Semantic role instancePath must be an array", { role });
    const instancePath = rawPath.map((segment) => String(segment || "").trim());
    const invalidSegment = instancePath.find((segment) => !instanceLabelPattern.test(segment));
    if (invalidSegment)
        fail("SEMANTIC_ROLE_PATH_INVALID", "Semantic role instancePath must contain authored instance labels", { role, segment: invalidSegment });
    return Object.freeze({
        compositionId,
        ...(instancePath.length ? { instancePath: Object.freeze(instancePath) } : {})
    });
}
function normalizeSemanticRoleMap(value, options = {}) {
    if (!plainObject(value))
        fail("SEMANTIC_ROLES_INVALID", "Semantic roles must be an object");
    const roles = {};
    for (const [rawRole, target] of Object.entries(value)) {
        const role = String(rawRole || "").trim();
        if (!roleIdPattern.test(role))
            fail("SEMANTIC_ROLE_ID_INVALID", "Semantic role id is invalid", { role });
        if (role.startsWith("engine.") && !exports.coreSemanticRoleDefinitions[role]) {
            fail("SEMANTIC_ROLE_ENGINE_ID_UNKNOWN", "Game content cannot invent engine semantic roles", { role });
        }
        roles[role] = normalizeSemanticRoleTarget(target, role);
    }
    if (options.requireCoreRoles !== false) {
        const missingRoles = exports.requiredCoreSemanticRoles.filter((role) => !roles[role]);
        if (missingRoles.length)
            fail("SEMANTIC_ROLE_REQUIRED_MISSING", "Required engine semantic roles are missing", { missingRoles });
    }
    return Object.freeze(roles);
}
function compositionMapFromManifest(artManifest) {
    if (!plainObject(artManifest) || !plainObject(artManifest.compositions)) {
        fail("SEMANTIC_ROLE_ART_MANIFEST_INVALID", "Art manifest must contain a compositions object");
    }
    return new Map(Object.entries(artManifest.compositions).map(([id, composition]) => {
        if (!plainObject(composition))
            fail("SEMANTIC_ROLE_COMPOSITION_INVALID", "Art composition must be an object", { compositionId: id });
        return [id, { ...composition, id }];
    }));
}
function componentsOf(value) {
    return Array.isArray(value.components) ? value.components.filter(plainObject) : [];
}
function allComponentsOf(value) {
    const output = [];
    const visit = (components) => {
        for (const component of components) {
            output.push(component);
            visit(Array.isArray(component.children) ? component.children.filter(plainObject) : []);
        }
    };
    visit(componentsOf(value));
    return output;
}
function resolveTarget(role, target, compositions) {
    let composition = compositions.get(target.compositionId);
    if (!composition)
        fail("SEMANTIC_ROLE_COMPOSITION_MISSING", "Semantic role references a missing composition", { role, compositionId: target.compositionId });
    let terminal = composition;
    let terminalKind = "composition";
    let candidates = componentsOf(composition);
    for (const [index, label] of (target.instancePath || []).entries()) {
        const matches = candidates.filter((component) => String(component.instanceLabel || "") === label);
        if (matches.length !== 1) {
            fail("SEMANTIC_ROLE_PATH_UNRESOLVED", "Semantic role instancePath must resolve exactly once", {
                role,
                compositionId: String(composition.id || target.compositionId),
                label,
                matches: matches.length
            });
        }
        terminal = matches[0];
        terminalKind = String(terminal.kind || "");
        if (index === (target.instancePath || []).length - 1)
            continue;
        if (terminalKind === "reference") {
            const referencedId = String(terminal.artCompositionId || "").trim();
            composition = compositions.get(referencedId);
            if (!composition)
                fail("SEMANTIC_ROLE_REFERENCE_MISSING", "Semantic role path crosses a missing referenced composition", { role, referencedId });
            candidates = componentsOf(composition);
        }
        else {
            candidates = Array.isArray(terminal.children) ? terminal.children.filter(plainObject) : [];
        }
    }
    return { composition, terminal, terminalKind };
}
function validateSemanticRoleDocument(document, artManifest) {
    if (!plainObject(document) || Number(document.schemaVersion) !== 1 || !plainObject(document.roles)) {
        fail("SEMANTIC_ROLES_DOCUMENT_INVALID", "Semantic roles document must use schemaVersion 1 and contain a roles object");
    }
    const roles = normalizeSemanticRoleMap(document.roles);
    const compositions = compositionMapFromManifest(artManifest);
    for (const [role, target] of Object.entries(roles)) {
        const resolved = resolveTarget(role, target, compositions);
        const definition = exports.coreSemanticRoleDefinitions[role];
        if (!definition)
            continue;
        const root = compositions.get(target.compositionId);
        if (String(root.surface || "") !== definition.surface) {
            fail("SEMANTIC_ROLE_SURFACE_MISMATCH", "Semantic role target belongs to the wrong surface", {
                role,
                expectedSurface: definition.surface,
                actualSurface: String(root.surface || "")
            });
        }
        if (definition.terminalKind && resolved.terminalKind !== definition.terminalKind) {
            fail("SEMANTIC_ROLE_KIND_MISMATCH", "Semantic role target has an incompatible terminal kind", {
                role,
                expectedKind: definition.terminalKind,
                actualKind: resolved.terminalKind
            });
        }
        const rootComponents = allComponentsOf(root);
        for (const instanceLabel of definition.requiredInstanceLabels || []) {
            const matches = rootComponents.filter((component) => String(component.instanceLabel || "") === instanceLabel);
            if (matches.length !== 1) {
                fail("SEMANTIC_ROLE_BINDING_MISSING", "Semantic role target is missing a required authored binding", {
                    role,
                    compositionId: target.compositionId,
                    instanceLabel,
                    matches: matches.length
                });
            }
        }
    }
    return Object.freeze({ schemaVersion: 1, roles });
}
function semanticRoleTargetKey(value) {
    const target = normalizeSemanticRoleTarget(value);
    return `${target.compositionId}#${(target.instancePath || []).join("/")}`;
}
