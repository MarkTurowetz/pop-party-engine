export interface ArtComponentLike {
    kind?: unknown;
    imageDataUrl?: unknown;
    imageAssetId?: unknown;
    defaultText?: unknown;
}
export interface ImageFileLike {
    type?: unknown;
    size?: unknown;
}
export interface LabeledValueOption {
    value: string;
    label: string;
}
export interface TransformOriginOption extends LabeledValueOption {
    x: number;
    y: number;
}
export declare const componentKinds: string[];
export declare const creatableComponentKinds: string[];
export declare const shapeStyleOptions: LabeledValueOption[];
export declare const shapeStyleValues: string[];
export declare const imageMimeTypes: string[];
export declare const imageObjectFits: string[];
export declare const spriteRenderModes: string[];
export declare const containerDistributionOptions: LabeledValueOption[];
export declare const containerDistributionValues: string[];
export declare const transformOriginOptions: TransformOriginOption[];
export declare const transformOriginValues: string[];
export declare const defaultTextFontFamily: string;
export declare const textFontFamilyOptions: LabeledValueOption[];
export declare const textFontFamilyValues: string[];
export declare const componentImageMaxBytes: number;
export declare const imageAccept: string;
export declare function normalizeComponentKind(value: unknown, fallback?: string): string;
export declare function normalizeCreatableComponentKind(value: unknown, fallback?: string): string;
export declare function componentKindFrom(componentOrKind: unknown): string;
export declare function componentKindLabel(kind: unknown): string;
export declare function componentSupportsShapeStyle(componentOrKind: unknown): boolean;
export declare function defaultShapeStyle(kind: unknown): string;
export declare function normalizeShapeStyle(value: unknown, kind?: unknown): string;
export declare function componentSupportsSpriteSource(componentOrKind: unknown): boolean;
export declare function componentHasSpriteSource(component: ArtComponentLike | null | undefined): boolean;
export declare function componentSpriteDataUrl(component: ArtComponentLike | null | undefined): string;
export declare const componentSupportsImageMask: typeof componentSupportsSpriteSource;
export declare const componentHasImageMask: typeof componentHasSpriteSource;
export declare const componentImageMaskDataUrl: typeof componentSpriteDataUrl;
export declare function componentLabel(component: ArtComponentLike | null | undefined): string;
export declare function normalizeImageObjectFit(value: unknown): string;
export declare function normalizeSpriteRenderMode(value: unknown): string;
export declare function normalizeContainerDistribution(value: unknown): string;
export declare function normalizeTransformOrigin(value: unknown): string;
export declare function transformOriginCss(value: unknown): string;
export declare function normalizeTextFontFamily(value: unknown, fallback?: unknown): string;
export declare function isSupportedImageMimeType(mimeType: unknown): boolean;
export declare function parseImageDataUrl(dataUrl: unknown): { mimeType: string; base64: string } | null;
export declare function imageBase64ByteLength(base64: unknown): number;
export declare function validateImageFile(file: ImageFileLike | null | undefined): string;
export declare function normalizeFillCss(value: unknown): string;
