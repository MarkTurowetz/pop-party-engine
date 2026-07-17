import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  useMemo
} from "react";
import type { ArtAsset, ArtComponent, ArtComposition } from "../../types/game-data";
import { gameTextHtml } from "../../runtime/gameTextMarkup";
import type { ArtCanvasLivePositions } from "./artCanvasTransformTransaction";
import { artReferenceFrameZeroOverrides } from "./artReferenceFrameOverrides";
import { PartyGameTextFit } from "../../runtime/textFit";
import {
  componentSupportsShapeStyle,
  componentSupportsSpriteSource,
  normalizeGameTextFontFamily,
  normalizeSpriteRenderMode,
  normalizeTransformOrigin,
  transformOriginCss,
  transformOriginOptions
} from "./artComponentSchema";

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
  livePositions?: ArtCanvasLivePositions | null;
  liveTransform?: { id: string; width?: number; height?: number; scale?: number; rotation?: number } | null;
  liveTransformOrigin?: { id: string; value: string } | null;
  timelineFrameOverrides?: Record<string, Record<string, unknown>> | null;
  onBeginDrag?: (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => void;
  onBeginResize?: (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => void;
  onBeginRotate?: (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => void;
  onBeginTransformOrigin?: (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpenTimelineScope?: (component: ArtComponent, event: ReactMouseEvent<HTMLDivElement>) => void;
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
  const referenceFrameOverrides = useMemo(
    () => artReferenceFrameZeroOverrides(props.components || [], props.compositionById),
    [props.components, props.compositionById]
  );

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
    layer: {
      contentOpacity?: number;
      index: number;
      total: number;
      interactive?: boolean;
      referencePath?: Set<string>;
      targetPath?: string[];
    } = { index: 0, total: 1 }
  ): ReactElement => {
    const targetPath = [...(layer.targetPath || []), component.id].filter(Boolean);
    const scopedTargetId = targetPath.join("/");
    const locked = component.locked === true;
    const interactive = props.interactive !== false && layer.interactive !== false && !locked;
    const referencePath = layer.referencePath || new Set<string>();
    const livePos = props.livePositions?.[component.id] || null;
    const liveTx = props.liveTransform?.id === component.id ? props.liveTransform : null;
    const liveOrigin = props.liveTransformOrigin?.id === component.id ? props.liveTransformOrigin.value : null;
    const unscopedTimelineOverride = targetPath.length === 1 ? props.timelineFrameOverrides?.[component.id] : undefined;
    const explicitTimelineOverride = props.timelineFrameOverrides?.[scopedTargetId] || unscopedTimelineOverride || {};
    const timelineOverride = { ...(referenceFrameOverrides[scopedTargetId] || {}), ...explicitTimelineOverride };
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
    const scale = liveTx?.scale ?? Number(timelineValue("scale", get(component, "scale") || 1));
    const rotation = liveTx?.rotation ?? Number(timelineValue("rotation", get(component, "rotation") || 0));
    const transformOrigin = normalizeTransformOrigin(liveOrigin || get(component, "transformOrigin"));
    const transformOriginOption = transformOriginOptions.find((option) => option.value === transformOrigin) || transformOriginOptions[8];
    const editorHidden = component.editorHidden === true && layer.interactive !== false;
    const ownOpacity = Number(timelineValue("opacity", get(component, "opacity") ?? 1));
    const brightness = Math.max(0, Number(timelineValue("brightness", get(component, "brightness") ?? 1)));
    const inheritedContentOpacity = Number(layer.contentOpacity ?? 1);
    const contentOpacity = Math.max(0, Math.min(1, inheritedContentOpacity * ownOpacity));
    const imageUrl = componentSupportsSpriteSource(component) ? imageSourceFor(component, timelineOverride) : "";
    const objectFit = String(timelineValue("imageObjectFit", get(component, "imageObjectFit") || "contain"));
    const selected = selectedIds.has(component.id);
    const imageTint = String(timelineValue("imageTint", get(component, "imageTint") || ""));
    const spriteRenderMode = normalizeSpriteRenderMode(timelineValue("spriteRenderMode", get(component, "spriteRenderMode")));
    const tintedSprite = Boolean(imageUrl && kind === "sprite" && spriteRenderMode === "tinted");
    const spriteTint = imageTint === "currentColor" ? "var(--art-preview-current-color)" : imageTint || "currentColor";
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
    const background = tintedSprite
      ? spriteTint
      : imageUrl
        ? "transparent"
        : fillCss || (fill === "transparent" ? (transparentBase ? "transparent" : "rgba(255,255,255,0.06)") : fill);
    const fontColor = String(textFieldFor(component, props, "fontColor", timelineValue("fontColor", get(component, "fontColor") || "#17131f")));

    const chromeVisible = layer.interactive !== false && (selected || contentOpacity <= 0.01);
    const containerGuideVisible = kind === "container" && props.interactive !== false && layer.interactive !== false;

    const style: CSSProperties = {
      position: "absolute",
      left: x - width / 2,
      top: y - height / 2,
      width,
      height,
      transform: `scale(${scale}) rotate(${rotation}deg)`,
      transformOrigin: transformOriginCss(transformOrigin),
      boxSizing: "border-box",
      zIndex: Math.max(1, layer.total - layer.index),
      pointerEvents: interactive && !editorHidden ? "auto" : "none",
      visibility: editorHidden ? "hidden" : "visible",
      filter: `brightness(${brightness})`,
      userSelect: "none"
    };

    const visualStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      borderRadius: componentSupportsShapeStyle(component)
        ? shapeBorderRadius(
            String(timelineValue("shapeStyle", get(component, "shapeStyle") || "rounded")),
            Number(timelineValue("borderRadius", get(component, "borderRadius") || 0))
          )
        : "0",
      background,
      backgroundImage: imageUrl && !tintedSprite ? `url(${imageUrl})` : undefined,
      backgroundSize: imageUrl && !tintedSprite ? objectFit : undefined,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      WebkitMaskImage: tintedSprite ? `url(${imageUrl})` : undefined,
      maskImage: tintedSprite ? `url(${imageUrl})` : undefined,
      WebkitMaskSize: tintedSprite ? maskSize : undefined,
      maskSize: tintedSprite ? maskSize : undefined,
      WebkitMaskPosition: tintedSprite ? "center" : undefined,
      maskPosition: tintedSprite ? "center" : undefined,
      WebkitMaskRepeat: tintedSprite ? "no-repeat" : undefined,
      maskRepeat: tintedSprite ? "no-repeat" : undefined,
      border: componentSupportsShapeStyle(component) && borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : "0",
      opacity: contentOpacity,
      display: "flex",
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
      pointerEvents: "none"
    };

    const chromeStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      borderRadius: visualStyle.borderRadius,
      border: selected ? "2px solid #ffe156" : "1.5px solid rgba(255, 225, 86, 0.86)",
      boxShadow: selected ? "0 0 0 2px rgba(23, 19, 31, 0.26), 0 0 0 5px rgba(255, 225, 86, 0.2)" : "none",
      pointerEvents: "none",
      boxSizing: "border-box",
      opacity: 1
    };

    const containerGuideStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      background: "rgba(34, 211, 238, 0.1)",
      border: "1px dashed rgba(23, 19, 31, 0.38)",
      boxSizing: "border-box",
      pointerEvents: "none"
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
        onDoubleClick={interactive && props.onOpenTimelineScope ? (event) => props.onOpenTimelineScope?.(component, event) : undefined}
      >
        {containerGuideVisible ? <div data-art-container-bounds style={containerGuideStyle} /> : null}
        <div className="art-canvas-component-visual" style={visualStyle}>
          {isTextual ? (
            <span
              className="art-canvas-component-text"
              dangerouslySetInnerHTML={{ __html: gameTextHtml(textValue) }}
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
            />
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
                  targetPath: scopedTargetId ? [scopedTargetId] : [],
                  contentOpacity
                })
              )}
            </div>
          ) : null}
        </div>
        {(component.children || []).map((child, index) =>
          renderComponent(child, { index, total: component.children?.length || 1, interactive, referencePath, targetPath, contentOpacity })
        )}
        {chromeVisible ? <div className="art-canvas-component-chrome" style={chromeStyle} /> : null}
        {selected && interactive && props.showHandles !== false ? (
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
                background: "#ffe156",
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
            <div
              data-art-transform-origin-handle={component.id}
              data-art-transform-origin={transformOrigin}
              title={`Transform origin: ${transformOriginOption.label}`}
              onPointerDown={props.onBeginTransformOrigin ? (event) => props.onBeginTransformOrigin?.(component, event) : undefined}
              style={{
                position: "absolute",
                left: `${transformOriginOption.x}%`,
                top: `${transformOriginOption.y}%`,
                width: 13,
                height: 13,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background: "#22d3ee",
                border: "2px solid #17131f",
                boxShadow: "0 0 0 2px rgba(255,255,255,0.8)",
                cursor: "move",
                pointerEvents: "auto"
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
