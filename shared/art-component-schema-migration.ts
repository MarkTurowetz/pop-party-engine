export const ART_COMPONENT_SCHEMA_VERSION = 1;

type Dict = Record<string, unknown>;
type MigrationKind = "sprite" | "avatarFrameShape";

const IMAGE_FIELDS = ["imageDataUrl", "imageAssetId", "imageName", "imageMimeType", "imageObjectFit", "imageTint"];
const SHAPE_FIELDS = ["shapeStyle", "fillColor", "fillCss", "borderColor", "borderWidth", "borderRadius"];

export interface ArtComponentSchemaMigrationReport {
  changed: boolean;
  spriteCount: number;
  avatarFrameShapeCount: number;
  compositionIds: string[];
}

function record(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {};
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function removeFields(target: Dict, fields: string[]): void {
  for (const field of fields) delete target[field];
}

function applyNativeAvatarFrame(target: Dict): void {
  target.kind = "shape";
  removeFields(target, IMAGE_FIELDS);
  target.shapeStyle = "rounded";
  target.fillColor = "#fff6d8";
  target.fillCss = "";
  target.borderColor = "#17131f";
  target.borderWidth = 6;
  target.borderRadius = 13;
}

function applySprite(target: Dict, fallbackMode: string): void {
  target.kind = "sprite";
  target.spriteRenderMode = target.spriteRenderMode === "tinted" || target.spriteRenderMode === "original"
    ? target.spriteRenderMode
    : fallbackMode;
  target.imageObjectFit = ["cover", "contain", "fill"].includes(String(target.imageObjectFit || ""))
    ? target.imageObjectFit
    : "contain";
  if (target.imageTint === undefined || target.imageTint === null || target.imageTint === "") target.imageTint = "currentColor";
  removeFields(target, SHAPE_FIELDS);
}

function migrateKeyframeProps(propsValue: unknown, kind: MigrationKind, renderMode: string): Dict {
  const props = record(propsValue);
  if (kind === "sprite") {
    applySprite(props, renderMode);
    delete props.kind;
  } else {
    applyNativeAvatarFrame(props);
    delete props.kind;
  }
  return props;
}

function migrateTimeline(timelineValue: unknown, targets: Map<string, { kind: MigrationKind; renderMode: string }>): void {
  const timeline = record(timelineValue);
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  for (const trackValue of tracks) {
    const track = record(trackValue);
    const targetId = String(track.targetId || "");
    const targetParts = targetId.split("/").filter(Boolean);
    const target = targets.get(targetId) || targets.get(targetParts[targetParts.length - 1] || "");
    if (!target || !Array.isArray(track.keyframes)) continue;
    for (const keyframeValue of track.keyframes) {
      const keyframe = record(keyframeValue);
      keyframe.props = migrateKeyframeProps(keyframe.props, target.kind, target.renderMode);
    }
  }
}

function migrateComponent(
  componentValue: unknown,
  path: string[],
  targets: Map<string, { kind: MigrationKind; renderMode: string }>,
  report: ArtComponentSchemaMigrationReport
): void {
  const component = record(componentValue);
  const id = String(component.id || "");
  const componentPath = [...path, id].filter(Boolean);
  const hasImageSource = Boolean(component.imageAssetId || component.imageDataUrl);
  let migration: { kind: MigrationKind; renderMode: string } | null = null;
  if (component.kind === "shape" && hasImageSource) {
    if (component.imageAssetId === "avatar-frame") {
      migration = { kind: "avatarFrameShape", renderMode: "original" };
      applyNativeAvatarFrame(component);
      report.avatarFrameShapeCount += 1;
    } else {
      const renderMode = component.imageTint === "currentColor" ? "tinted" : "original";
      migration = { kind: "sprite", renderMode };
      applySprite(component, renderMode);
      report.spriteCount += 1;
    }
    report.changed = true;
  }
  if (migration) {
    if (id) targets.set(id, migration);
    if (componentPath.length) targets.set(componentPath.join("/"), migration);
    migrateTimeline(component.timeline, new Map([["self", migration], [id, migration]]));
  }
  for (const child of Array.isArray(component.children) ? component.children : []) {
    migrateComponent(child, componentPath, targets, report);
  }
}

export function migrateLegacyArtCompositionSchema<T>(compositionValue: T, reportValue?: ArtComponentSchemaMigrationReport): T {
  const composition = compositionValue as unknown as Dict;
  const report = reportValue || { changed: false, spriteCount: 0, avatarFrameShapeCount: 0, compositionIds: [] };
  const targets = new Map<string, { kind: MigrationKind; renderMode: string }>();
  for (const component of Array.isArray(composition.components) ? composition.components : []) {
    migrateComponent(component, [], targets, report);
  }
  migrateTimeline(composition.timeline, targets);
  return compositionValue;
}

export function migrateLegacyArtManifestSchema<T>(manifestValue: T): { manifest: T; report: ArtComponentSchemaMigrationReport } {
  const manifest = clone(manifestValue || ({} as T));
  const root = manifest as unknown as Dict;
  const report: ArtComponentSchemaMigrationReport = { changed: false, spriteCount: 0, avatarFrameShapeCount: 0, compositionIds: [] };
  if (Number(root.artComponentSchemaVersion || 0) >= ART_COMPONENT_SCHEMA_VERSION) return { manifest, report };
  const compositions = record(root.compositions);
  for (const [compositionId, compositionValue] of Object.entries(compositions)) {
    const beforeSprites = report.spriteCount;
    const beforeFrames = report.avatarFrameShapeCount;
    migrateLegacyArtCompositionSchema(compositionValue, report);
    if (report.spriteCount !== beforeSprites || report.avatarFrameShapeCount !== beforeFrames) report.compositionIds.push(compositionId);
  }
  root.artComponentSchemaVersion = ART_COMPONENT_SCHEMA_VERSION;
  report.changed = true;
  return { manifest, report };
}
