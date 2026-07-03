import {
  useRef,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type ReactElement
} from "react";
import type { ArtAsset, ArtComponent, ArtComposition } from "../../types/game-data";
import { applyDragModifiers, createDragModifierState } from "../common/dragModifiers";
import { PartyGameTextFit } from "../../runtime/textFit";
import { artCompositionVisualBounds } from "./artCompositionBounds";
import { artResizeDimensions } from "./artResize";
import type { ArtCompositionsController } from "./artCompositionsController";
import {
  componentSupportsImageMask,
  componentSupportsShapeStyle,
  containerDistributionOptions,
  creatableComponentKinds,
  normalizeGameTextFontFamily,
  shapeStyleOptions,
  textFontFamilyOptions,
  validateImageFile
} from "./artComponentSchema";
import { useArtCompositions } from "./useArtCompositions";

export interface ArtCompositionEditorProps {
  controller: ArtCompositionsController;
  assets: ArtAsset[];
}

const SCALAR_FIELDS: { key: string; label: string }[] = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" }
];
type LayerDropPlacement = "before" | "after";

type LayerDropTarget = {
  id: string;
  placement: LayerDropPlacement;
};

function get(component: ArtComponent, key: string): unknown {
  return (component as Record<string, unknown>)[key];
}

function artPreviewFontSize(component: ArtComponent, text: string, width: number, height: number): number {
  const fallbackSize = Number(get(component, "fontSize") || 16);
  const fontFamily = normalizeGameTextFontFamily(get(component, "fontFamily"));
  const layout = PartyGameTextFit.measureGameText({
    text,
    element: { ...component, width, height, fontSize: fallbackSize, fontFamily, autoFitText: get(component, "autoFitText") !== false },
    fallbackSize,
    options: { fontFamily, lineHeight: 1, textTransform: "uppercase" }
  });
  return Number(layout.fontSize || fallbackSize);
}

/** Map a shape style + borderRadius to a CSS border-radius (matches legacy is-style-*). */
function shapeBorderRadius(shapeStyle: string, borderRadius: number): string {
  if (shapeStyle === "circle") return "50%";
  if (shapeStyle === "pill") return "9999px";
  if (shapeStyle === "rectangle") return "0";
  return `${Math.max(borderRadius, 12)}px`;
}

function findComponent(components: ArtComponent[], id: string): ArtComponent | undefined {
  for (const component of components) {
    if (component.id === id) return component;
    const found = component.children ? findComponent(component.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

function layerDropPlacement(event: ReactDragEvent<HTMLElement>): LayerDropPlacement {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function ComponentTree({
  components,
  selectedIds,
  onSelect,
  onToggleLocked,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dropTarget,
  depth = 0
}: {
  components: ArtComponent[];
  selectedIds: Set<string>;
  onSelect: (id: string, additive: boolean) => void;
  onToggleLocked: (id: string, locked: boolean) => void;
  onDragStart: (id: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver: (id: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (id: string, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  dropTarget: LayerDropTarget | null;
  depth?: number;
}) {
  return (
    <ol className="flow-react-list" data-art-component-tree={depth}>
      {components.map((component) => {
        const locked = component.locked === true;
        return (
          <li
            data-art-component-id={component.id}
            data-art-layer-drop-placement={dropTarget?.id === component.id ? dropTarget.placement : undefined}
            key={component.id}
          >
            <div
              className="art-component-layer-row"
              draggable
              data-art-layer-locked={locked ? "true" : "false"}
              onDragStart={(event) => onDragStart(component.id, event)}
              onDragOver={(event) => onDragOver(component.id, event)}
              onDrop={(event) => onDrop(component.id, event)}
              onDragEnd={onDragEnd}
            >
              <button
                type="button"
                className="art-component-layer-select"
                aria-current={selectedIds.has(component.id) ? "true" : undefined}
                data-art-component-select={component.id}
                onClick={(event) => onSelect(component.id, event.metaKey || event.ctrlKey || event.shiftKey)}
              >
                <strong>{component.name || component.kind}</strong>
                <small>{component.kind}</small>
              </button>
              <button
                type="button"
                className="art-component-layer-lock"
                aria-label={locked ? `Unlock ${component.name || component.kind}` : `Lock ${component.name || component.kind}`}
                aria-pressed={locked}
                title={locked ? "Unlock layer" : "Lock layer"}
                data-art-component-lock={component.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleLocked(component.id, !locked);
                }}
              >
                <span
                  className="art-component-layer-lock-icon"
                  data-art-layer-lock-icon={locked ? "locked" : "unlocked"}
                  aria-hidden="true"
                />
              </button>
            </div>
            {component.children?.length ? (
              <ComponentTree
                components={component.children}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onToggleLocked={onToggleLocked}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                dropTarget={dropTarget}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ArtCompositionEditor({ controller, assets }: ArtCompositionEditorProps) {
  const { compositions, selectedCompositionId, selectedComponentIds, dirty, saving, canUndo, canRedo } =
    useArtCompositions(controller);
  const dragRef = useRef<{ id: string; originX: number; originY: number; startX: number; startY: number; moved: boolean } | null>(
    null
  );
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const [liveTransform, setLiveTransform] = useState<{ id: string; width?: number; height?: number; rotation?: number } | null>(null);
  const [layerDragId, setLayerDragId] = useState<string | null>(null);
  const [layerDropTarget, setLayerDropTarget] = useState<LayerDropTarget | null>(null);
  const assetUrlById = useMemo(() => new Map((assets || []).map((asset) => [asset.id, asset.currentUrl])), [assets]);
  const compositionById = useMemo(() => new Map(compositions.map((item) => [item.id, item])), [compositions]);
  const composition = compositions.find((item) => item.id === selectedCompositionId) || null;
  const canvasWidth = Number(composition?.canvas?.width || 560);
  const canvasHeight = Number(composition?.canvas?.height || 230);
  const visualBounds = useMemo(
    () =>
      composition
        ? artCompositionVisualBounds(composition, compositionById, { padding: 40 })
        : { minX: 0, minY: 0, maxX: canvasWidth, maxY: canvasHeight, width: canvasWidth, height: canvasHeight },
    [composition, compositionById, canvasWidth, canvasHeight]
  );
  const previewScale = composition
    ? Math.min(3.5, Math.max(0.35, Math.min(940 / visualBounds.width, 620 / visualBounds.height)))
    : 1;

  const beginResize = (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const originW = Number(get(component, "width") || 1);
    const originH = Number(get(component, "height") || 1);
    const startX = event.clientX;
    const startY = event.clientY;
    let next = { width: originW, height: originH };
    const dimensionsForEvent = (e: PointerEvent) =>
      artResizeDimensions({
        originWidth: originW,
        originHeight: originH,
        deltaX: (e.clientX - startX) / previewScale,
        deltaY: (e.clientY - startY) / previewScale,
        preserveAspectRatio: e.shiftKey,
        snapToInteger: e.metaKey || e.ctrlKey
      });
    const move = (e: PointerEvent) => {
      next = dimensionsForEvent(e);
      setLiveTransform({ id: component.id, width: next.width, height: next.height });
    };
    const up = (e: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      next = dimensionsForEvent(e);
      setLiveTransform(null);
      controller.updateComponent(component.id, { width: next.width, height: next.height } as Partial<ArtComponent>);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const beginRotate = (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const box = (event.currentTarget.closest("[data-art-canvas-component]") as HTMLElement)?.getBoundingClientRect();
    if (!box) return;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    let rotation = Number(get(component, "rotation") || 0);
    const move = (e: PointerEvent) => {
      rotation = Number(((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90).toFixed(1));
      setLiveTransform({ id: component.id, rotation });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLiveTransform(null);
      controller.updateComponent(component.id, { rotation } as Partial<ArtComponent>);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const selectedComponent =
    composition && selectedComponentIds.size === 1
      ? findComponent(composition.components || [], [...selectedComponentIds][0])
      : undefined;

  const beginLayerDrag = (id: string, event: ReactDragEvent<HTMLDivElement>) => {
    setLayerDragId(id);
    setLayerDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const updateLayerDropTarget = (targetId: string, event: ReactDragEvent<HTMLDivElement>) => {
    const draggingId = layerDragId || event.dataTransfer.getData("text/plain");
    if (!draggingId || draggingId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setLayerDropTarget({ id: targetId, placement: layerDropPlacement(event) });
  };

  const dropLayer = (targetId: string, event: ReactDragEvent<HTMLDivElement>) => {
    const draggingId = layerDragId || event.dataTransfer.getData("text/plain");
    const placement = layerDropPlacement(event);
    setLayerDragId(null);
    setLayerDropTarget(null);
    if (!draggingId || draggingId === targetId) return;
    event.preventDefault();
    controller.reorderComponent(draggingId, targetId, placement);
  };

  const endLayerDrag = () => {
    setLayerDragId(null);
    setLayerDropTarget(null);
  };

  const beginDrag = (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    dragRef.current = {
      id: component.id,
      originX: Number(get(component, "x") || 0),
      originY: Number(get(component, "y") || 0),
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    const modifierState = createDragModifierState();
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rawDeltaX = e.clientX - drag.startX;
      const rawDeltaY = e.clientY - drag.startY;
      if (Math.abs(rawDeltaX) > 3 || Math.abs(rawDeltaY) > 3) drag.moved = true;
      const next = applyDragModifiers(
        {
          originX: drag.originX,
          originY: drag.originY,
          deltaX: rawDeltaX / previewScale,
          deltaY: rawDeltaY / previewScale,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey
        },
        modifierState
      );
      setLive({ id: drag.id, x: next.x, y: next.y });
    };
    const up = (e: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const drag = dragRef.current;
      dragRef.current = null;
      setLive(null);
      if (drag && drag.moved) {
        const next = applyDragModifiers(
          {
            originX: drag.originX,
            originY: drag.originY,
            deltaX: (e.clientX - drag.startX) / previewScale,
            deltaY: (e.clientY - drag.startY) / previewScale,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey
          },
          modifierState
        );
        controller.moveComponent(drag.id, next.x, next.y);
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const imageSourceFor = (component: ArtComponent): string => {
    return String(get(component, "imageDataUrl") || "") || assetUrlById.get(String(get(component, "imageAssetId") || "")) || "";
  };

  const referencedCompositionFor = (component: ArtComponent, referencePath: Set<string>): ArtComposition | null => {
    if (component.kind !== "reference") return null;
    const referencedId = String(get(component, "artCompositionId") || "");
    if (!referencedId || referencePath.has(referencedId)) return null;
    return compositionById.get(referencedId) || null;
  };

  const renderComponent = (
    component: ArtComponent,
    layer: { index: number; total: number; interactive?: boolean; referencePath?: Set<string> } = { index: 0, total: 1 }
  ): ReactElement => {
    const locked = component.locked === true;
    const interactive = layer.interactive !== false && !locked;
    const referencePath = layer.referencePath || new Set<string>();
    const livePos = live?.id === component.id ? live : null;
    const liveTx = liveTransform?.id === component.id ? liveTransform : null;
    const x = livePos ? livePos.x : Number(get(component, "x") || 0);
    const y = livePos ? livePos.y : Number(get(component, "y") || 0);
    const width = liveTx?.width ?? Number(get(component, "width") || 1);
    const height = liveTx?.height ?? Number(get(component, "height") || 1);
    const kind = component.kind;
    const isTextual = kind === "text" || kind === "badge";
    const fillCss = String(get(component, "fillCss") || "");
    const fillColor = String(get(component, "fillColor") || "transparent");
    const borderColor = String(get(component, "borderColor") || "transparent");
    const borderWidth = Number(get(component, "borderWidth") || 0);
    const scale = Number(get(component, "scale") || 1);
    const rotation = liveTx?.rotation ?? Number(get(component, "rotation") || 0);
    const imageUrl = componentSupportsImageMask(component) ? imageSourceFor(component) : "";
    const objectFit = String(get(component, "imageObjectFit") || "cover");
    const selected = interactive && selectedComponentIds.has(component.id);
    const tintWithCurrentColor = Boolean(imageUrl && get(component, "imageTint") === "currentColor");
    const referencedComposition = referencedCompositionFor(component, referencePath);
    const referenceCanvas = referencedComposition?.canvas || { width, height };
    const referenceScaleX = width / Math.max(1, Number(referenceCanvas.width || width));
    const referenceScaleY = height / Math.max(1, Number(referenceCanvas.height || height));
    const maskSize = objectFit === "fill" ? "100% 100%" : objectFit;
    const transparentBase = kind === "container" || kind === "reference";
    const clipsOwnContent = Boolean(imageUrl || isTextual);
    const textValue = String(get(component, "defaultText") || "");
    const fontFamily = normalizeGameTextFontFamily(get(component, "fontFamily"));
    const fontSize = isTextual ? artPreviewFontSize(component, textValue, width, height) : 11;
    const fill = fillColor === "currentColor" ? "currentColor" : fillColor;
    const background = tintWithCurrentColor
      ? (fill === "transparent" ? "currentColor" : fill || "currentColor")
      : imageUrl
        ? "transparent"
        : fillCss || (fill === "transparent" ? (transparentBase ? "transparent" : "rgba(255,255,255,0.06)") : fill);

    const style: CSSProperties = {
      position: "absolute",
      left: x - width / 2,
      top: y - height / 2,
      width,
      height,
      transform: `scale(${scale}) rotate(${rotation}deg)`,
      transformOrigin: "center",
      borderRadius: shapeBorderRadius(String(get(component, "shapeStyle") || "rounded"), Number(get(component, "borderRadius") || 0)),
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
      outline: selected ? "2px solid #22d3ee" : "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color:
        fillColor === "currentColor" || get(component, "imageTint") === "currentColor"
          ? "var(--art-preview-current-color)"
          : String(get(component, "fontColor") || "#17131f"),
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
        onPointerDown={interactive ? (event) => beginDrag(component, event) : undefined}
        onClick={
          interactive
            ? (event) => {
                event.stopPropagation();
                controller.selectComponent(component.id, event.metaKey || event.ctrlKey || event.shiftKey);
              }
            : undefined
        }
      >
        {isTextual ? <span>{textValue}</span> : null}
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
                referencePath: new Set([...referencePath, referencedComposition.id])
              })
            )}
          </div>
        ) : null}
        {(component.children || []).map((child, index) =>
          renderComponent(child, { index, total: component.children?.length || 1, interactive, referencePath })
        )}
        {selected ? (
          <>
            <div
              data-art-resize-handle={component.id}
              onPointerDown={(event) => beginResize(component, event)}
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
              onPointerDown={(event) => beginRotate(component, event)}
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
    <section className="art-composition-editor" data-art-react-component="composition-editor">
      <div className="art-editor-toolbar">
        <div>
          <h3>{composition?.name || "Composition"}</h3>
          <span data-art-compositions-status>{dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
        <div className="flow-editor-controls">
          <button type="button" disabled={!canUndo} onClick={() => controller.undo()}>
            Undo
          </button>
          <button type="button" disabled={!canRedo} onClick={() => controller.redo()}>
            Redo
          </button>
          <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="art-studio-layout">
        <section className="art-preview-panel" data-art-react-component="canvas">
          <div className="flow-editor-controls">
            {creatableComponentKinds.map((kind) => (
              <button type="button" data-art-add-component={kind} key={kind} onClick={() => controller.addComponent(kind)}>
                Add {kind}
              </button>
            ))}
          </div>
          {composition ? (
            <div className="art-canvas-viewport">
              <div
                className="art-canvas-shell"
                style={{ width: visualBounds.width * previewScale, height: visualBounds.height * previewScale }}
              >
                <div
                  className="art-canvas"
                  data-art-canvas={composition.id}
                  style={{
                    position: "absolute",
                    left: (0 - visualBounds.minX) * previewScale,
                    top: (0 - visualBounds.minY) * previewScale,
                    width: canvasWidth,
                    height: canvasHeight,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    overflow: "visible"
                  }}
                  onClick={() => controller.clearComponentSelection()}
                >
                  {(composition.components || []).map((component, index) =>
                    renderComponent(component, { index, total: composition.components?.length || 1 })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p>No composition selected.</p>
          )}
        </section>

        <ArtComponentInspector
          controller={controller}
          component={selectedComponent ?? null}
          tree={
            composition ? (
              <ComponentTree
                components={composition.components || []}
                selectedIds={selectedComponentIds}
                onSelect={(id, additive) => controller.selectComponent(id, additive)}
                onToggleLocked={(id, locked) => controller.updateComponent(id, { locked } as Partial<ArtComponent>)}
                onDragStart={beginLayerDrag}
                onDragOver={updateLayerDropTarget}
                onDrop={dropLayer}
                onDragEnd={endLayerDrag}
                dropTarget={layerDropTarget}
              />
            ) : null
          }
        />
      </div>
    </section>
  );
}

function ArtComponentInspector({
  controller,
  component,
  tree
}: {
  controller: ArtCompositionsController;
  component: ArtComponent | null;
  tree: ReactNode;
}) {
  if (!component) {
    return (
      <section className="flow-react-panel flow-react-inspector art-component-inspector" data-art-react-component="component-inspector" data-empty="true">
        <div className="art-component-tree-panel">
          <h3>Layers</h3>
          {tree}
        </div>
        <h3>Component</h3>
        <p>Select a component.</p>
      </section>
    );
  }
  const commit = (patch: Partial<ArtComponent>) => controller.updateComponent(component.id, patch);
  const isTextual = component.kind === "text" || component.kind === "badge";
  const supportsShape = componentSupportsShapeStyle(component);
  const supportsImage = componentSupportsImageMask(component);

  const numberField = (key: string, label: string, step?: string) => (
    <label className="flow-react-field" data-art-field={key} key={key}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        key={`${component.id}-${key}-${String(get(component, key) ?? "")}`}
        defaultValue={String(get(component, key) ?? 0)}
        data-art-component-field={key}
        onBlur={(event) => commit({ [key]: Number(event.target.value) } as Partial<ArtComponent>)}
      />
    </label>
  );
  const textField = (key: string, label: string) => (
    <label className="flow-react-field" data-art-field={key} key={key}>
      <span>{label}</span>
      <input
        type="text"
        key={`${component.id}-${key}`}
        defaultValue={String(get(component, key) ?? "")}
        data-art-component-field={key}
        onBlur={(event) => commit({ [key]: event.target.value } as Partial<ArtComponent>)}
      />
    </label>
  );

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    const message = validateImageFile(file);
    if (message) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    });
    commit({ imageDataUrl: dataUrl, imageName: file.name, imageMimeType: file.type, imageAssetId: "" } as Partial<ArtComponent>);
  };

  return (
    <section className="flow-react-panel flow-react-inspector art-component-inspector" data-art-react-component="component-inspector" data-art-component-id={component.id}>
      <div className="art-component-tree-panel">
        <h3>Layers</h3>
        {tree}
      </div>
      <h3>{component.name}</h3>
      {textField("name", "Name")}
      {SCALAR_FIELDS.map((field) => numberField(field.key, field.label))}
      {numberField("scale", "Scale", "0.01")}
      {numberField("rotation", "Rotation", "0.1")}
      {supportsShape ? (
        <>
          <label className="flow-react-field" data-art-field="shapeStyle">
            <span>Shape Style</span>
            <select
              value={String(get(component, "shapeStyle") || "rounded")}
              data-art-component-field="shapeStyle"
              onChange={(event) => commit({ shapeStyle: event.target.value } as Partial<ArtComponent>)}
            >
              {shapeStyleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {textField("fillColor", "Fill Color")}
          {textField("fillCss", "Fill CSS (gradient)")}
          {textField("borderColor", "Border Color")}
          {numberField("borderWidth", "Border Width")}
          {numberField("borderRadius", "Border Radius")}
        </>
      ) : null}
      {component.kind === "container" ? (
        <label className="flow-react-field" data-art-field="childDistribution">
          <span>Child Distribution</span>
          <select
            value={String(get(component, "childDistribution") || "none")}
            data-art-component-field="childDistribution"
            onChange={(event) => commit({ childDistribution: event.target.value } as Partial<ArtComponent>)}
          >
            {containerDistributionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {isTextual ? (
        <>
          {textField("defaultText", "Text")}
          <label className="flow-react-field" data-art-field="fontFamily">
            <span>Font</span>
            <select
              value={normalizeGameTextFontFamily(get(component, "fontFamily"))}
              data-art-component-field="fontFamily"
              onChange={(event) => commit({ fontFamily: event.target.value } as Partial<ArtComponent>)}
            >
              {textFontFamilyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {numberField("fontSize", "Font Size")}
          <label className="flow-react-field" data-art-field="autoFitText">
            <span>Auto Fit Text</span>
            <input
              type="checkbox"
              checked={get(component, "autoFitText") !== false}
              data-art-component-field="autoFitText"
              onChange={(event) => commit({ autoFitText: event.target.checked } as Partial<ArtComponent>)}
            />
          </label>
          {textField("fontColor", "Font Color")}
        </>
      ) : null}
      {supportsImage ? (
        <label className="flow-react-field" data-art-field="imageMask">
          <span>Image Mask</span>
          <input
            type="file"
            accept="image/*"
            data-art-component-image
            onChange={(event) => void onPickImage(event.target.files?.[0])}
          />
        </label>
      ) : null}
    </section>
  );
}
