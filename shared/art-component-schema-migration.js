"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ART_COMPONENT_SCHEMA_VERSION = void 0;
exports.migrateLegacyArtCompositionCoordinates = migrateLegacyArtCompositionCoordinates;
exports.migrateLegacyArtCompositionSchema = migrateLegacyArtCompositionSchema;
exports.migrateLegacyArtManifestSchema = migrateLegacyArtManifestSchema;
exports.ART_COMPONENT_SCHEMA_VERSION = 2;
const SPRITE_SCHEMA_VERSION = 1;
const CENTERED_COORDINATE_SCHEMA_VERSION = 2;
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
    root.artComponentSchemaVersion = exports.ART_COMPONENT_SCHEMA_VERSION;
    report.changed = true;
    return { manifest, report };
}
