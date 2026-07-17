"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ART_COMPONENT_SCHEMA_VERSION = void 0;
exports.normalizeCurrentArtManifestGeometry = normalizeCurrentArtManifestGeometry;
exports.migrateLegacyArtCompositionCoordinates = migrateLegacyArtCompositionCoordinates;
exports.migrateLegacyArtCompositionSchema = migrateLegacyArtCompositionSchema;
exports.migrateLegacyArtManifestSchema = migrateLegacyArtManifestSchema;
exports.ART_COMPONENT_SCHEMA_VERSION = 3;
const SPRITE_SCHEMA_VERSION = 1;
const CENTERED_COORDINATE_SCHEMA_VERSION = 2;
const VOTING_CARD_ANSWER_GEOMETRY_VERSION = 3;
const IMAGE_FIELDS = ["imageDataUrl", "imageAssetId", "imageName", "imageMimeType", "imageObjectFit", "imageTint"];
const SHAPE_FIELDS = ["shapeStyle", "fillColor", "fillCss", "borderColor", "borderWidth", "borderRadius"];
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}
function removeFields(target, fields) {
    for (const field of fields)
        delete target[field];
}
function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
function translateTimelinePosition(timelineValue, offsets, selfOffset = null) {
    const timeline = record(timelineValue);
    const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
    for (const trackValue of tracks) {
        const track = record(trackValue);
        const targetId = String(track.targetId || "");
        const targetParts = targetId.split("/").filter(Boolean);
        const offset = targetId === "self"
            ? selfOffset
            : offsets.get(targetId) || offsets.get(targetParts[targetParts.length - 1] || "") || null;
        if (!offset || !Array.isArray(track.keyframes))
            continue;
        for (const keyframeValue of track.keyframes) {
            const keyframe = record(keyframeValue);
            const props = record(keyframe.props);
            const x = finiteNumber(props.x);
            const y = finiteNumber(props.y);
            if (x !== null)
                props.x = Number((x + offset.x).toFixed(3));
            if (y !== null)
                props.y = Number((y + offset.y).toFixed(3));
            keyframe.props = props;
        }
    }
}
function resizeTimelineTarget(timelineValue, targetId, width, height) {
    const timeline = record(timelineValue);
    for (const trackValue of Array.isArray(timeline.tracks) ? timeline.tracks : []) {
        const track = record(trackValue);
        if (String(track.targetId || "") !== targetId || !Array.isArray(track.keyframes))
            continue;
        for (const keyframeValue of track.keyframes) {
            const keyframe = record(keyframeValue);
            const props = record(keyframe.props);
            if (Object.prototype.hasOwnProperty.call(props, "width"))
                props.width = width;
            if (Object.prototype.hasOwnProperty.call(props, "height"))
                props.height = height;
            keyframe.props = props;
        }
    }
}
function componentBounds(componentValue) {
    const component = record(componentValue);
    const width = Math.max(1, finiteNumber(component.width) || 1);
    const height = Math.max(1, finiteNumber(component.height) || 1);
    const scale = Math.max(0.001, finiteNumber(component.scale) || 1);
    const rotation = ((finiteNumber(component.rotation) || 0) * Math.PI) / 180;
    const halfWidth = (width * scale) / 2;
    const halfHeight = (height * scale) / 2;
    const radiusX = Math.abs(Math.cos(rotation)) * halfWidth + Math.abs(Math.sin(rotation)) * halfHeight;
    const radiusY = Math.abs(Math.sin(rotation)) * halfWidth + Math.abs(Math.cos(rotation)) * halfHeight;
    const x = finiteNumber(component.x) || 0;
    const y = finiteNumber(component.y) || 0;
    return { minX: x - radiusX, minY: y - radiusY, maxX: x + radiusX, maxY: y + radiusY };
}
function rootComponentBounds(componentsValue) {
    const components = Array.isArray(componentsValue) ? componentsValue : [];
    let output = null;
    for (const component of components) {
        const next = componentBounds(component);
        output = output
            ? {
                minX: Math.min(output.minX, next.minX),
                minY: Math.min(output.minY, next.minY),
                maxX: Math.max(output.maxX, next.maxX),
                maxY: Math.max(output.maxY, next.maxY)
            }
            : next;
    }
    return output;
}
function frameZeroPropsByTarget(timelineValue) {
    const output = new Map();
    const timeline = record(timelineValue);
    for (const trackValue of Array.isArray(timeline.tracks) ? timeline.tracks : []) {
        const track = record(trackValue);
        const targetId = String(track.targetId || "");
        if (!targetId)
            continue;
        const keyframe = (Array.isArray(track.keyframes) ? track.keyframes : [])
            .map(record)
            .find((value) => finiteNumber(value.frame) === 0);
        if (keyframe)
            output.set(targetId, record(keyframe.props));
    }
    return output;
}
function normalizeRootComponentsFromFrameZero(composition) {
    const components = Array.isArray(composition.components) ? composition.components : [];
    if (!components.length)
        return null;
    const frameZero = frameZeroPropsByTarget(composition.timeline);
    const resolved = components.map((value) => {
        const component = record(value);
        return { ...component, ...(frameZero.get(String(component.id || "")) || {}) };
    });
    const bounds = rootComponentBounds(resolved);
    if (!bounds)
        return null;
    const width = Number(Math.max(1, bounds.maxX - bounds.minX).toFixed(3));
    const height = Number(Math.max(1, bounds.maxY - bounds.minY).toFixed(3));
    const offset = { x: Number((-bounds.minX).toFixed(3)), y: Number((-bounds.minY).toFixed(3)) };
    const offsets = new Map();
    let changed = Boolean(offset.x || offset.y);
    components.forEach((value, index) => {
        const component = record(value);
        const geometry = record(resolved[index]);
        const id = String(component.id || "");
        const x = Number(((finiteNumber(geometry.x) || 0) + offset.x).toFixed(3));
        const y = Number(((finiteNumber(geometry.y) || 0) + offset.y).toFixed(3));
        const componentWidth = Math.max(1, finiteNumber(geometry.width) || finiteNumber(component.width) || 1);
        const componentHeight = Math.max(1, finiteNumber(geometry.height) || finiteNumber(component.height) || 1);
        if (finiteNumber(component.x) !== x ||
            finiteNumber(component.y) !== y ||
            finiteNumber(component.width) !== componentWidth ||
            finiteNumber(component.height) !== componentHeight)
            changed = true;
        component.x = x;
        component.y = y;
        component.width = componentWidth;
        component.height = componentHeight;
        if (id)
            offsets.set(id, offset);
    });
    translateTimelinePosition(composition.timeline, offsets);
    return { width, height, changed };
}
function translateRootComponents(composition, x, y) {
    if (!x && !y)
        return;
    const offsets = new Map();
    for (const componentValue of Array.isArray(composition.components) ? composition.components : []) {
        const component = record(componentValue);
        const id = String(component.id || "");
        component.x = Number(((finiteNumber(component.x) || 0) + x).toFixed(3));
        component.y = Number(((finiteNumber(component.y) || 0) + y).toFixed(3));
        if (id)
            offsets.set(id, { x, y });
        translateTimelinePosition(component.timeline, new Map(), { x, y });
    }
    translateTimelinePosition(composition.timeline, offsets);
}
function compositionEntryByName(compositions, name) {
    for (const [id, value] of Object.entries(compositions)) {
        const composition = record(value);
        if (String(composition.name || "") === name)
            return [id, composition];
    }
    return null;
}
function syncReferenceSize(componentValue, composition, sourceId, width, height) {
    const component = record(componentValue);
    let changed = 0;
    if (String(component.kind || "") === "reference" && String(component.artCompositionId || "") === sourceId) {
        if (finiteNumber(component.width) !== width || finiteNumber(component.height) !== height) {
            component.width = width;
            component.height = height;
            resizeTimelineTarget(composition.timeline, String(component.id || ""), width, height);
            resizeTimelineTarget(component.timeline, "self", width, height);
            changed += 1;
        }
    }
    for (const child of Array.isArray(component.children) ? component.children : []) {
        changed += syncReferenceSize(child, composition, sourceId, width, height);
    }
    return changed;
}
/**
 * Build 1008 exposed a legacy Voting Card viewport mismatch that the old
 * content-bounds renderer had hidden. The semantic answer art is a 520x150
 * surface, but both its base composition and lifecycle wrapper still declared
 * 560x230 canvases. Once references began honoring authored canvases directly,
 * the 560x230 source was non-uniformly squeezed into the 520x150 widget slot.
 *
 * Normalize the source and wrapper canvases once while preserving the compound
 * widget's intentionally authored x/y placement.
 */
function normalizeVotingCardAnswerGeometry(compositions, report) {
    const changedIds = new Set();
    const baseEntry = compositionEntryByName(compositions, "Voting Card Answer Text");
    const wrapperEntry = compositionEntryByName(compositions, "Voting Card Answer");
    if (!baseEntry || !wrapperEntry)
        return [];
    const [baseId, base] = baseEntry;
    const baseCanvas = record(base.canvas);
    const normalizedBaseSize = normalizeRootComponentsFromFrameZero(base);
    if (!normalizedBaseSize)
        return [];
    const targetWidth = normalizedBaseSize.width;
    const targetHeight = normalizedBaseSize.height;
    const targetX = targetWidth / 2;
    const targetY = targetHeight / 2;
    let baseChanged = normalizedBaseSize.changed;
    if (finiteNumber(baseCanvas.width) !== targetWidth || finiteNumber(baseCanvas.height) !== targetHeight) {
        baseCanvas.width = targetWidth;
        baseCanvas.height = targetHeight;
        base.canvas = baseCanvas;
        report.resizedCompositionCount += 1;
        baseChanged = true;
    }
    if (baseChanged)
        changedIds.add(baseId);
    const [wrapperId, wrapper] = wrapperEntry;
    const wrapperCanvas = record(wrapper.canvas);
    const wrapperComponents = Array.isArray(wrapper.components) ? wrapper.components : [];
    const root = record(wrapperComponents.find((value) => String(record(value).artCompositionId || "") === baseId) || wrapperComponents[0]);
    let wrapperChanged = false;
    if (Object.keys(root).length) {
        const offsetX = Number((targetX - (finiteNumber(root.x) || 0)).toFixed(3));
        const offsetY = Number((targetY - (finiteNumber(root.y) || 0)).toFixed(3));
        if (offsetX || offsetY) {
            translateRootComponents(wrapper, offsetX, offsetY);
            wrapperChanged = true;
        }
        if (finiteNumber(root.width) !== targetWidth || finiteNumber(root.height) !== targetHeight) {
            root.width = targetWidth;
            root.height = targetHeight;
            resizeTimelineTarget(wrapper.timeline, String(root.id || ""), targetWidth, targetHeight);
            resizeTimelineTarget(root.timeline, "self", targetWidth, targetHeight);
            wrapperChanged = true;
        }
    }
    if (finiteNumber(wrapperCanvas.width) !== targetWidth || finiteNumber(wrapperCanvas.height) !== targetHeight) {
        wrapperCanvas.width = targetWidth;
        wrapperCanvas.height = targetHeight;
        wrapper.canvas = wrapperCanvas;
        report.resizedCompositionCount += 1;
        wrapperChanged = true;
    }
    if (wrapperChanged)
        changedIds.add(wrapperId);
    for (const [compositionId, compositionValue] of Object.entries(compositions)) {
        const composition = record(compositionValue);
        let changedReferences = 0;
        for (const component of Array.isArray(composition.components) ? composition.components : []) {
            changedReferences += syncReferenceSize(component, composition, wrapperId, targetWidth, targetHeight);
        }
        if (changedReferences)
            changedIds.add(compositionId);
    }
    if (changedIds.size)
        report.changed = true;
    return [...changedIds];
}
function normalizeCurrentArtManifestGeometry(manifestValue) {
    const manifest = clone(manifestValue || {});
    const root = manifest;
    const report = {
        changed: false,
        spriteCount: 0,
        avatarFrameShapeCount: 0,
        centeredComponentCount: 0,
        resizedCompositionCount: 0,
        compositionIds: []
    };
    const compositions = record(root.compositions);
    report.compositionIds = normalizeVotingCardAnswerGeometry(compositions, report);
    root.artComponentSchemaVersion = exports.ART_COMPONENT_SCHEMA_VERSION;
    return { manifest, report };
}
function centerLegacyComponents(componentsValue, parentWidth, parentHeight, path, offsets, report) {
    const components = Array.isArray(componentsValue) ? componentsValue : [];
    for (const componentValue of components) {
        const component = record(componentValue);
        const id = String(component.id || "");
        const componentPath = [...path, id].filter(Boolean);
        let ownOffset = null;
        if (finiteNumber(component.x) === 0 && finiteNumber(component.y) === 0) {
            ownOffset = {
                x: Number((parentWidth / 2).toFixed(3)),
                y: Number((parentHeight / 2).toFixed(3))
            };
            component.x = ownOffset.x;
            component.y = ownOffset.y;
            if (id)
                offsets.set(id, ownOffset);
            if (componentPath.length)
                offsets.set(componentPath.join("/"), ownOffset);
            report.centeredComponentCount += 1;
            report.changed = true;
        }
        centerLegacyComponents(component.children, Math.max(1, finiteNumber(component.width) || 1), Math.max(1, finiteNumber(component.height) || 1), componentPath, offsets, report);
        translateTimelinePosition(component.timeline, offsets, ownOffset);
    }
}
function migrateLegacyArtCompositionCoordinates(compositionValue, reportValue, resolveComposition = () => null) {
    const composition = compositionValue;
    const report = reportValue || {
        changed: false,
        spriteCount: 0,
        avatarFrameShapeCount: 0,
        centeredComponentCount: 0,
        resizedCompositionCount: 0,
        compositionIds: []
    };
    const components = Array.isArray(composition.components) ? composition.components : [];
    const canvas = record(composition.canvas);
    if (String(composition.compositionKind || "") === "prefab" &&
        components.length === 1 &&
        finiteNumber(record(components[0]).x) === 0 &&
        finiteNumber(record(components[0]).y) === 0) {
        const root = record(components[0]);
        const referenced = String(root.kind || "") === "reference"
            ? resolveComposition(String(root.artCompositionId || ""))
            : null;
        const referencedCanvas = record(referenced?.canvas);
        const width = Math.max(1, finiteNumber(referencedCanvas.width) || finiteNumber(root.width) || 1);
        const height = Math.max(1, finiteNumber(referencedCanvas.height) || finiteNumber(root.height) || 1);
        if (finiteNumber(canvas.width) !== width || finiteNumber(canvas.height) !== height) {
            canvas.width = width;
            canvas.height = height;
            composition.canvas = canvas;
            report.resizedCompositionCount += 1;
            report.changed = true;
        }
        if (referenced) {
            root.width = width;
            root.height = height;
            resizeTimelineTarget(composition.timeline, String(root.id || ""), width, height);
            resizeTimelineTarget(root.timeline, "self", width, height);
        }
    }
    const canvasWidth = Math.max(1, finiteNumber(canvas.width) || 1);
    const canvasHeight = Math.max(1, finiteNumber(canvas.height) || 1);
    const offsets = new Map();
    centerLegacyComponents(components, canvasWidth, canvasHeight, [], offsets, report);
    translateTimelinePosition(composition.timeline, offsets);
    return compositionValue;
}
function applyNativeAvatarFrame(target) {
    target.kind = "shape";
    removeFields(target, IMAGE_FIELDS);
    target.shapeStyle = "rounded";
    target.fillColor = "#fff6d8";
    target.fillCss = "";
    target.borderColor = "#17131f";
    target.borderWidth = 6;
    target.borderRadius = 13;
}
function applySprite(target, fallbackMode) {
    target.kind = "sprite";
    target.spriteRenderMode = target.spriteRenderMode === "tinted" || target.spriteRenderMode === "original"
        ? target.spriteRenderMode
        : fallbackMode;
    target.imageObjectFit = ["cover", "contain", "fill"].includes(String(target.imageObjectFit || ""))
        ? target.imageObjectFit
        : "contain";
    if (target.imageTint === undefined || target.imageTint === null || target.imageTint === "")
        target.imageTint = "currentColor";
    removeFields(target, SHAPE_FIELDS);
}
function migrateKeyframeProps(propsValue, kind, renderMode) {
    const props = record(propsValue);
    if (kind === "sprite") {
        applySprite(props, renderMode);
        delete props.kind;
    }
    else {
        applyNativeAvatarFrame(props);
        delete props.kind;
    }
    return props;
}
function migrateTimeline(timelineValue, targets) {
    const timeline = record(timelineValue);
    const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
    for (const trackValue of tracks) {
        const track = record(trackValue);
        const targetId = String(track.targetId || "");
        const targetParts = targetId.split("/").filter(Boolean);
        const target = targets.get(targetId) || targets.get(targetParts[targetParts.length - 1] || "");
        if (!target || !Array.isArray(track.keyframes))
            continue;
        for (const keyframeValue of track.keyframes) {
            const keyframe = record(keyframeValue);
            keyframe.props = migrateKeyframeProps(keyframe.props, target.kind, target.renderMode);
        }
    }
}
function migrateComponent(componentValue, path, targets, report) {
    const component = record(componentValue);
    const id = String(component.id || "");
    const componentPath = [...path, id].filter(Boolean);
    const hasImageSource = Boolean(component.imageAssetId || component.imageDataUrl);
    let migration = null;
    if (component.kind === "shape" && hasImageSource) {
        if (component.imageAssetId === "avatar-frame") {
            migration = { kind: "avatarFrameShape", renderMode: "original" };
            applyNativeAvatarFrame(component);
            report.avatarFrameShapeCount += 1;
        }
        else {
            const renderMode = component.imageTint === "currentColor" ? "tinted" : "original";
            migration = { kind: "sprite", renderMode };
            applySprite(component, renderMode);
            report.spriteCount += 1;
        }
        report.changed = true;
    }
    if (migration) {
        if (id)
            targets.set(id, migration);
        if (componentPath.length)
            targets.set(componentPath.join("/"), migration);
        migrateTimeline(component.timeline, new Map([["self", migration], [id, migration]]));
    }
    for (const child of Array.isArray(component.children) ? component.children : []) {
        migrateComponent(child, componentPath, targets, report);
    }
}
function migrateLegacyArtCompositionSchema(compositionValue, reportValue) {
    const composition = compositionValue;
    const report = reportValue || {
        changed: false,
        spriteCount: 0,
        avatarFrameShapeCount: 0,
        centeredComponentCount: 0,
        resizedCompositionCount: 0,
        compositionIds: []
    };
    const targets = new Map();
    for (const component of Array.isArray(composition.components) ? composition.components : []) {
        migrateComponent(component, [], targets, report);
    }
    migrateTimeline(composition.timeline, targets);
    return compositionValue;
}
function migrateLegacyArtManifestSchema(manifestValue) {
    const manifest = clone(manifestValue || {});
    const root = manifest;
    const report = {
        changed: false,
        spriteCount: 0,
        avatarFrameShapeCount: 0,
        centeredComponentCount: 0,
        resizedCompositionCount: 0,
        compositionIds: []
    };
    const sourceVersion = Number(root.artComponentSchemaVersion || 0);
    if (sourceVersion >= exports.ART_COMPONENT_SCHEMA_VERSION)
        return { manifest, report };
    const compositions = record(root.compositions);
    for (const [compositionId, compositionValue] of Object.entries(compositions)) {
        const changedBefore = report.changed;
        const beforeSprites = report.spriteCount;
        const beforeFrames = report.avatarFrameShapeCount;
        const beforeCentered = report.centeredComponentCount;
        const beforeResized = report.resizedCompositionCount;
        if (sourceVersion < SPRITE_SCHEMA_VERSION)
            migrateLegacyArtCompositionSchema(compositionValue, report);
        if (sourceVersion < CENTERED_COORDINATE_SCHEMA_VERSION) {
            migrateLegacyArtCompositionCoordinates(compositionValue, report, (id) => {
                const resolved = compositions[id];
                return resolved && typeof resolved === "object" && !Array.isArray(resolved) ? record(resolved) : null;
            });
        }
        if (report.spriteCount !== beforeSprites ||
            report.avatarFrameShapeCount !== beforeFrames ||
            report.centeredComponentCount !== beforeCentered ||
            report.resizedCompositionCount !== beforeResized ||
            report.changed !== changedBefore)
            report.compositionIds.push(compositionId);
    }
    if (sourceVersion < VOTING_CARD_ANSWER_GEOMETRY_VERSION) {
        for (const compositionId of normalizeVotingCardAnswerGeometry(compositions, report)) {
            if (!report.compositionIds.includes(compositionId))
                report.compositionIds.push(compositionId);
        }
    }
    root.artComponentSchemaVersion = exports.ART_COMPONENT_SCHEMA_VERSION;
    report.changed = true;
    return { manifest, report };
}
