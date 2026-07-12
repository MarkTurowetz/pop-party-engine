"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ART_COMPONENT_SCHEMA_VERSION = void 0;
exports.migrateLegacyArtCompositionSchema = migrateLegacyArtCompositionSchema;
exports.migrateLegacyArtManifestSchema = migrateLegacyArtManifestSchema;
exports.ART_COMPONENT_SCHEMA_VERSION = 1;
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
    const report = reportValue || { changed: false, spriteCount: 0, avatarFrameShapeCount: 0, compositionIds: [] };
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
    const report = { changed: false, spriteCount: 0, avatarFrameShapeCount: 0, compositionIds: [] };
    if (Number(root.artComponentSchemaVersion || 0) >= exports.ART_COMPONENT_SCHEMA_VERSION)
        return { manifest, report };
    const compositions = record(root.compositions);
    for (const [compositionId, compositionValue] of Object.entries(compositions)) {
        const beforeSprites = report.spriteCount;
        const beforeFrames = report.avatarFrameShapeCount;
        migrateLegacyArtCompositionSchema(compositionValue, report);
        if (report.spriteCount !== beforeSprites || report.avatarFrameShapeCount !== beforeFrames)
            report.compositionIds.push(compositionId);
    }
    root.artComponentSchemaVersion = exports.ART_COMPONENT_SCHEMA_VERSION;
    report.changed = true;
    return { manifest, report };
}
