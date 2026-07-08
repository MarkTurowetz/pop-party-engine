import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from "react";
import type { ArtAsset, ArtComponent, ArtComposition } from "../../types/game-data";
import { PartyGameTextFit } from "../../runtime/textFit";
import { componentSupportsImageMask, normalizeGameTextFontFamily } from "./artComponentSchema";

const ART_PREVIEW_TEXT_INSET = 4;

export interface ArtTextOverride {
  autoFitText?: boolean;
  fontColor?: string;
  fontFamily?: string;
  fontSize?: number;
  text?: string;
}

export interface ArtPreviewRendererProps {
  assetUrlById?: Map<string, string>;
  components: ArtComponent[];
  compositionById: Map<string, ArtComposition>;
  currentColor?: string;
  interactive?: boolean;
  livePosition?: { id: string; x: number; y: number } | null;
  liveTransform?: { id: string; width?: number; height?: number; rotation?: number } | null;
  timelineFrameOverrides?: Record<string, Record<string, unknown>> | null;
  onBeginDrag?: (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => void;
  onBeginResize?: (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => void;
  onBeginRotate?: (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelect?: (id: string, additive: boolean) => void;
  selectedIds?: Set<string>;
  showHandles?: boolean;
  textOverride?: ArtTextOverride;
  textOverrides?: Record<string, ArtTextOverride | string | undefined>;
}

type ArtTextOverrideInput = ArtTextOverride | string | undefined | null;

export function assetUrlMap(assets: ArtAsset[]): Map<string, string> {
  return new Map((assets || []).map((asset) => [asset.id, asset.currentUrl]));
}

export function compositionMap(compositions: ArtComposition[]): Map<string, ArtComposition> {
  return new Map((compositions || []).map((composition) => [composition.id, composition]));
}

function get(component: ArtComponent, key: string): unknown {
  return (component as Record<string, unknown>)[key];
}

function shapeBorderRadius(shapeStyle: string, borderRadius: number): string {
  if (shapeStyle === "circle") return "50%";
  if (shapeStyle === "pill") return "9999px";
  if (shapeStyle === "rectangle") return "0";
  return `${Math.max(borderRadius, 12)}px`;
}

function normalizedTextOverride(value: ArtTextOverrideInput): ArtTextOverride | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { text: value };
  return value;
}

function textValueFor(component: ArtComponent, props: ArtPreviewRendererProps): string {
  const specificOverride = normalizedTextOverride(props.textOverrides?.[component.id]);
  const globalOverride = normalizedTextOverride(props.textOverride);
  const override = specificOverride || globalOverride;
  return String(override?.text ?? get(component, "defaultText") ?? "");
}

function textFieldFor(component: ArtComponent, props: ArtPreviewRendererProps, key: keyof ArtTextOverride, fallback: unknown): unknown {
  const specificOverride = normalizedTextOverride(props.textOverrides?.[component.id]);
  const globalOverride = normalizedTextOverride(props.textOverride);
  if (specificOverride && specificOverride[key] !== undefined) return specificOverride[key];
  if (globalOverride && globalOverride[key] !== undefined) return globalOverride[key];
  return fallback;
}

function artPreviewFontSize(
  component: ArtComponent,
  props: ArtPreviewRendererProps,
  text: string,
  width: number,
  height: number,
  timelineOverride: Record<string, unknown> = {}
): number {
  const fallbackSize = Number(textFieldFor(component, props, "fontSize", timelineOverride.fontSize ?? get(component, "fontSize") ?? 16));
  const fontFamily = normalizeGameTextFontFamily(
    textFieldFor(component, props, "fontFamily", timelineOverride.fontFamily ?? get(component, "fontFamily"))
  );
  const autoFitText =
    textFieldFor(component, props, "autoFitText", timelineOverride.autoFitText ?? get(component, "autoFitText") !== false) !== false;
  const layout = PartyGameTextFit.measureGameText({
    text,
    element: { ...component, width, height, fontSize: fallbackSize, fontFamily, autoFitText },
    fallbackSize,
    options: { fontFamily, lineHeight: 1, paddingX: ART_PREVIEW_TEXT_INSET, textTransform: "uppercase" }
  });
  return Number(layout.fontSize || fallbackSize);
}

export function ArtPreviewRenderer(props: ArtPreviewRendererProps): ReactElement {
  const assetUrls = props.assetUrlById || new Map<string, string>();
  const selectedIds = props.selectedIds || new Set<string>();

  const imageSourceFor = (component: ArtComponent, timelineOverride: Record<string, unknown> = {}): string => {
    const imageDataUrl = String(timelineOverride.imageDataUrl ?? get(component, "imageDataUrl") ?? "");
    const imageAssetId = String(timelineOverride.imageAssetId ?? get(component, "imageAssetId") ?? "");
    return imageDataUrl || assetUrls.get(imageAssetId) || "";
  };

  const referencedCompositionFor = (component: ArtComponent, referencePath: Set<string>): ArtComposition | null => {
    if (component.kind !== "reference") return null;
    const referencedId = String(get(component, "artCompositionId") || "");
    if (!referencedId || referencePath.has(referencedId)) return null;
    return props.compositionById.get(referencedId) || null;
  };

  const renderComponent = (
    component: ArtComponent,
    layer: { index: number; total: number; interactive?: boolean; referencePath?: Set<string>; targetPath?: string[] } = { index: 0, total: 1 }
  ): ReactElement => {
    const targetPath = [...(layer.targetPath || []), component.id].filter(Boolean);
    const scopedTargetId = targetPath.join("/");
    const locked = component.locked === true;
    const interactive = props.interactive !== false && layer.interactive !== false && !locked;
    const referencePath = layer.referencePath || new Set<string>();
    const livePos = props.livePosition?.id === component.id ? props.livePosition : null;
    const liveTx = props.liveTransform?.id === component.id ? props.liveTransform : null;
    const timelineOverride = props.timelineFrameOverrides?.[scopedTargetId] || props.timelineFrameOverrides?.[component.id] || {};
    const timelineValue = (key: string, fallback: unknown): unknown =>
      Object.prototype.hasOwnProperty.call(timelineOverride, key) ? timelineOverride[key] : fallback;
    const x = livePos ? livePos.x : Number(timelineValue("x", get(component, "x") || 0));
    const y = livePos ? livePos.y : Number(timelineValue("y", get(component, "y") || 0));
    const width = liveTx?.width ?? Number(timelineValue("width", get(component, "width") || 1));
    const height = liveTx?.height ?? Number(timelineValue("height", get(component, "height") || 1));
    const kind = component.kind;
    const isTextual = kind === "text" || kind === "badge";
    const fillCss = String(timelineValue("fillCss", get(component, "fillCss") || ""));
    const fillColor = String(timelineValue("fillColor", get(component, "fillColor") || "transparent"));
    const borderColor = String(timelineValue("borderColor", get(component, "borderColor") || "transparent"));
    const borderWidth = Number(timelineValue("borderWidth", get(component, "borderWidth") || 0));
    const scale = Number(timelineValue("scale", get(component, "scale") || 1));
    const rotation = liveTx?.rotation ?? Number(timelineValue("rotation", get(component, "rotation") || 0));
    const imageUrl = componentSupportsImageMask(component) ? imageSourceFor(component, timelineOverride) : "";
    const objectFit = String(timelineValue("imageObjectFit", get(component, "imageObjectFit") || "cover"));
    const selected = interactive && selectedIds.has(component.id);
    const imageTint = String(timelineValue("imageTint", get(component, "imageTint") || ""));
    const tintWithCurrentColor = Boolean(imageUrl && imageTint === "currentColor");
    const referencedComposition = referencedCompositionFor(component, referencePath);
    const referenceCanvas = referencedComposition?.canvas || { width, height };
    const referenceScaleX = width / Math.max(1, Number(referenceCanvas.width || width));
    const referenceScaleY = height / Math.max(1, Number(referenceCanvas.height || height));
    const maskSize = objectFit === "fill" ? "100% 100%" : objectFit;
    const transparentBase = kind === "container" || kind === "reference";
    const clipsOwnContent = Boolean(imageUrl || isTextual);
    const textOverrideValue = timelineValue("defaultText", timelineValue("text", undefined));
    const textValue = textOverrideValue === undefined ? textValueFor(component, props) : String(textOverrideValue);
    const fontFamily = normalizeGameTextFontFamily(textFieldFor(component, props, "fontFamily", timelineValue("fontFamily", get(component, "fontFamily"))));
    const fontSize = isTextual ? artPreviewFontSize(component, props, textValue, width, height, timelineOverride) : 11;
    const fill = fillColor === "currentColor" ? "currentColor" : fillColor;
    const background = tintWithCurrentColor
      ? (fill === "transparent" ? "currentColor" : fill || "currentColor")
      : imageUrl
        ? "transparent"
        : fillCss || (fill === "transparent" ? (transparentBase ? "transparent" : "rgba(255,255,255,0.06)") : fill);
    const fontColor = String(textFieldFor(component, props, "fontColor", timelineValue("fontColor", get(component, "fontColor") || "#17131f")));

    const style: CSSProperties = {
      position: "absolute",
      left: x - width / 2,
      top: y - height / 2,
      width,
      height,
      transform: `scale(${scale}) rotate(${rotation}deg)`,
      transformOrigin: "center",
      borderRadius: shapeBorderRadius(
        String(timelineValue("shapeStyle", get(component, "shapeStyle") || "rounded")),
        Number(timelineValue("borderRadius", get(component, "borderRadius") || 0))
      ),
      background,
      backgroundImage: imageUrl && !tintWithCurrentColor ? `url(${imageUrl})` : undefined,
      backgroundSize: imageUrl && !tintWithCurrentColor ? objectFit : undefined,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      WebkitMaskImage: tintWithCurrentColor ? `url(${imageUrl})` : undefined,
      maskImage: tintWithCurrentColor ? `url(${imageUrl})` : undefined,
      WebkitMaskSize: tintWithCurrentColor ? maskSize : undefined,
      maskSize: tintWithCurrentColor ? maskSize : undefined,
      WebkitMaskPosition: tintWithCurrentColor ? "center" : undefined,
      maskPosition: tintWithCurrentColor ? "center" : undefined,
      WebkitMaskRepeat: tintWithCurrentColor ? "no-repeat" : undefined,
      maskRepeat: tintWithCurrentColor ? "no-repeat" : undefined,
      border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : "0",
      opacity: Number(timelineValue("opacity", 1)),
      outline: selected ? "2px solid #22d3ee" : "none",
      display: timelineValue("visible", true) === false ? "none" : "flex",
      alignItems: "center",
      justifyContent: "center",
      color:
        fillColor === "currentColor" || imageTint === "currentColor"
          ? "var(--art-preview-current-color)"
          : fontColor,
      fontFamily: isTextual ? fontFamily : undefined,
      fontSize,
      fontWeight: isTextual ? 1000 : undefined,
      lineHeight: isTextual ? 1 : undefined,
      textTransform: isTextual ? "uppercase" : undefined,
      overflow: clipsOwnContent ? "hidden" : "visible",
      boxSizing: "border-box",
      zIndex: Math.max(1, layer.total - layer.index),
      pointerEvents: interactive ? "auto" : "none"
    };

    return (
      <div
        key={component.id}
        className="art-canvas-component"
        data-art-canvas-component={component.id}
        data-art-component-kind={kind}
        aria-current={selected ? "true" : undefined}
        style={style}
        data-art-component-locked={locked ? "true" : "false"}
        onPointerDown={interactive && props.onBeginDrag ? (event) => props.onBeginDrag?.(component, event) : undefined}
        onClick={
          interactive && props.onSelect
            ? (event) => {
                event.stopPropagation();
                props.onSelect?.(component.id, event.metaKey || event.ctrlKey || event.shiftKey);
              }
            : undefined
        }
      >
        {isTextual ? (
          <span
            style={{
              overflowWrap:
                textFieldFor(component, props, "autoFitText", timelineOverride.autoFitText ?? get(component, "autoFitText") !== false) !== false
                  ? "normal"
                  : "anywhere",
              wordBreak:
                textFieldFor(component, props, "autoFitText", timelineOverride.autoFitText ?? get(component, "autoFitText") !== false) !== false
                  ? "keep-all"
                  : "normal"
            }}
          >
            {textValue}
          </span>
        ) : null}
        {referencedComposition ? (
          <div
            className="art-reference-canvas"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: Number(referenceCanvas.width || width),
              height: Number(referenceCanvas.height || height),
              transform: `scale(${referenceScaleX}, ${referenceScaleY})`,
              transformOrigin: "top left",
              pointerEvents: "none"
            }}
          >
            {(referencedComposition.components || []).map((child, index) =>
              renderComponent(child, {
                index,
                total: referencedComposition.components?.length || 1,
                interactive: false,
                referencePath: new Set([...referencePath, referencedComposition.id]),
                targetPath: scopedTargetId ? [scopedTargetId] : []
              })
            )}
          </div>
        ) : null}
        {(component.children || []).map((child, index) =>
          renderComponent(child, { index, total: component.children?.length || 1, interactive, referencePath, targetPath })
        )}
        {selected && props.showHandles !== false ? (
          <>
            <div
              data-art-resize-handle={component.id}
              onPointerDown={props.onBeginResize ? (event) => props.onBeginResize?.(component, event) : undefined}
              style={{
                position: "absolute",
                right: -6,
                bottom: -6,
                width: 12,
                height: 12,
                background: "#22d3ee",
                border: "1px solid #17131f",
                cursor: "nwse-resize"
              }}
            />
            <div
              data-art-rotate-handle={component.id}
              onPointerDown={props.onBeginRotate ? (event) => props.onBeginRotate?.(component, event) : undefined}
              style={{
                position: "absolute",
                left: "50%",
                top: -22,
                width: 12,
                height: 12,
                marginLeft: -6,
                borderRadius: "50%",
                background: "#ffe156",
                border: "1px solid #17131f",
                cursor: "grab"
              }}
            />
          </>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {(props.components || []).map((component, index) =>
        renderComponent(component, { index, total: props.components?.length || 1 })
      )}
    </>
  );
}
