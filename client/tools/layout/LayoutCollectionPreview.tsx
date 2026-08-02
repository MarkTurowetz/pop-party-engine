import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { ArtComponent, ArtComposition, LayoutElement } from "../../types/game-data";
import {
  choiceCollectionItemDimensions,
  choiceCollectionLayoutStyle
} from "../../runtime/controllerChoiceCollectionLayout";
import { ArtPreviewRenderer } from "../art/ArtPreviewRenderer";

export interface GamePluginChoiceCollectionBinding {
  kind: "choiceCollection";
  layoutElementId: string;
  item: { artCompositionId: string; targetComponentId: string };
}

export interface GamePluginInputManifest {
  controller?: {
    bindings?: GamePluginChoiceCollectionBinding[];
    submitted?: { bindings?: GamePluginChoiceCollectionBinding[] };
  };
}

export interface GamePluginRendererBinding {
  id?: string;
  kind?: "collection" | "component" | "state" | "text" | string;
  source?: string;
  targetComponentId?: string;
  property?: string;
  fallback?: unknown;
  item?: {
    keySource?: string;
    artCompositionId?: string;
    bindings?: GamePluginRendererBinding[];
  };
}

export interface GamePluginRendererManifest {
  id?: string;
  surface?: "stage" | "controller";
  target?: { layoutElementId?: string };
  bindings?: GamePluginRendererBinding[];
}

const ROOT_PREVIEW_LABELS = ["Option", "A realistic long private option label", "Option"];

export function choiceCollectionBindingForElement(
  inputs: GamePluginInputManifest[],
  elementId: string
): GamePluginChoiceCollectionBinding | null {
  for (const input of inputs) {
    const bindings = [
      ...(input.controller?.bindings || []),
      ...(input.controller?.submitted?.bindings || [])
    ];
    const binding = bindings.find((candidate) =>
      candidate.kind === "choiceCollection" && candidate.layoutElementId === elementId
    );
    if (binding) return binding;
  }
  return null;
}

export function rendererCollectionBindingForElement(
  renderers: GamePluginRendererManifest[],
  surface: "stage" | "controller",
  elementId: string
): GamePluginRendererBinding | null {
  const renderer = renderers.find((candidate) =>
    candidate.surface === surface && candidate.target?.layoutElementId === elementId
  );
  return renderer?.bindings?.find((binding) => binding.kind === "collection") || null;
}

function collectionComposition(
  compositionById: Map<string, ArtComposition>,
  surface: "stage" | "controller",
  compositionId: string
): ArtComposition | null {
  const composition = compositionById.get(compositionId) || null;
  if (!composition) return null;
  return String(composition.surface || "").toLowerCase() === surface
    && String(composition.compositionKind || "gameObject").toLowerCase() === "gameobject"
    ? composition
    : null;
}

function previewValue(binding: GamePluginRendererBinding, index: number): unknown {
  if (Object.prototype.hasOwnProperty.call(binding, "fallback")) return binding.fallback;
  const sourceName = String(binding.source || "").split(".").filter(Boolean).at(-1) || "";
  if (!/(label|name|title|text|value|score|rank|count)$/i.test(sourceName)) return undefined;
  const readable = sourceName.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").trim();
  return `Preview ${readable || "value"} ${index + 1}`;
}

function rendererPreviewOverrides(
  bindings: GamePluginRendererBinding[],
  index: number
): {
  textOverrides: Record<string, string>;
  timelineFrameOverrides: Record<string, Record<string, unknown>>;
} {
  const textOverrides: Record<string, string> = {};
  const timelineFrameOverrides: Record<string, Record<string, unknown>> = {};
  for (const binding of bindings) {
    if (binding.kind !== "text" && binding.kind !== "component") continue;
    const targetComponentId = String(binding.targetComponentId || "");
    if (!targetComponentId) continue;
    const value = previewValue(binding, index);
    if (value === undefined) continue;
    if (binding.kind === "text" || binding.property === "defaultText") {
      textOverrides[targetComponentId] = String(value ?? "");
      continue;
    }
    const property = String(binding.property || "");
    const previewProperty = property === "fill"
      ? "fillColor"
      : property === "isShown"
        ? "opacity"
        : property;
    if (!["brightness", "fillColor", "imageTint", "opacity", "rotation", "scale"].includes(previewProperty)) continue;
    timelineFrameOverrides[targetComponentId] = {
      ...(timelineFrameOverrides[targetComponentId] || {}),
      [previewProperty]: property === "isShown" ? (value ? 1 : 0) : value
    };
  }
  return { textOverrides, timelineFrameOverrides };
}

function collectionLayoutForTarget(component: ArtComponent): Record<string, unknown> {
  return {
    width: Number(component.width || 1),
    height: Number(component.height || 1),
    collectionDirection:
      String(component.childDistribution || "horizontal").toLowerCase() === "vertical"
        ? "vertical"
        : "horizontal",
    collectionDistribution: "start",
    collectionAlignment: "center",
    collectionGap: 0,
    collectionPadding: 0,
    collectionOverflow: "visible"
  };
}

function componentMatchesTarget(
  component: ArtComponent,
  scopedTargetId: string,
  targetComponentId: string
): boolean {
  return targetComponentId === component.id
    || targetComponentId === scopedTargetId
    || scopedTargetId.endsWith(`/${targetComponentId}`);
}

function rendererItems(props: {
  assetUrlById: Map<string, string>;
  binding: GamePluginRendererBinding;
  compositionById: Map<string, ArtComposition>;
  layout: Record<string, unknown>;
  path: string;
  surface: "stage" | "controller";
}): ReactNode[] {
  const definition = props.binding.item;
  const compositionId = String(definition?.artCompositionId || "");
  const composition = collectionComposition(props.compositionById, props.surface, compositionId);
  const bindings = Array.isArray(definition?.bindings) ? definition.bindings : [];
  const dimensions = composition
    ? choiceCollectionItemDimensions(props.layout, composition as unknown as Record<string, unknown>, ROOT_PREVIEW_LABELS.length)
    : {
        width: String(props.layout.collectionDirection || "vertical") === "horizontal"
          ? 96
          : Math.max(1, Number(props.layout.width || 96)),
        height: 72
      };
  const itemCanvas = composition?.canvas || dimensions;

  return ROOT_PREVIEW_LABELS.map((label, index) => {
    const overrides = rendererPreviewOverrides(bindings, index);
    return (
      <div
        data-layout-renderer-collection-preview-item
        data-layout-renderer-collection-preview-path={props.path}
        key={`${props.path}-preview-${index}`}
        style={{
          position: "relative",
          boxSizing: "border-box",
          flex: "0 0 auto",
          width: dimensions.width,
          height: dimensions.height,
          minWidth: 0,
          display: "grid",
          placeItems: "center",
          padding: composition ? 0 : 8,
          border: composition ? 0 : "1px dashed rgba(255,255,255,0.55)",
          borderRadius: 12,
          overflow: "visible",
          textAlign: "center",
          fontSize: 14,
          lineHeight: 1.1,
          pointerEvents: "none"
        }}
      >
        {composition ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: Number(itemCanvas.width || dimensions.width),
              height: Number(itemCanvas.height || dimensions.height),
              transform: `scale(${dimensions.width / Math.max(1, Number(itemCanvas.width || 1))}, ${dimensions.height / Math.max(1, Number(itemCanvas.height || 1))})`,
              transformOrigin: "top left"
            }}
          >
            <ArtPreviewRenderer
              assetUrlById={props.assetUrlById}
              components={composition.components || []}
              compositionById={props.compositionById}
              interactive={false}
              showHandles={false}
              textOverrides={overrides.textOverrides}
              timelineFrameOverrides={overrides.timelineFrameOverrides}
              renderComponentOverlay={(component, scopedTargetId) => {
                const nested = bindings.filter((candidate) =>
                  candidate.kind === "collection"
                  && Boolean(candidate.targetComponentId)
                  && componentMatchesTarget(
                    component,
                    scopedTargetId,
                    String(candidate.targetComponentId)
                  )
                );
                if (!nested.length || String(component.kind || "").toLowerCase() !== "container") return null;
                const targetLayout = collectionLayoutForTarget(component);
                const targetStyle: CSSProperties = {
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 1,
                  ...choiceCollectionLayoutStyle(targetLayout)
                };
                return nested.map((nestedBinding) => {
                  const nestedPath = `${props.path}/preview-${index}/${nestedBinding.id || "collection"}`;
                  return (
                    <div
                      data-layout-renderer-nested-collection-preview={nestedBinding.id || "collection"}
                      data-layout-renderer-collection-preview-path={nestedPath}
                      key={nestedPath}
                      style={targetStyle}
                    >
                      {rendererItems({
                        assetUrlById: props.assetUrlById,
                        binding: nestedBinding,
                        compositionById: props.compositionById,
                        layout: targetLayout,
                        path: nestedPath,
                        surface: props.surface
                      })}
                    </div>
                  );
                });
              }}
            />
          </div>
        ) : label}
      </div>
    );
  });
}

export function LayoutCollectionPreview({
  assetUrlById,
  choiceBinding,
  compositionById,
  element,
  rendererBinding,
  surface
}: {
  assetUrlById: Map<string, string>;
  choiceBinding: GamePluginChoiceCollectionBinding | null;
  compositionById: Map<string, ArtComposition>;
  element: LayoutElement;
  rendererBinding: GamePluginRendererBinding | null;
  surface: "stage" | "controller";
}) {
  if (choiceBinding) {
    const composition = collectionComposition(
      compositionById,
      surface,
      choiceBinding.item.artCompositionId
    );
    const dimensions = composition
      ? choiceCollectionItemDimensions(
          element as Record<string, unknown>,
          composition as unknown as Record<string, unknown>,
          ROOT_PREVIEW_LABELS.length
        )
      : {
          width: element.collectionDirection === "horizontal" ? 96 : Number(element.width || 96),
          height: 72
        };
    const itemCanvas = composition?.canvas || dimensions;
    return ROOT_PREVIEW_LABELS.map((label, index) => (
      <div
        data-layout-choice-collection-preview-item
        key={`${element.id}-choice-preview-${index}`}
        style={{
          position: "relative",
          boxSizing: "border-box",
          flex: "0 0 auto",
          width: dimensions.width,
          height: dimensions.height,
          minWidth: 0,
          display: "grid",
          placeItems: "center",
          padding: composition ? 0 : 8,
          border: composition ? 0 : "1px dashed rgba(255,255,255,0.55)",
          borderRadius: 12,
          overflow: "visible",
          textAlign: "center",
          fontSize: 14,
          lineHeight: 1.1,
          pointerEvents: "none"
        }}
      >
        {composition ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: Number(itemCanvas.width || dimensions.width),
              height: Number(itemCanvas.height || dimensions.height),
              transform: `scale(${dimensions.width / Math.max(1, Number(itemCanvas.width || 1))}, ${dimensions.height / Math.max(1, Number(itemCanvas.height || 1))})`,
              transformOrigin: "top left"
            }}
          >
            <ArtPreviewRenderer
              assetUrlById={assetUrlById}
              components={composition.components || []}
              compositionById={compositionById}
              interactive={false}
              showHandles={false}
              textOverrides={{ [choiceBinding.item.targetComponentId]: label }}
            />
          </div>
        ) : label}
      </div>
    ));
  }

  if (rendererBinding) {
    return (
      <Fragment>
        {rendererItems({
          assetUrlById,
          binding: rendererBinding,
          compositionById,
          layout: element as Record<string, unknown>,
          path: rendererBinding.id || element.id,
          surface
        })}
      </Fragment>
    );
  }

  return ROOT_PREVIEW_LABELS.map((label, index) => (
    <div
      data-layout-choice-collection-preview-item
      key={`${element.id}-generic-preview-${index}`}
      style={{
        position: "relative",
        boxSizing: "border-box",
        flex: "0 0 auto",
        width: element.collectionDirection === "horizontal" ? 96 : Number(element.width || 96),
        height: 72,
        minWidth: 0,
        display: "grid",
        placeItems: "center",
        padding: 8,
        border: "1px dashed rgba(255,255,255,0.55)",
        borderRadius: 12,
        overflow: "visible",
        textAlign: "center",
        fontSize: 14,
        lineHeight: 1.1,
        pointerEvents: "none"
      }}
    >
      {label}
    </div>
  ));
}
