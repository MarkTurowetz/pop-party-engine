import {
  useEffect,
  useRef,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import type { ArtAsset, ArtComponent, ArtComposition } from "../../types/game-data";
import { applyDragModifiers, createDragModifierState } from "../common/dragModifiers";
import { artCompositionVisualBounds } from "./artCompositionBounds";
import { artCompositionKindOptions, normalizeArtCompositionKind } from "./artCompositionModel";
import { artResizeDimensions } from "./artResize";
import type { ArtCompositionsController } from "./artCompositionsController";
import { ArtPreviewRenderer, assetUrlMap, compositionMap } from "./ArtPreviewRenderer";
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
import {
  addTimelineCommand,
  addTimelineLabel,
  addTransformKeyframe,
  artTimelineOrDefault,
  copyTimelineKeyframe,
  defaultArtVisibilityTimeline,
  insertTimelineFrames,
  removeTimelineCommandAt,
  removeTimelineKeyframe,
  removeTimelineLabel,
  removeTimelineFrames,
  updateTimelineKeyframe,
  updateTimelineSettings
} from "./artTimelineModel";
import { useArtCompositions } from "./useArtCompositions";
import type {
  TimelineCommand,
  TimelineDocument,
  TimelineKeyframe,
  TimelineLabel,
  TimelineProperties,
  TimelinePropertyValue
} from "../../../shared/timeline-model";
import { TimelinePlayer, timelineSnapshotAt } from "../../runtime/timelinePlayer";

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
const ADD_COMPONENT_LABELS: Record<string, string> = {
  text: "Text",
  shape: "Shape",
  container: "Container",
  reference: "Prefab Ref"
};
const TIMELINE_PROPERTY_SUGGESTIONS = [
  "x",
  "y",
  "width",
  "height",
  "scale",
  "rotation",
  "opacity",
  "visible",
  "defaultText",
  "text",
  "fontSize",
  "fontColor",
  "fontFamily",
  "autoFitText",
  "fillColor",
  "fillCss",
  "borderColor",
  "borderWidth",
  "borderRadius",
  "shapeStyle",
  "imageAssetId",
  "imageTint",
  "imageObjectFit"
];
type LayerDropPlacement = "before" | "after";

type LayerDropTarget = {
  id: string;
  placement: LayerDropPlacement;
};

function get(component: ArtComponent, key: string): unknown {
  return (component as Record<string, unknown>)[key];
}

function timelineValueInput(value: TimelinePropertyValue | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function timelinePropertyType(value: TimelinePropertyValue | undefined): "number" | "boolean" | "string" {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function coerceTimelinePropertyValue(value: string, type: "number" | "boolean" | "string"): TimelinePropertyValue {
  if (type === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
  if (type === "boolean") return value === "true";
  return value;
}

function findTimelineKeyframe(
  timeline: TimelineDocument,
  selection: { targetId: string; frame: number } | null
): { trackTargetId: string; keyframe: TimelineKeyframe } | null {
  if (!selection) return null;
  for (const track of timeline.tracks) {
    if (track.targetId !== selection.targetId) continue;
    const keyframe = track.keyframes.find((item) => item.frame === selection.frame);
    if (keyframe) return { trackTargetId: track.targetId, keyframe };
  }
  return null;
}

function timelineLabelsAtFrame(timeline: TimelineDocument, frame: number): TimelineLabel[] {
  return timeline.labels.filter((label) => label.frame === frame);
}

function timelineCommandsAtFrame(timeline: TimelineDocument, frame: number): TimelineCommand[] {
  return timeline.commands.filter((command) => command.frame === frame);
}

function timelineCommandLabel(command: TimelineCommand): string {
  if (command.type === "gotoAndPlay") return command.target ? `play ${command.target}` : "play";
  if (command.type === "gotoAndStop") return command.target ? `stop at ${command.target}` : "stop at";
  if (command.type === "emit") return command.event ? `emit ${command.event}` : "emit";
  return command.type;
}

function timelineCommandTitle(command: TimelineCommand): string {
  const details = [command.target ? `target: ${command.target}` : "", command.event ? `event: ${command.event}` : ""].filter(Boolean).join(" / ");
  return details ? `${command.type} (${details})` : command.type;
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
  const [timelinePreviewFrame, setTimelinePreviewFrame] = useState(0);
  const assetUrlById = useMemo(() => assetUrlMap(assets || []), [assets]);
  const compositionById = useMemo(() => compositionMap(compositions), [compositions]);
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
  const activeTimeline = (selectedComponent?.timeline || composition?.timeline || null) as TimelineDocument | null;
  const timelineFrameOverrides = useMemo(() => {
    const timeline = artTimelineOrDefault(activeTimeline);
    if (!activeTimeline || timeline.tracks.length === 0) return null;
    return timelineSnapshotAt(timeline, timelinePreviewFrame).targets;
  }, [activeTimeline, timelinePreviewFrame]);
  const updateComposition = (patch: Partial<ArtComposition>) => {
    if (!composition) return;
    controller.updateComposition(composition.id, patch);
  };

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

  return (
    <section className="art-composition-editor" data-art-react-component="composition-editor">
      <div className="art-editor-toolbar">
        <div className="art-editor-composition-meta">
          {composition ? (
            <>
              <label className="flow-react-field art-composition-name-field">
                <span>Name</span>
                <input
                  type="text"
                  key={`${composition.id}-composition-name`}
                  defaultValue={composition.name}
                  data-art-composition-field="name"
                  onBlur={(event) => updateComposition({ name: event.target.value })}
                />
              </label>
              <label className="flow-react-field art-composition-kind-field">
                <span>Type</span>
                <select
                  value={normalizeArtCompositionKind(composition.compositionKind)}
                  data-art-composition-field="compositionKind"
                  onChange={(event) => updateComposition({ compositionKind: event.target.value })}
                >
                  {artCompositionKindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <h3>Composition</h3>
          )}
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
                Add {ADD_COMPONENT_LABELS[kind] || kind}
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
                  <ArtPreviewRenderer
                    assetUrlById={assetUrlById}
                    components={composition.components || []}
                    compositionById={compositionById}
                    interactive
                    livePosition={live}
                    liveTransform={liveTransform}
                    timelineFrameOverrides={timelineFrameOverrides}
                    onBeginDrag={beginDrag}
                    onBeginResize={beginResize}
                    onBeginRotate={beginRotate}
                    onSelect={(id, additive) => controller.selectComponent(id, additive)}
                    selectedIds={selectedComponentIds}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p>No composition selected.</p>
          )}
        </section>

        <ArtComponentInspector
          controller={controller}
          composition={composition}
          compositions={compositions}
          component={selectedComponent ?? null}
          onPreviewTimelineFrame={setTimelinePreviewFrame}
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
  composition,
  compositions,
  component,
  onPreviewTimelineFrame,
  tree
}: {
  controller: ArtCompositionsController;
  composition: ArtComposition | null;
  compositions: ArtComposition[];
  component: ArtComponent | null;
  onPreviewTimelineFrame: (frame: number) => void;
  tree: ReactNode;
}) {
  if (!component) {
    return (
      <section className="flow-react-panel flow-react-inspector art-component-inspector" data-art-react-component="component-inspector" data-empty="true">
        <div className="art-component-tree-panel">
          <h3>Layers</h3>
          {tree}
        </div>
        <h3>Composition</h3>
        <p>Select a component.</p>
        {composition ? (
          <ArtTimelinePanel
            title={`${composition.name} Timeline`}
            timeline={composition.timeline as TimelineDocument | null | undefined}
            onChange={(timeline) => controller.updateComposition(composition.id, { timeline })}
            onPreviewFrame={onPreviewTimelineFrame}
          />
        ) : null}
      </section>
    );
  }
  const commit = (patch: Partial<ArtComponent>) => controller.updateComponent(component.id, patch);
  const isTextual = component.kind === "text" || component.kind === "badge";
  const supportsShape = componentSupportsShapeStyle(component);
  const supportsImage = componentSupportsImageMask(component);
  const referenceOptions = compositions.filter((item) => item.id !== composition?.id);

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
      {component.kind === "reference" ? (
        <label className="flow-react-field" data-art-field="artCompositionId">
          <span>Prefab</span>
          <select
            value={String(get(component, "artCompositionId") || "")}
            data-art-component-field="artCompositionId"
            onChange={(event) => commit({ artCompositionId: event.target.value } as Partial<ArtComponent>)}
          >
            <option value="">Choose prefab</option>
            {referenceOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({normalizeArtCompositionKind(option.compositionKind) === "prefab" ? "Prefab" : "Game Object"})
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
      <ArtTimelinePanel
        title={`${component.name || component.kind} Timeline`}
        timeline={component.timeline as TimelineDocument | null | undefined}
        component={component}
        onChange={(timeline) => commit({ timeline } as Partial<ArtComponent>)}
        onPreviewFrame={onPreviewTimelineFrame}
      />
    </section>
  );
}

function ArtTimelinePanel({
  title,
  timeline,
  component,
  onChange,
  onPreviewFrame
}: {
  title: string;
  timeline: TimelineDocument | null | undefined;
  component?: ArtComponent;
  onChange: (timeline: TimelineDocument) => void;
  onPreviewFrame?: (frame: number) => void;
}) {
  const current = useMemo(() => artTimelineOrDefault(timeline), [timeline]);
  const [frame, setFrame] = useState(0);
  const [labelName, setLabelName] = useState("");
  const [commandType, setCommandType] = useState("stop");
  const [commandTarget, setCommandTarget] = useState("");
  const [commandEvent, setCommandEvent] = useState("");
  const [frameEditCount, setFrameEditCount] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ targetId: string; frame: number } | null>(null);
  const [copiedKeyframe, setCopiedKeyframe] = useState<{ targetId: string; frame: number } | null>(null);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<"number" | "boolean" | "string">("number");
  const [newPropertyValue, setNewPropertyValue] = useState("");
  const playerRef = useRef<TimelinePlayer | null>(null);
  const cleanFrame = Math.max(0, Math.min(Math.max(0, current.frameCount - 1), Math.round(Number(frame) || 0)));
  const selectedTimelineKeyframe = useMemo(() => findTimelineKeyframe(current, selectedKeyframe), [current, selectedKeyframe]);
  const visibleTimelineFrameCount = Math.min(current.frameCount, 60);
  const hasTimelineLanes = current.labels.length > 0 || current.commands.length > 0 || current.tracks.length > 0;

  useEffect(() => {
    playerRef.current?.updateTimeline(current);
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, [current]);

  function previewFrame(nextFrame: number): void {
    const normalizedFrame = Math.max(0, Math.min(Math.max(0, current.frameCount - 1), Math.round(Number(nextFrame) || 0)));
    setFrame(normalizedFrame);
    onPreviewFrame?.(normalizedFrame);
  }

  function stopPlayback(): void {
    playerRef.current?.stop();
    setIsPlaying(false);
  }

  function playTimeline(): void {
    stopPlayback();
    const player = new TimelinePlayer({
      timeline: current,
      onFrame: (snapshot) => previewFrame(snapshot.frame)
    });
    playerRef.current = player;
    setIsPlaying(true);
    player.gotoAndPlay(cleanFrame, {
      complete: () => setIsPlaying(false)
    });
  }

  function applyTimelineFrameEdit(nextTimeline: TimelineDocument, nextFrame = cleanFrame): void {
    stopPlayback();
    onChange(nextTimeline);
    previewFrame(Math.max(0, Math.min(Math.max(0, nextTimeline.frameCount - 1), nextFrame)));
  }

  function selectKeyframe(targetId: string, keyframeFrame: number): void {
    stopPlayback();
    setSelectedKeyframe({ targetId, frame: keyframeFrame });
    previewFrame(keyframeFrame);
  }

  function updateSelectedKeyframe(patch: Partial<Pick<TimelineKeyframe, "frame" | "props">>): void {
    if (!selectedTimelineKeyframe) return;
    const nextFrame = patch.frame === undefined ? selectedTimelineKeyframe.keyframe.frame : Math.max(0, Math.min(current.frameCount - 1, Math.round(Number(patch.frame) || 0)));
    const nextTimeline = updateTimelineKeyframe(current, selectedTimelineKeyframe.trackTargetId, selectedTimelineKeyframe.keyframe.frame, patch);
    setSelectedKeyframe({ targetId: selectedTimelineKeyframe.trackTargetId, frame: nextFrame });
    applyTimelineFrameEdit(nextTimeline, nextFrame);
  }

  function updateSelectedKeyframeProp(key: string, value: TimelinePropertyValue): void {
    if (!selectedTimelineKeyframe) return;
    updateSelectedKeyframe({
      props: {
        ...selectedTimelineKeyframe.keyframe.props,
        [key]: value
      }
    });
  }

  function removeSelectedKeyframeProp(key: string): void {
    if (!selectedTimelineKeyframe) return;
    const nextProps: TimelineProperties = { ...selectedTimelineKeyframe.keyframe.props };
    delete nextProps[key];
    updateSelectedKeyframe({ props: nextProps });
  }

  function copySelectedKeyframe(): void {
    if (!selectedTimelineKeyframe) return;
    setCopiedKeyframe({
      targetId: selectedTimelineKeyframe.trackTargetId,
      frame: selectedTimelineKeyframe.keyframe.frame
    });
  }

  function pasteCopiedKeyframe(nextFrame = cleanFrame): void {
    if (!copiedKeyframe || !component) return;
    const normalizedFrame = Math.max(0, Math.min(current.frameCount - 1, Math.round(Number(nextFrame) || 0)));
    const nextTimeline = copyTimelineKeyframe(current, copiedKeyframe.targetId, copiedKeyframe.frame, component.id, normalizedFrame);
    onChange(nextTimeline);
    setSelectedKeyframe({ targetId: component.id, frame: normalizedFrame });
    previewFrame(normalizedFrame);
  }

  function duplicateSelectedKeyframe(): void {
    if (!selectedTimelineKeyframe) return;
    const nextFrame = Math.min(current.frameCount - 1, selectedTimelineKeyframe.keyframe.frame + 1);
    const nextTimeline = copyTimelineKeyframe(
      current,
      selectedTimelineKeyframe.trackTargetId,
      selectedTimelineKeyframe.keyframe.frame,
      selectedTimelineKeyframe.trackTargetId,
      nextFrame
    );
    onChange(nextTimeline);
    setCopiedKeyframe({ targetId: selectedTimelineKeyframe.trackTargetId, frame: selectedTimelineKeyframe.keyframe.frame });
    setSelectedKeyframe({ targetId: selectedTimelineKeyframe.trackTargetId, frame: nextFrame });
    previewFrame(nextFrame);
  }

  return (
    <section className="art-timeline-panel" data-art-timeline-panel>
      <div className="art-timeline-header">
        <h3>{title}</h3>
        <button type="button" onClick={() => onChange(defaultArtVisibilityTimeline())}>
          Visibility Defaults
        </button>
      </div>
      <div className="art-timeline-settings">
        <label className="flow-react-field">
          <span>FPS</span>
          <input
            type="number"
            min={1}
            max={120}
            value={current.fps}
            onChange={(event) => onChange(updateTimelineSettings(current, { fps: Number(event.target.value) }))}
          />
        </label>
        <label className="flow-react-field">
          <span>Frames</span>
          <input
            type="number"
            min={1}
            max={18000}
            value={current.frameCount}
            onChange={(event) => onChange(updateTimelineSettings(current, { frameCount: Number(event.target.value) }))}
          />
        </label>
        <label className="flow-react-field">
          <span>Current Frame</span>
          <input
            type="number"
            min={0}
            max={Math.max(0, current.frameCount - 1)}
            value={cleanFrame}
            onChange={(event) => {
              stopPlayback();
              previewFrame(Number(event.target.value));
            }}
          />
        </label>
      </div>
      <div className="art-timeline-playback">
        <button type="button" onClick={playTimeline} disabled={isPlaying || current.frameCount <= 1}>
          Play
        </button>
        <button type="button" onClick={stopPlayback} disabled={!isPlaying}>
          Stop
        </button>
        <button type="button" onClick={() => previewFrame(0)}>
          First
        </button>
      </div>
      <div className="art-timeline-frame-editor">
        <label className="flow-react-field">
          <span>Edit Count</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={frameEditCount}
            onChange={(event) => setFrameEditCount(Math.max(1, Math.min(1000, Math.round(Number(event.target.value) || 1))))}
          />
        </label>
        <button type="button" onClick={() => applyTimelineFrameEdit(insertTimelineFrames(current, cleanFrame, frameEditCount), cleanFrame)}>
          Insert Frames
        </button>
        <button
          type="button"
          onClick={() => applyTimelineFrameEdit(removeTimelineFrames(current, cleanFrame, frameEditCount), cleanFrame)}
          disabled={current.frameCount <= 1}
        >
          Delete Frames
        </button>
      </div>
      <div className="art-timeline-ruler" style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}>
        {Array.from({ length: visibleTimelineFrameCount }, (_, index) => (
          <button
            type="button"
            key={index}
            aria-current={cleanFrame === index ? "true" : undefined}
            onClick={() => {
              stopPlayback();
              previewFrame(index);
            }}
            title={`Frame ${index}`}
          >
            {index % 5 === 0 ? index : ""}
          </button>
        ))}
      </div>
      {hasTimelineLanes ? (
        <div className="art-timeline-lanes" data-art-timeline-lanes>
          {current.labels.length ? (
            <div className="art-timeline-lane" data-art-timeline-lane-kind="labels">
              <div className="art-timeline-lane-label" title="Timeline labels">
                Labels
              </div>
              <div className="art-timeline-lane-frames" style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}>
                {Array.from({ length: visibleTimelineFrameCount }, (_, index) => {
                  const labels = timelineLabelsAtFrame(current, index);
                  return (
                    <button
                      type="button"
                      key={index}
                      className="art-timeline-lane-frame"
                      aria-current={cleanFrame === index ? "true" : undefined}
                      data-art-timeline-has-label={labels.length ? "true" : "false"}
                      title={labels.length ? `Frame ${index}: ${labels.map((label) => label.name).join(", ")}` : `Preview frame ${index}`}
                      onClick={() => previewFrame(index)}
                    >
                      {labels.length ? <span className="art-timeline-marker-pill">{labels.map((label) => label.name).join(", ")}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {current.commands.length ? (
            <div className="art-timeline-lane" data-art-timeline-lane-kind="commands">
              <div className="art-timeline-lane-label" title="Timeline commands">
                Commands
              </div>
              <div className="art-timeline-lane-frames" style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}>
                {Array.from({ length: visibleTimelineFrameCount }, (_, index) => {
                  const commands = timelineCommandsAtFrame(current, index);
                  return (
                    <button
                      type="button"
                      key={index}
                      className="art-timeline-lane-frame"
                      aria-current={cleanFrame === index ? "true" : undefined}
                      data-art-timeline-has-command={commands.length ? "true" : "false"}
                      title={
                        commands.length
                          ? `Frame ${index}: ${commands.map((command) => timelineCommandTitle(command)).join(", ")}`
                          : `Preview frame ${index}`
                      }
                      onClick={() => previewFrame(index)}
                    >
                      {commands.length ? (
                        <span className="art-timeline-marker-pill">{commands.map((command) => timelineCommandLabel(command)).join(", ")}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {current.tracks.map((track) => (
            <div className="art-timeline-lane" key={track.targetId}>
              <div className="art-timeline-lane-label" title={track.targetId}>
                {track.targetId}
              </div>
              <div className="art-timeline-lane-frames" style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}>
                {Array.from({ length: visibleTimelineFrameCount }, (_, index) => {
                  const keyframe = track.keyframes.find((item) => item.frame === index);
                  const isSelected = selectedKeyframe?.targetId === track.targetId && selectedKeyframe.frame === index;
                  return (
                    <button
                      type="button"
                      key={index}
                      className="art-timeline-lane-frame"
                      aria-current={cleanFrame === index ? "true" : undefined}
                      data-art-timeline-has-keyframe={keyframe ? "true" : "false"}
                      data-art-timeline-keyframe-selected={isSelected ? "true" : "false"}
                      title={keyframe ? `${track.targetId} keyframe ${index}` : `Preview frame ${index}`}
                      onClick={() => (keyframe ? selectKeyframe(track.targetId, keyframe.frame) : previewFrame(index))}
                    >
                      {keyframe ? <span className="art-timeline-keyframe-dot" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {current.frameCount > visibleTimelineFrameCount ? (
            <small className="art-timeline-lane-note">Showing frames 0-{visibleTimelineFrameCount - 1}; use Current Frame for later frames.</small>
          ) : null}
        </div>
      ) : null}
      <div className="art-timeline-actions">
        <label className="flow-react-field">
          <span>Label</span>
          <input type="text" value={labelName} placeholder="appear" onChange={(event) => setLabelName(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            const nextLabel = labelName.trim() || `Frame ${cleanFrame}`;
            onChange(addTimelineLabel(current, cleanFrame, nextLabel));
            setLabelName("");
          }}
        >
          Add Label
        </button>
        <button
          type="button"
          disabled={!component}
          onClick={() => {
            if (!component) return;
            const nextTimeline = addTransformKeyframe(current, component, cleanFrame);
            onChange(nextTimeline);
            setSelectedKeyframe({ targetId: component.id, frame: cleanFrame });
          }}
        >
          Add Keyframe
        </button>
        <button type="button" disabled={!component || !copiedKeyframe} onClick={() => pasteCopiedKeyframe(cleanFrame)}>
          Paste Keyframe
        </button>
      </div>
      <div className="art-timeline-command-editor">
        <label className="flow-react-field">
          <span>Command</span>
          <select value={commandType} onChange={(event) => setCommandType(event.target.value)}>
            <option value="stop">Stop</option>
            <option value="gotoAndPlay">Go To And Play</option>
            <option value="gotoAndStop">Go To And Stop</option>
            <option value="emit">Emit Event</option>
          </select>
        </label>
        <label className="flow-react-field">
          <span>Target Label</span>
          <input
            type="text"
            list="art-timeline-labels"
            value={commandTarget}
            placeholder="appear"
            onChange={(event) => setCommandTarget(event.target.value)}
          />
        </label>
        <label className="flow-react-field">
          <span>Event</span>
          <input type="text" value={commandEvent} placeholder="pop-name" onChange={(event) => setCommandEvent(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            onChange(addTimelineCommand(current, cleanFrame, { type: commandType, target: commandTarget, event: commandEvent }));
            setCommandEvent("");
            if (commandType === "stop") setCommandTarget("");
          }}
        >
          Add Command
        </button>
        <datalist id="art-timeline-labels">
          {current.labels.map((label) => (
            <option value={label.name} key={label.name} />
          ))}
        </datalist>
      </div>
      <div className="art-timeline-lists">
        <div>
          <h4>Labels</h4>
          {current.labels.length ? (
            <ol className="flow-react-list art-timeline-list">
              {current.labels.map((label) => (
                <li key={label.name}>
                  <span>{label.name}</span>
                  <small>Frame {label.frame}</small>
                  <button type="button" onClick={() => onChange(removeTimelineLabel(current, label.name))}>
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>No labels.</p>
          )}
        </div>
        <div>
          <h4>Commands</h4>
          {current.commands.length ? (
            <ol className="flow-react-list art-timeline-list">
              {current.commands.map((command, index) => (
                <li key={command.id || `${command.type}-${command.frame}-${index}`}>
                  <span>{command.type}</span>
                  <small>
                    Frame {command.frame}
                    {command.target ? ` -> ${command.target}` : ""}
                    {command.event ? ` / ${command.event}` : ""}
                  </small>
                  <button type="button" onClick={() => onChange(removeTimelineCommandAt(current, index))}>
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>No commands.</p>
          )}
        </div>
      </div>
      {current.tracks.length ? (
        <div className="art-timeline-keyframes">
          <h4>Keyframes</h4>
          <ol className="flow-react-list art-timeline-list">
            {current.tracks.flatMap((track) =>
              track.keyframes.map((keyframe) => (
                <li key={`${track.targetId}-${keyframe.frame}`}>
                  <button
                    type="button"
                    aria-current={selectedKeyframe?.targetId === track.targetId && selectedKeyframe.frame === keyframe.frame ? "true" : undefined}
                    onClick={() => selectKeyframe(track.targetId, keyframe.frame)}
                  >
                    <span>{track.targetId}</span>
                    <small>Frame {keyframe.frame}</small>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(removeTimelineKeyframe(current, track.targetId, keyframe.frame));
                      if (selectedKeyframe?.targetId === track.targetId && selectedKeyframe.frame === keyframe.frame) setSelectedKeyframe(null);
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ol>
        </div>
      ) : null}
      {selectedTimelineKeyframe ? (
        <div className="art-timeline-keyframe-editor">
          <h4>Selected Keyframe</h4>
          <label className="flow-react-field">
            <span>Target</span>
            <input type="text" value={selectedTimelineKeyframe.trackTargetId} readOnly />
          </label>
          <label className="flow-react-field">
            <span>Frame</span>
            <input
              type="number"
              min={0}
              max={Math.max(0, current.frameCount - 1)}
              value={selectedTimelineKeyframe.keyframe.frame}
              onChange={(event) => updateSelectedKeyframe({ frame: Number(event.target.value) })}
            />
          </label>
          <div className="art-timeline-keyframe-actions">
            <button type="button" onClick={copySelectedKeyframe}>
              Copy Keyframe
            </button>
            <button type="button" onClick={duplicateSelectedKeyframe} disabled={current.frameCount <= 1}>
              Duplicate Next Frame
            </button>
            <button type="button" disabled={!copiedKeyframe || !component} onClick={() => pasteCopiedKeyframe(cleanFrame)}>
              Paste At Current Frame
            </button>
          </div>
          <ol className="flow-react-list art-timeline-property-list">
            {Object.entries(selectedTimelineKeyframe.keyframe.props).map(([key, value]) => {
              const valueType = timelinePropertyType(value);
              return (
                <li key={key}>
                  <label className="flow-react-field">
                    <span>{key}</span>
                    {valueType === "boolean" ? (
                      <select value={String(value)} onChange={(event) => updateSelectedKeyframeProp(key, event.target.value === "true")}>
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : (
                      <input
                        type={valueType === "number" ? "number" : "text"}
                        step={valueType === "number" ? "0.01" : undefined}
                        value={timelineValueInput(value)}
                        onChange={(event) => updateSelectedKeyframeProp(key, coerceTimelinePropertyValue(event.target.value, valueType))}
                      />
                    )}
                  </label>
                  <button type="button" onClick={() => removeSelectedKeyframeProp(key)}>
                    Clear
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="art-timeline-add-property">
            <label className="flow-react-field">
              <span>Property</span>
              <input
                type="text"
                list="art-timeline-property-suggestions"
                value={newPropertyName}
                placeholder="opacity"
                onChange={(event) => setNewPropertyName(event.target.value)}
              />
            </label>
            <label className="flow-react-field">
              <span>Type</span>
              <select value={newPropertyType} onChange={(event) => setNewPropertyType(event.target.value as "number" | "boolean" | "string")}>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="string">String</option>
              </select>
            </label>
            <label className="flow-react-field">
              <span>Value</span>
              {newPropertyType === "boolean" ? (
                <select value={newPropertyValue || "true"} onChange={(event) => setNewPropertyValue(event.target.value)}>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <input
                  type={newPropertyType === "number" ? "number" : "text"}
                  step={newPropertyType === "number" ? "0.01" : undefined}
                  value={newPropertyValue}
                  onChange={(event) => setNewPropertyValue(event.target.value)}
                />
              )}
            </label>
            <button
              type="button"
              onClick={() => {
                const propertyName = newPropertyName.trim();
                if (!propertyName) return;
                updateSelectedKeyframeProp(propertyName, coerceTimelinePropertyValue(newPropertyValue || (newPropertyType === "boolean" ? "true" : ""), newPropertyType));
                setNewPropertyName("");
                setNewPropertyValue("");
              }}
            >
              Add Property
            </button>
            <datalist id="art-timeline-property-suggestions">
              {TIMELINE_PROPERTY_SUGGESTIONS.map((property) => (
                <option value={property} key={property} />
              ))}
            </datalist>
          </div>
        </div>
      ) : null}
    </section>
  );
}
