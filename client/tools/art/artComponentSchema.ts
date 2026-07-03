/**
 * Typed port of shared/art-component-schema.js — the art component kind/style
 * normalization used by composition serialization and the component inspector.
 * (Phase 5 unifies shared/ to TS; until then this is the byte-compatible client copy.)
 */
import type { ArtComponent } from "../../types/game-data";
import { gameTextDefaultFontFamily, gameTextFontOptions, normalizeGameTextFontFamily } from "../../textFonts";

export const componentKinds = ["text", "shape", "container", "badge", "reference"] as const;
export const creatableComponentKinds = ["text", "shape", "container", "reference"] as const;
export const shapeStyleOptions = [
  { value: "rounded", label: "Rounded" },
  { value: "rectangle", label: "Rectangle" },
  { value: "pill", label: "Pill" },
  { value: "circle", label: "Circle" }
] as const;
const shapeStyleValues = shapeStyleOptions.map((option) => option.value as string);
const imageMimeTypes = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
const imageObjectFits = ["cover", "contain", "fill"];
export const containerDistributionOptions = [
  { value: "none", label: "None" },
  { value: "horizontal", label: "Horizontal Distribution" },
  { value: "vertical", label: "Vertical Distribution" }
] as const;
export const textFontFamilyOptions = gameTextFontOptions;
export const defaultTextFontFamily = gameTextDefaultFontFamily;
export { normalizeGameTextFontFamily };
const containerDistributionValues = containerDistributionOptions.map((option) => option.value as string);
const componentImageMaxBytes = 5 * 1024 * 1024;
const fillCssMaxLength = 240;

type ComponentLike = Partial<ArtComponent> | string | null | undefined;

function normalizeValue(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function normalizeComponentKind(value: unknown, fallback = "shape"): string {
  const kind = normalizeValue(value || fallback || "shape");
  return (componentKinds as readonly string[]).includes(kind) ? kind : "shape";
}

export function normalizeCreatableComponentKind(value: unknown, fallback = "shape"): string {
  const kind = normalizeValue(value || fallback || "shape");
  return (creatableComponentKinds as readonly string[]).includes(kind) ? kind : "shape";
}

function componentKindFrom(componentOrKind: ComponentLike): string {
  if (!componentOrKind) return "";
  if (typeof componentOrKind === "object") return normalizeComponentKind(componentOrKind.kind);
  return normalizeComponentKind(componentOrKind);
}

export function componentKindLabel(kind: unknown): string {
  const cleanKind = normalizeComponentKind(kind);
  if (cleanKind === "text") return "Text";
  if (cleanKind === "container") return "Container";
  if (cleanKind === "badge") return "Badge";
  if (cleanKind === "reference") return "Reference";
  return "Shape";
}

export function componentSupportsShapeStyle(componentOrKind: ComponentLike): boolean {
  const kind = componentKindFrom(componentOrKind);
  return kind === "shape" || kind === "container" || kind === "badge";
}

export function defaultShapeStyle(kind: unknown): string {
  return normalizeComponentKind(kind) === "container" ? "rectangle" : "rounded";
}

export function normalizeShapeStyle(value: unknown, kind: unknown = "shape"): string {
  const style = normalizeValue(value || defaultShapeStyle(kind));
  return shapeStyleValues.includes(style) ? style : defaultShapeStyle(kind);
}

export function componentSupportsImageMask(componentOrKind: ComponentLike): boolean {
  return componentKindFrom(componentOrKind) === "shape";
}

export function componentHasImageMask(component: Partial<ArtComponent> | null | undefined): boolean {
  return (
    componentSupportsImageMask(component) &&
    Boolean((component as Record<string, unknown>)?.imageDataUrl || (component as Record<string, unknown>)?.imageAssetId)
  );
}

export function normalizeImageObjectFit(value: unknown): string {
  const fit = normalizeValue(value || "cover");
  return imageObjectFits.includes(fit) ? fit : "cover";
}

export function normalizeContainerDistribution(value: unknown): string {
  const distribution = normalizeValue(value || "none");
  return containerDistributionValues.includes(distribution) ? distribution : "none";
}

export function isSupportedImageMimeType(mimeType: unknown): boolean {
  return imageMimeTypes.includes(String(mimeType || "").trim().toLowerCase());
}

export function validateImageFile(file: File | null | undefined): string {
  if (!file) return "Choose an image file first.";
  if (!isSupportedImageMimeType(file.type)) return "Use PNG, SVG, JPG, or WEBP.";
  const size = Number(file.size || 0);
  if (size <= 0 || size > componentImageMaxBytes) return "Image masks must be under 5 MB.";
  return "";
}

export function normalizeFillCss(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > fillCssMaxLength) return "";
  if (!/^[a-zA-Z0-9#%.,()*_\-\s]+$/.test(text)) return "";
  if (!/\b(?:linear-gradient|radial-gradient|conic-gradient)\(/.test(text)) return "";
  return text;
}
