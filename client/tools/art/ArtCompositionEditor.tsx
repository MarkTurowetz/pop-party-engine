import {
  useEffect,
  useRef,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
  addTimelinePropertyKeyframe,
  addTransformKeyframe,
  artTimelineOrDefault,
  copyTimelineFrameRange,
  copyTimelineKeyframe,
  createTimelineSegment,
  cutTimelineFrameRange,
  duplicateTimelineSegment,
  insertTimelineFrames,
  mergeDefaultArtVisibilityTimeline,
  moveTimelineCommandAt,
  pasteTimelineFrameRange,
  removeTimelineCommandAt,
  removeTimelineKeyframe,
  removeTimelineLabel,
  removeTimelineFrames,
  removeTimelineSegment,
  replaceTransformKeyframeFromComponent,
  timelineFrameRangeFromAnchor,
  timelineSegmentsForArt,
  type TimelineFrameClipboard,
  updateTimelineCommandAt,
  updateTimelineKeyframe,
  updateTimelineLabel,
  updateTimelineSettings
} from "./artTimelineModel";
import { findTimelineTargetComponent, timelineTargetLabel, timelineTargetOptionsFor } from "./artTimelineTargets";
import {
  artTimelinePlaybackDuration,
  playArtTimelinePreview,
  type ArtTimelinePreviewPlayback,
  type TimelinePreviewOverrides
} from "./artTimelinePreviewPlayer";
import { useArtCompositions } from "./useArtCompositions";
import {
  type TimelineCommand,
  type TimelineDocument,
  type TimelineKeyframe,
  type TimelineLabel,
  type TimelineProperties,
  type TimelinePropertyValue
} from "../../../shared/timeline-model";
import { timelineSnapshotAt } from "../../runtime/timelinePlayer";

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
const TIMELINE_VISIBLE_FRAME_LIMIT = 60;
const TIMELINE_EASING_OPTIONS = [
  { value: "linear", label: "Linear" },
  { value: "easeIn", label: "Ease In" },
  { value: "easeOut", label: "Ease Out" },
  { value: "easeInOut", label: "Ease In Out" },
  { value: "hold", label: "Hold" }
];
type LayerDropPlacement = "before" | "after";

type LayerDropTarget = {
  id: string;
  placement: LayerDropPlacement;
};
type TimelineMarkerSelection = { kind: "label"; name: string } | { kind: "command"; index: number; commandId?: string };
type TimelineDragItem =
  | { kind: "label"; name: string }
  | { kind: "command"; index: number; command: TimelineCommand }
  | { kind: "keyframe"; targetId: string; frame: number };

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

function timelinePropertyKeyList(value: string): string[] {
  return [...new Set(String(value || "").split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean))];
}

function isEditableTimelineShortcutTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

function isButtonTimelineShortcutTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest("button, [role='button']"));
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

function compositionTimelineTargetRoot(composition: ArtComposition): ArtComponent {
  return {
    id: composition.id || "composition",
    name: composition.name || "Composition",
    kind: "container",
    x: 0,
    y: 0,
    width: Number(composition.canvas?.width || 1),
    height: Number(composition.canvas?.height || 1),
    children: composition.components || []
  } as ArtComponent;
}

function timelineLabelsAtFrame(timeline: TimelineDocument, frame: number): TimelineLabel[] {
  return timeline.labels.filter((label) => label.frame === frame);
}

function timelineCommandsAtFrame(timeline: TimelineDocument, frame: number): { command: TimelineCommand; index: number }[] {
  return timeline.commands.map((command, index) => ({ command, index })).filter(({ command }) => command.frame === frame);
}

function timelineCommandLabel(command: TimelineCommand): string {
  if (command.type === "gotoAndPlay") return command.target ? `play ${command.target}` : "play";
  if (command.type === "gotoAndStop") return command.target ? `stop at ${command.target}` : "stop at";
  if (command.type === "playComponent") {
    if (command.target && command.event) return `play ${command.event}`;
    return "play component";
  }
  if (command.type === "stopComponent") {
    if (command.target && command.event) return `stop at ${command.event}`;
    return "stop component";
  }
  if (command.type === "emit") return command.event ? `emit ${command.event}` : "emit";
  return command.type;
}

function timelineCommandTitle(command: TimelineCommand): string {
  const details = [command.target ? `target: ${command.target}` : "", command.event ? `event: ${command.event}` : ""].filter(Boolean).join(" / ");
  return details ? `${command.type} (${details})` : command.type;
}

function findTimelineCommandIndex(timeline: TimelineDocument, previousCommand: TimelineCommand, fallbackIndex: number): number {
  if (previousCommand.id) {
    const idIndex = timeline.commands.findIndex((command) => command.id === previousCommand.id);
    if (idIndex >= 0) return idIndex;
  }
  const matchingIndex = timeline.commands.findIndex(
    (command) =>
      command.frame === previousCommand.frame &&
      command.type === previousCommand.type &&
      (command.target || "") === (previousCommand.target || "") &&
      (command.event || "") === (previousCommand.event || "")
  );
  return matchingIndex >= 0 ? matchingIndex : Math.max(0, Math.min(timeline.commands.length - 1, fallbackIndex));
}

function findLastTimelineCommandIndex(timeline: TimelineDocument, predicate: (command: TimelineCommand) => boolean): number {
  for (let index = timeline.commands.length - 1; index >= 0; index -= 1) {
    if (predicate(timeline.commands[index])) return index;
  }
  return -1;
}

function commandMarkerSelection(command: TimelineCommand, index: number): TimelineMarkerSelection {
  return { kind: "command", index, commandId: command.id };
}

function isCommandMarkerSelected(selection: TimelineMarkerSelection | null, command: TimelineCommand, index: number): boolean {
  if (selection?.kind !== "command") return false;
  if (selection.commandId && command.id) return selection.commandId === command.id;
  return selection.index === index;
}

function timelineCommandFrameOrder(timeline: TimelineDocument, index: number): { position: number; total: number } {
  const command = timeline.commands[index];
  if (!command) return { position: 0, total: 0 };
  const sameFrame = timeline.commands.map((item, commandIndex) => ({ command: item, index: commandIndex })).filter(({ command: item }) => item.frame === command.frame);
  return {
    position: sameFrame.findIndex((item) => item.index === index) + 1,
    total: sameFrame.length
  };
}

function canMoveTimelineCommandInFrame(timeline: TimelineDocument, index: number, direction: -1 | 1): boolean {
  const command = timeline.commands[index];
  const target = timeline.commands[index + direction];
  return Boolean(command && target && command.frame === target.frame);
}

function timelineCommandUsesComponentTarget(type: string): boolean {
  return type === "emit" || type === "playComponent" || type === "stopComponent";
}

function timelineCommandUsesTarget(type: string): boolean {
  return type !== "stop";
}

function timelineCommandUsesEvent(type: string): boolean {
  return type === "emit" || type === "playComponent" || type === "stopComponent";
}

function timelineCommandTargetLabel(type: string): string {
  return timelineCommandUsesComponentTarget(type) ? "Target Component" : "Target Label";
}

function timelineCommandTargetPlaceholder(type: string, fallbackComponentId = ""): string {
  return timelineCommandUsesComponentTarget(type) ? fallbackComponentId || "component-id" : "appear";
}

function timelineCommandEventLabel(type: string): string {
  if (type === "playComponent" || type === "stopComponent") return "Animation Label";
  if (type === "emit") return "Event";
  return "Event";
}

function timelineCommandEventPlaceholder(type: string): string {
  if (type === "playComponent" || type === "stopComponent") return "appear";
  if (type === "emit") return "pop-name";
  return "";
}

function timelineTargetAnimationLabels(component: ArtComponent | undefined, targetId: string): TimelineLabel[] {
  const target = component && targetId ? findTimelineTargetComponent([component], targetId) : undefined;
  const targetTimeline = artTimelineOrDefault((target?.timeline || null) as TimelineDocument | null);
  return targetTimeline.labels;
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
  const [timelinePreviewOverrides, setTimelinePreviewOverrides] = useState<TimelinePreviewOverrides | null>(null);
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
      ? findTimelineTargetComponent(composition.components || [], [...selectedComponentIds][0])
      : undefined;
  const activeTimeline = (selectedComponent?.timeline || composition?.timeline || null) as TimelineDocument | null;
  const baseTimelineFrameOverrides = useMemo(() => {
    const timeline = artTimelineOrDefault(activeTimeline);
    if (!activeTimeline || timeline.tracks.length === 0) return null;
    return timelineSnapshotAt(timeline, timelinePreviewFrame).targets;
  }, [activeTimeline, timelinePreviewFrame]);
  const timelineFrameOverrides = timelinePreviewOverrides || baseTimelineFrameOverrides;
  const previewTimelineFrame = (frame: number, overrides?: TimelinePreviewOverrides | null) => {
    setTimelinePreviewFrame(frame);
    setTimelinePreviewOverrides(overrides || null);
  };
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
          onPreviewTimelineOverrides={previewTimelineFrame}
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
  onPreviewTimelineOverrides,
  tree
}: {
  controller: ArtCompositionsController;
  composition: ArtComposition | null;
  compositions: ArtComposition[];
  component: ArtComponent | null;
  onPreviewTimelineOverrides: (frame: number, overrides?: TimelinePreviewOverrides | null) => void;
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
            component={compositionTimelineTargetRoot(composition)}
            includeRootTarget={false}
            onChange={(timeline) => controller.updateComposition(composition.id, { timeline })}
            onPreviewFrame={onPreviewTimelineOverrides}
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
        onPreviewFrame={onPreviewTimelineOverrides}
      />
    </section>
  );
}

function ArtTimelinePanel({
  title,
  timeline,
  component,
  includeRootTarget = true,
  onChange,
  onPreviewFrame
}: {
  title: string;
  timeline: TimelineDocument | null | undefined;
  component?: ArtComponent;
  includeRootTarget?: boolean;
  onChange: (timeline: TimelineDocument) => void;
  onPreviewFrame?: (frame: number, overrides?: TimelinePreviewOverrides | null) => void;
}) {
  const current = useMemo(() => artTimelineOrDefault(timeline), [timeline]);
  const [frame, setFrame] = useState(0);
  const [labelName, setLabelName] = useState("");
  const [segmentName, setSegmentName] = useState("");
  const [segmentDurationFrames, setSegmentDurationFrames] = useState(15);
  const [duplicateSegmentSource, setDuplicateSegmentSource] = useState("");
  const [duplicateSegmentName, setDuplicateSegmentName] = useState("");
  const [commandType, setCommandType] = useState("stop");
  const [commandTarget, setCommandTarget] = useState("");
  const [commandEvent, setCommandEvent] = useState("");
  const [frameEditCount, setFrameEditCount] = useState(1);
  const [frameRangeAnchor, setFrameRangeAnchor] = useState<number | null>(null);
  const [frameRangeFocus, setFrameRangeFocus] = useState<number | null>(null);
  const [frameWindowStart, setFrameWindowStart] = useState(0);
  const [keyframeTargetId, setKeyframeTargetId] = useState("");
  const [keyframePropertyNames, setKeyframePropertyNames] = useState("scale");
  const [playStartLabel, setPlayStartLabel] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ targetId: string; frame: number } | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<TimelineMarkerSelection | null>(null);
  const [timelineDragItem, setTimelineDragItem] = useState<TimelineDragItem | null>(null);
  const [timelineDropFrame, setTimelineDropFrame] = useState<number | null>(null);
  const [copiedKeyframe, setCopiedKeyframe] = useState<{ targetId: string; frame: number } | null>(null);
  const [copiedFrameRange, setCopiedFrameRange] = useState<TimelineFrameClipboard | null>(null);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<"number" | "boolean" | "string">("number");
  const [newPropertyValue, setNewPropertyValue] = useState("");
  const playbackRef = useRef<ArtTimelinePreviewPlayback | null>(null);
  const cleanFrame = Math.max(0, Math.min(Math.max(0, current.frameCount - 1), Math.round(Number(frame) || 0)));
  const cleanTimelineFrame = (value: number): number => Math.max(0, Math.min(Math.max(0, current.frameCount - 1), Math.round(Number(value) || 0)));
  const selectedTimelineKeyframe = useMemo(() => findTimelineKeyframe(current, selectedKeyframe), [current, selectedKeyframe]);
  const selectedTimelineMarker = useMemo(() => {
    if (!selectedMarker) return null;
    if (selectedMarker.kind === "label") {
      const label = current.labels.find((item) => item.name === selectedMarker.name);
      return label ? { kind: "label" as const, label } : null;
    }
    const idIndex = selectedMarker.commandId ? current.commands.findIndex((command) => command.id === selectedMarker.commandId) : -1;
    const index = idIndex >= 0 ? idIndex : selectedMarker.index;
    const command = current.commands[index];
    return command ? { kind: "command" as const, command, index } : null;
  }, [current, selectedMarker]);
  const visibleTimelineFrameCount = Math.min(current.frameCount, TIMELINE_VISIBLE_FRAME_LIMIT);
  const maxFrameWindowStart = Math.max(0, current.frameCount - visibleTimelineFrameCount);
  const cleanFrameWindowStart = Math.max(0, Math.min(maxFrameWindowStart, Math.round(Number(frameWindowStart) || 0)));
  const visibleTimelineFrames = Array.from({ length: visibleTimelineFrameCount }, (_, index) => cleanFrameWindowStart + index);
  const visibleFrameEnd = visibleTimelineFrames.length ? visibleTimelineFrames[visibleTimelineFrames.length - 1] : 0;
  const selectedFrameRangeCount = Math.max(1, Math.min(Math.max(1, current.frameCount - cleanFrame), Math.round(Number(frameEditCount) || 1)));
  const selectedFrameRangeEnd = Math.min(current.frameCount - 1, cleanFrame + selectedFrameRangeCount - 1);
  const hasTimelineLanes = current.labels.length > 0 || current.commands.length > 0 || current.tracks.length > 0;
  const timelineSegments = useMemo(() => timelineSegmentsForArt(current), [current]);
  const keyframeTargets = useMemo(() => timelineTargetOptionsFor(component, { includeRoot: includeRootTarget }), [component, includeRootTarget]);
  const activeKeyframeTargetId = keyframeTargets.some((target) => target.id === keyframeTargetId)
    ? keyframeTargetId
    : component?.id || keyframeTargets[0]?.id || "";
  const activeKeyframeTarget = component && activeKeyframeTargetId ? findTimelineTargetComponent([component], activeKeyframeTargetId) : undefined;
  const commandTargetLabel = timelineCommandTargetLabel(commandType);
  const commandTargetPlaceholder = timelineCommandTargetPlaceholder(commandType, activeKeyframeTargetId);
  const commandEventLabel = timelineCommandEventLabel(commandType);
  const commandEventPlaceholder = timelineCommandEventPlaceholder(commandType);
  const commandTargetAnimationLabels = timelineTargetAnimationLabels(component, commandTarget);
  const activePlayStart = current.labels.some((label) => label.name === playStartLabel) ? playStartLabel : "";
  const activeDuplicateSegmentSource = current.labels.some((label) => label.name === duplicateSegmentSource)
    ? duplicateSegmentSource
    : current.labels[0]?.name || "";
  const activePlaybackDuration = useMemo(
    () => artTimelinePlaybackDuration(current, component, activePlayStart || cleanFrame),
    [activePlayStart, cleanFrame, component, current]
  );

  function defaultCommandTargetForType(type: string): string {
    if (type === "stop") return "";
    if (timelineCommandUsesComponentTarget(type)) return activeKeyframeTargetId || keyframeTargets[0]?.id || "";
    return activePlayStart || current.labels[0]?.name || "";
  }

  function defaultCommandEventForType(type: string, targetId: string, previousEvent = ""): string {
    if (type === "playComponent" || type === "stopComponent") {
      const labels = timelineTargetAnimationLabels(component, targetId);
      if (labels.some((label) => label.name === previousEvent)) return previousEvent;
      return labels[0]?.name || "appear";
    }
    if (type === "emit") return previousEvent;
    return "";
  }

  function commandDefaultsForType(type: string, previousTarget = "", previousEvent = ""): { target: string; event: string } {
    const target = type === "stop" ? "" : previousTarget || defaultCommandTargetForType(type);
    return { target, event: defaultCommandEventForType(type, target, previousEvent) };
  }

  function setNewCommandType(nextType: string): void {
    const defaults = commandDefaultsForType(nextType, "", commandEvent);
    setCommandType(nextType);
    setCommandTarget(defaults.target);
    setCommandEvent(defaults.event);
  }

  function setNewCommandTarget(nextTarget: string): void {
    setCommandTarget(nextTarget);
    if (commandType === "playComponent" || commandType === "stopComponent") {
      setCommandEvent(defaultCommandEventForType(commandType, nextTarget, commandEvent));
    }
  }

  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
      playbackRef.current = null;
    };
  }, [component?.id, current]);

  function windowStartForFrame(nextFrame: number, currentWindowStart = cleanFrameWindowStart): number {
    if (nextFrame < currentWindowStart) return Math.max(0, Math.min(maxFrameWindowStart, nextFrame));
    if (nextFrame > currentWindowStart + visibleTimelineFrameCount - 1) return Math.max(0, Math.min(maxFrameWindowStart, nextFrame - visibleTimelineFrameCount + 1));
    return currentWindowStart;
  }

  function setTimelineWindowStart(nextStart: number): void {
    setFrameWindowStart(Math.max(0, Math.min(maxFrameWindowStart, Math.round(Number(nextStart) || 0))));
  }

  function previewFrame(nextFrame: number): void {
    const normalizedFrame = cleanTimelineFrame(nextFrame);
    setFrame(normalizedFrame);
    setFrameEditCount(1);
    setFrameRangeAnchor(null);
    setFrameRangeFocus(null);
    setFrameWindowStart(windowStartForFrame(normalizedFrame));
    onPreviewFrame?.(normalizedFrame);
  }

  function setManualFrameRangeCount(nextCount: number): void {
    setFrameEditCount(Math.max(1, Math.min(1000, Math.round(Number(nextCount) || 1))));
    setFrameRangeAnchor(null);
    setFrameRangeFocus(null);
  }

  function frameInSelectedRange(frameIndex: number): boolean {
    return frameIndex >= cleanFrame && frameIndex <= selectedFrameRangeEnd;
  }

  function selectFrameRangeTo(nextFrame: number): void {
    const normalizedFrame = cleanTimelineFrame(nextFrame);
    const anchorFrame = cleanTimelineFrame(frameRangeAnchor ?? cleanFrame);
    const range = timelineFrameRangeFromAnchor(current.frameCount, anchorFrame, normalizedFrame);
    setFrame(range.startFrame);
    setFrameRangeAnchor(anchorFrame);
    setFrameRangeFocus(normalizedFrame);
    setFrameEditCount(range.frameCount);
    setFrameWindowStart(windowStartForFrame(normalizedFrame));
    onPreviewFrame?.(range.startFrame);
  }

  function previewFrameWithOverrides(nextFrame: number, overrides: TimelinePreviewOverrides | null): void {
    const normalizedFrame = cleanTimelineFrame(nextFrame);
    setFrame(normalizedFrame);
    setFrameWindowStart(windowStartForFrame(normalizedFrame));
    onPreviewFrame?.(normalizedFrame, overrides);
  }

  function stopPlayback(): void {
    playbackRef.current?.stop();
    playbackRef.current = null;
    onPreviewFrame?.(cleanFrame, null);
    setIsPlaying(false);
  }

  function playTimeline(): void {
    stopPlayback();
    const playback = playArtTimelinePreview({
      timeline: current,
      component,
      start: activePlayStart || cleanFrame,
      onPreview: (previewFrameValue, overrides) => previewFrameWithOverrides(previewFrameValue, overrides),
      onComplete: () => {
        playbackRef.current = null;
        setIsPlaying(false);
      }
    });
    playbackRef.current = playback;
    setIsPlaying(true);
  }

  function createSegmentAtCurrentFrame(): void {
    const nextTimeline = createTimelineSegment(current, cleanFrame, segmentName, segmentDurationFrames);
    const existingNames = new Set(current.labels.map((label) => label.name));
    const nextLabel = nextTimeline.labels.find((label) => !existingNames.has(label.name) && label.frame === cleanFrame);
    applyTimelineFrameEdit(nextTimeline, cleanFrame);
    if (nextLabel) {
      setSelectedKeyframe(null);
      setSelectedMarker({ kind: "label", name: nextLabel.name });
      setPlayStartLabel(nextLabel.name);
    }
    setSegmentName("");
  }

  function duplicateSelectedSegment(): void {
    if (!activeDuplicateSegmentSource) return;
    const nextTimeline = duplicateTimelineSegment(current, activeDuplicateSegmentSource, duplicateSegmentName || `${activeDuplicateSegmentSource} Copy`);
    const previousNames = new Set(current.labels.map((label) => label.name));
    const nextLabel = nextTimeline.labels.find((label) => !previousNames.has(label.name));
    if (nextLabel) {
      applyTimelineFrameEdit(nextTimeline, nextLabel.frame);
      setSelectedKeyframe(null);
      setSelectedMarker({ kind: "label", name: nextLabel.name });
      setPlayStartLabel(nextLabel.name);
    } else {
      applyTimelineFrameEdit(nextTimeline, cleanFrame);
    }
    setDuplicateSegmentName("");
  }

  function deleteSegment(label: string): void {
    const nextTimeline = removeTimelineSegment(current, label);
    if (selectedMarker?.kind === "label" && selectedMarker.name === label) setSelectedMarker(null);
    if (activePlayStart === label) setPlayStartLabel("");
    if (duplicateSegmentSource === label) setDuplicateSegmentSource("");
    applyTimelineFrameEdit(nextTimeline, Math.min(cleanFrame, Math.max(0, nextTimeline.frameCount - 1)));
  }

  function applyTimelineFrameEdit(nextTimeline: TimelineDocument, nextFrame = cleanFrame): void {
    stopPlayback();
    onChange(nextTimeline);
    previewFrame(Math.max(0, Math.min(Math.max(0, nextTimeline.frameCount - 1), nextFrame)));
  }

  function copyFrameRangeAtCurrentFrame(): void {
    setCopiedKeyframe(null);
    setCopiedFrameRange(copyTimelineFrameRange(current, cleanFrame, selectedFrameRangeCount));
  }

  function cutFrameRangeAtCurrentFrame(): void {
    const result = cutTimelineFrameRange(current, cleanFrame, selectedFrameRangeCount);
    setCopiedKeyframe(null);
    setCopiedFrameRange(result.clipboard);
    setSelectedKeyframe(null);
    setSelectedMarker(null);
    applyTimelineFrameEdit(result.timeline, cleanFrame);
  }

  function pasteFrameRangeAtCurrentFrame(): void {
    if (!copiedFrameRange) return;
    setSelectedKeyframe(null);
    setSelectedMarker(null);
    applyTimelineFrameEdit(pasteTimelineFrameRange(current, copiedFrameRange, cleanFrame), cleanFrame);
  }

  function removeSelectedTimelineItem(): boolean {
    if (selectedTimelineKeyframe) {
      onChange(removeTimelineKeyframe(current, selectedTimelineKeyframe.trackTargetId, selectedTimelineKeyframe.keyframe.frame));
      setSelectedKeyframe(null);
      return true;
    }
    if (!selectedTimelineMarker) return false;
    if (selectedTimelineMarker.kind === "label") {
      onChange(removeTimelineLabel(current, selectedTimelineMarker.label.name));
      setSelectedMarker(null);
      return true;
    }
    onChange(removeTimelineCommandAt(current, selectedTimelineMarker.index));
    setSelectedMarker(null);
    return true;
  }

  function handleTimelineKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (isEditableTimelineShortcutTarget(event.target)) return;
    const usesModifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (usesModifier && key === "c") {
      event.preventDefault();
      if (selectedTimelineKeyframe) copySelectedKeyframe();
      else copyFrameRangeAtCurrentFrame();
      return;
    }
    if (usesModifier && key === "x") {
      event.preventDefault();
      if (selectedTimelineKeyframe) {
        copySelectedKeyframe();
        removeSelectedTimelineItem();
        return;
      }
      if (current.frameCount > 1) cutFrameRangeAtCurrentFrame();
      return;
    }
    if (usesModifier && key === "v") {
      event.preventDefault();
      if (copiedFrameRange) pasteFrameRangeAtCurrentFrame();
      else if (copiedKeyframe) pasteCopiedKeyframe(cleanFrame);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (removeSelectedTimelineItem()) return;
      if (current.frameCount > 1) {
        setSelectedKeyframe(null);
        setSelectedMarker(null);
        applyTimelineFrameEdit(removeTimelineFrames(current, cleanFrame, selectedFrameRangeCount), cleanFrame);
      }
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      if (isButtonTimelineShortcutTarget(event.target)) return;
      event.preventDefault();
      if (isPlaying) stopPlayback();
      else if (current.frameCount > 1) playTimeline();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      previewFrame(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      previewFrame(Math.max(0, current.frameCount - 1));
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      const currentFocusFrame = event.shiftKey ? cleanTimelineFrame(frameRangeFocus ?? cleanFrame) : cleanFrame;
      const nextFrame = cleanTimelineFrame(currentFocusFrame + delta);
      if (event.shiftKey) selectFrameRangeTo(nextFrame);
      else previewFrame(nextFrame);
    }
  }

  function selectKeyframe(targetId: string, keyframeFrame: number): void {
    stopPlayback();
    setSelectedMarker(null);
    setSelectedKeyframe({ targetId, frame: keyframeFrame });
    previewFrame(keyframeFrame);
  }

  function selectTimelineMarker(selection: TimelineMarkerSelection, markerFrame: number): void {
    stopPlayback();
    setSelectedKeyframe(null);
    setSelectedMarker(selection);
    if (selection.kind === "label") setPlayStartLabel(selection.name);
    previewFrame(markerFrame);
  }

  function updateSelectedMarkerFrame(nextFrame: number): void {
    if (!selectedTimelineMarker) return;
    const normalizedFrame = Math.max(0, Math.min(current.frameCount - 1, Math.round(Number(nextFrame) || 0)));
    if (selectedTimelineMarker.kind === "label") {
      const nextTimeline = updateTimelineLabel(current, selectedTimelineMarker.label.name, { frame: normalizedFrame });
      onChange(nextTimeline);
      previewFrame(normalizedFrame);
      return;
    }
    const nextTimeline = updateTimelineCommandAt(current, selectedTimelineMarker.index, { frame: normalizedFrame });
    onChange(nextTimeline);
    const nextIndex = findTimelineCommandIndex(nextTimeline, selectedTimelineMarker.command, selectedTimelineMarker.index);
    setSelectedMarker(commandMarkerSelection(nextTimeline.commands[nextIndex], nextIndex));
    previewFrame(normalizedFrame);
  }

  function updateSelectedLabelName(name: string): void {
    if (!selectedTimelineMarker || selectedTimelineMarker.kind !== "label") return;
    const nextTimeline = updateTimelineLabel(current, selectedTimelineMarker.label.name, { name });
    const nextName = name.trim() || selectedTimelineMarker.label.name;
    onChange(nextTimeline);
    setSelectedMarker({ kind: "label", name: nextName });
  }

  function updateSelectedCommand(patch: Partial<Pick<TimelineCommand, "type" | "target" | "event">>): void {
    if (!selectedTimelineMarker || selectedTimelineMarker.kind !== "command") return;
    const nextTimeline = updateTimelineCommandAt(current, selectedTimelineMarker.index, patch);
    onChange(nextTimeline);
    const nextIndex = findTimelineCommandIndex(nextTimeline, selectedTimelineMarker.command, selectedTimelineMarker.index);
    setSelectedMarker(commandMarkerSelection(nextTimeline.commands[nextIndex], nextIndex));
  }

  function setSelectedCommandType(nextType: string): void {
    if (!selectedTimelineMarker || selectedTimelineMarker.kind !== "command") return;
    updateSelectedCommand({ type: nextType, ...commandDefaultsForType(nextType, "", selectedTimelineMarker.command.event || "") });
  }

  function setSelectedCommandTarget(nextTarget: string): void {
    if (!selectedTimelineMarker || selectedTimelineMarker.kind !== "command") return;
    const type = selectedTimelineMarker.command.type;
    updateSelectedCommand({
      target: nextTarget,
      event: defaultCommandEventForType(type, nextTarget, selectedTimelineMarker.command.event || "")
    });
  }

  function moveCommand(index: number, direction: -1 | 1): void {
    const command = current.commands[index];
    if (!command || !canMoveTimelineCommandInFrame(current, index, direction)) return;
    const nextTimeline = moveTimelineCommandAt(current, index, direction);
    const nextIndex = index + direction;
    onChange(nextTimeline);
    setSelectedKeyframe(null);
    setSelectedMarker(commandMarkerSelection(nextTimeline.commands[nextIndex], nextIndex));
    previewFrame(command.frame);
  }

  function selectCommandFrame(commands: { command: TimelineCommand; index: number }[], commandFrame: number): void {
    if (!commands.length) {
      previewFrame(commandFrame);
      return;
    }
    const selectedCommandIndex =
      selectedMarker?.kind === "command" ? commands.findIndex(({ command, index }) => isCommandMarkerSelected(selectedMarker, command, index)) : -1;
    const nextCommand = commands[(selectedCommandIndex + 1) % commands.length] || commands[0];
    selectTimelineMarker(commandMarkerSelection(nextCommand.command, nextCommand.index), commandFrame);
  }

  function startTimelineDrag(event: ReactDragEvent<HTMLElement>, item: TimelineDragItem): void {
    stopPlayback();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-art-timeline-item", JSON.stringify(item));
    setTimelineDragItem(item);
  }

  function handleTimelineFrameDragOver(event: ReactDragEvent<HTMLElement>, frameIndex: number): void {
    if (!timelineDragItem) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTimelineDropFrame(frameIndex);
  }

  function handleTimelineFrameDrop(event: ReactDragEvent<HTMLElement>, frameIndex: number): void {
    if (!timelineDragItem) return;
    event.preventDefault();
    const normalizedFrame = Math.max(0, Math.min(current.frameCount - 1, Math.round(Number(frameIndex) || 0)));
    if (timelineDragItem.kind === "label") {
      const nextTimeline = updateTimelineLabel(current, timelineDragItem.name, { frame: normalizedFrame });
      onChange(nextTimeline);
      setSelectedKeyframe(null);
      setSelectedMarker({ kind: "label", name: timelineDragItem.name });
      previewFrame(normalizedFrame);
    } else if (timelineDragItem.kind === "command") {
      const nextTimeline = updateTimelineCommandAt(current, timelineDragItem.index, { frame: normalizedFrame });
      const nextIndex = findTimelineCommandIndex(nextTimeline, timelineDragItem.command, timelineDragItem.index);
      onChange(nextTimeline);
      setSelectedKeyframe(null);
      setSelectedMarker(commandMarkerSelection(nextTimeline.commands[nextIndex], nextIndex));
      previewFrame(normalizedFrame);
    } else {
      const nextTimeline = updateTimelineKeyframe(current, timelineDragItem.targetId, timelineDragItem.frame, { frame: normalizedFrame });
      onChange(nextTimeline);
      setSelectedMarker(null);
      setSelectedKeyframe({ targetId: timelineDragItem.targetId, frame: normalizedFrame });
      previewFrame(normalizedFrame);
    }
    setTimelineDragItem(null);
    setTimelineDropFrame(null);
  }

  function endTimelineDrag(): void {
    setTimelineDragItem(null);
    setTimelineDropFrame(null);
  }

  function updateSelectedKeyframe(patch: Partial<Pick<TimelineKeyframe, "frame" | "props" | "easing">>): void {
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
    setCopiedFrameRange(null);
    setCopiedKeyframe({
      targetId: selectedTimelineKeyframe.trackTargetId,
      frame: selectedTimelineKeyframe.keyframe.frame
    });
  }

  function pasteCopiedKeyframe(nextFrame = cleanFrame): void {
    if (!copiedKeyframe || !activeKeyframeTarget) return;
    const normalizedFrame = Math.max(0, Math.min(current.frameCount - 1, Math.round(Number(nextFrame) || 0)));
    const nextTimeline = copyTimelineKeyframe(current, copiedKeyframe.targetId, copiedKeyframe.frame, activeKeyframeTarget.id, normalizedFrame);
    onChange(nextTimeline);
    setSelectedKeyframe({ targetId: activeKeyframeTarget.id, frame: normalizedFrame });
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

  function addPropertyKeyframeAtCurrentFrame(): void {
    if (!activeKeyframeTarget) return;
    const propertyKeys = timelinePropertyKeyList(keyframePropertyNames);
    if (!propertyKeys.length) return;
    const nextTimeline = addTimelinePropertyKeyframe(current, activeKeyframeTarget, cleanFrame, propertyKeys);
    onChange(nextTimeline);
    setSelectedMarker(null);
    setSelectedKeyframe({ targetId: activeKeyframeTarget.id, frame: cleanFrame });
    previewFrame(cleanFrame);
  }

  function recaptureSelectedKeyframeProperties(): void {
    if (!selectedTimelineKeyframe || !component) return;
    const target = findTimelineTargetComponent([component], selectedTimelineKeyframe.trackTargetId);
    const propertyKeys = timelinePropertyKeyList(keyframePropertyNames);
    if (!target || !propertyKeys.length) return;
    const nextTimeline = addTimelinePropertyKeyframe(current, target, selectedTimelineKeyframe.keyframe.frame, propertyKeys);
    onChange(nextTimeline);
    setSelectedKeyframe({ targetId: selectedTimelineKeyframe.trackTargetId, frame: selectedTimelineKeyframe.keyframe.frame });
    previewFrame(selectedTimelineKeyframe.keyframe.frame);
  }

  function recaptureSelectedKeyframe(): void {
    if (!selectedTimelineKeyframe || !component) return;
    const target = findTimelineTargetComponent([component], selectedTimelineKeyframe.trackTargetId);
    if (!target) return;
    const nextTimeline = replaceTransformKeyframeFromComponent(current, target, selectedTimelineKeyframe.keyframe.frame);
    onChange(nextTimeline);
    setSelectedKeyframe({ targetId: selectedTimelineKeyframe.trackTargetId, frame: selectedTimelineKeyframe.keyframe.frame });
    previewFrame(selectedTimelineKeyframe.keyframe.frame);
  }

  return (
    <section
      className="art-timeline-panel"
      data-art-timeline-panel
      tabIndex={0}
      aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End Space Meta+C Meta+X Meta+V Control+C Control+X Control+V Delete Backspace"
      onKeyDown={handleTimelineKeyDown}
    >
      <div className="art-timeline-header">
        <h3>{title}</h3>
        <button type="button" disabled={!activeKeyframeTarget} onClick={() => onChange(mergeDefaultArtVisibilityTimeline(current, activeKeyframeTarget))}>
          Add Visibility Defaults
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
        <label className="flow-react-field">
          <span>Play From</span>
          <select value={activePlayStart} onChange={(event) => setPlayStartLabel(event.target.value)}>
            <option value="">Current Frame</option>
            {current.labels.map((label) => (
              <option key={label.name} value={label.name}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={playTimeline} disabled={isPlaying || current.frameCount <= 1}>
          Play
        </button>
        <button type="button" onClick={stopPlayback} disabled={!isPlaying}>
          Stop
        </button>
        <button type="button" onClick={() => previewFrame(0)}>
          First
        </button>
        <span className="art-timeline-playback-duration">{Math.round(activePlaybackDuration)}ms</span>
      </div>
      <div className="art-timeline-segment-editor">
        <label className="flow-react-field">
          <span>Animation Name</span>
          <input type="text" value={segmentName} placeholder="pop" onChange={(event) => setSegmentName(event.target.value)} />
        </label>
        <label className="flow-react-field">
          <span>Duration Frames</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={segmentDurationFrames}
            onChange={(event) => setSegmentDurationFrames(Math.max(1, Math.min(1000, Math.round(Number(event.target.value) || 1))))}
          />
        </label>
        <button type="button" onClick={createSegmentAtCurrentFrame}>
          New Animation
        </button>
        <label className="flow-react-field">
          <span>Duplicate</span>
          <select value={activeDuplicateSegmentSource} disabled={!current.labels.length} onChange={(event) => setDuplicateSegmentSource(event.target.value)}>
            {current.labels.map((label) => (
              <option key={label.name} value={label.name}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flow-react-field">
          <span>New Name</span>
          <input
            type="text"
            value={duplicateSegmentName}
            placeholder={activeDuplicateSegmentSource ? `${activeDuplicateSegmentSource} Copy` : "Animation Copy"}
            onChange={(event) => setDuplicateSegmentName(event.target.value)}
          />
        </label>
        <button type="button" disabled={!activeDuplicateSegmentSource} onClick={duplicateSelectedSegment}>
          Duplicate Animation
        </button>
      </div>
      {timelineSegments.length ? (
        <div className="art-timeline-segment-list" aria-label="Timeline animation segments">
          {timelineSegments.map((segment) => (
            <div
              key={segment.label}
              className="art-timeline-segment-item"
              data-art-timeline-segment-active={activePlayStart === segment.label ? "true" : "false"}
            >
              <button
                type="button"
                onClick={() => {
                  setPlayStartLabel(segment.label);
                  selectTimelineMarker({ kind: "label", name: segment.label }, segment.startFrame);
                }}
              >
                <span>{segment.label}</span>
                <small>
                  {segment.startFrame}-{segment.endFrame} / {Math.round(artTimelinePlaybackDuration(current, component, segment.label))}ms
                </small>
              </button>
              <button type="button" onClick={() => deleteSegment(segment.label)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="art-timeline-frame-editor">
        <label className="flow-react-field">
          <span>Range Frames</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={frameEditCount}
            onChange={(event) => setManualFrameRangeCount(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={() => applyTimelineFrameEdit(insertTimelineFrames(current, cleanFrame, selectedFrameRangeCount), cleanFrame)}>
          Insert Frames
        </button>
        <button
          type="button"
          onClick={() => applyTimelineFrameEdit(removeTimelineFrames(current, cleanFrame, selectedFrameRangeCount), cleanFrame)}
          disabled={current.frameCount <= 1}
        >
          Delete Frames
        </button>
        <button type="button" onClick={copyFrameRangeAtCurrentFrame}>
          Copy Frames
        </button>
        <button type="button" onClick={cutFrameRangeAtCurrentFrame} disabled={current.frameCount <= 1}>
          Cut Frames
        </button>
        <button type="button" onClick={pasteFrameRangeAtCurrentFrame} disabled={!copiedFrameRange}>
          Paste Frames
        </button>
        {copiedFrameRange ? (
          <span className="art-timeline-frame-clipboard-summary">
            Clipboard: {copiedFrameRange.frameCount} frame{copiedFrameRange.frameCount === 1 ? "" : "s"}
          </span>
        ) : null}
        <span className="art-timeline-frame-clipboard-summary">
          Selected: {cleanFrame}-{selectedFrameRangeEnd}
        </span>
      </div>
      <div className="art-timeline-window-controls">
        <button type="button" onClick={() => setTimelineWindowStart(cleanFrameWindowStart - visibleTimelineFrameCount)} disabled={cleanFrameWindowStart <= 0}>
          Prev Frames
        </button>
        <label className="flow-react-field">
          <span>Window Start</span>
          <input
            type="number"
            min={0}
            max={maxFrameWindowStart}
            value={cleanFrameWindowStart}
            onChange={(event) => setTimelineWindowStart(Number(event.target.value))}
          />
        </label>
        <span className="art-timeline-window-summary">
          Frames {cleanFrameWindowStart}-{visibleFrameEnd} of {Math.max(0, current.frameCount - 1)}
        </span>
        <button
          type="button"
          onClick={() => setTimelineWindowStart(cleanFrameWindowStart + visibleTimelineFrameCount)}
          disabled={cleanFrameWindowStart >= maxFrameWindowStart}
        >
          Next Frames
        </button>
      </div>
      <div className="art-timeline-ruler" style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}>
        {visibleTimelineFrames.map((frameIndex) => (
          <button
            type="button"
            key={frameIndex}
            aria-current={cleanFrame === frameIndex ? "true" : undefined}
            data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
            onClick={(event) => {
              stopPlayback();
              if (event.shiftKey) selectFrameRangeTo(frameIndex);
              else previewFrame(frameIndex);
            }}
            title={`Frame ${frameIndex}${frameInSelectedRange(frameIndex) ? " / selected range" : ""}`}
          >
            {frameIndex % 5 === 0 ? frameIndex : ""}
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
                {visibleTimelineFrames.map((frameIndex) => {
                  const labels = timelineLabelsAtFrame(current, frameIndex);
                  return (
                    <button
                      type="button"
                      key={frameIndex}
                      className="art-timeline-lane-frame"
                      aria-current={cleanFrame === frameIndex ? "true" : undefined}
                      data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
                      data-art-timeline-has-label={labels.length ? "true" : "false"}
                      data-art-timeline-marker-selected={
                        labels.some((label) => selectedMarker?.kind === "label" && selectedMarker.name === label.name) ? "true" : "false"
                      }
                      data-art-timeline-drop-target={timelineDropFrame === frameIndex ? "true" : "false"}
                      draggable={labels.length > 0}
                      title={labels.length ? `Frame ${frameIndex}: ${labels.map((label) => label.name).join(", ")}` : `Preview frame ${frameIndex}`}
                      onClick={() => (labels[0] ? selectTimelineMarker({ kind: "label", name: labels[0].name }, frameIndex) : previewFrame(frameIndex))}
                      onDragStart={(event) => {
                        if (!labels[0]) return;
                        startTimelineDrag(event, { kind: "label", name: labels[0].name });
                      }}
                      onDragOver={(event) => handleTimelineFrameDragOver(event, frameIndex)}
                      onDrop={(event) => handleTimelineFrameDrop(event, frameIndex)}
                      onDragEnd={endTimelineDrag}
                      onDragLeave={() => {
                        if (timelineDropFrame === frameIndex) setTimelineDropFrame(null);
                      }}
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
                {visibleTimelineFrames.map((frameIndex) => {
                  const commands = timelineCommandsAtFrame(current, frameIndex);
                  const selectedFrameCommand =
                    selectedMarker?.kind === "command"
                      ? commands.find(({ command, index: commandIndex }) => isCommandMarkerSelected(selectedMarker, command, commandIndex))
                      : undefined;
                  const dragCommand = selectedFrameCommand || commands[0];
                  return (
                    <button
                      type="button"
                      key={frameIndex}
                      className="art-timeline-lane-frame"
                      aria-current={cleanFrame === frameIndex ? "true" : undefined}
                      data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
                      data-art-timeline-has-command={commands.length ? "true" : "false"}
                      data-art-timeline-marker-selected={
                        commands.some(({ command, index: commandIndex }) => isCommandMarkerSelected(selectedMarker, command, commandIndex)) ? "true" : "false"
                      }
                      data-art-timeline-drop-target={timelineDropFrame === frameIndex ? "true" : "false"}
                      draggable={commands.length > 0}
                      title={
                        commands.length
                          ? `Frame ${frameIndex}: ${commands.map(({ command }) => timelineCommandTitle(command)).join(", ")}`
                          : `Preview frame ${frameIndex}`
                      }
                      onClick={() => selectCommandFrame(commands, frameIndex)}
                      onDragStart={(event) => {
                        if (!dragCommand) return;
                        startTimelineDrag(event, { kind: "command", index: dragCommand.index, command: dragCommand.command });
                      }}
                      onDragOver={(event) => handleTimelineFrameDragOver(event, frameIndex)}
                      onDrop={(event) => handleTimelineFrameDrop(event, frameIndex)}
                      onDragEnd={endTimelineDrag}
                      onDragLeave={() => {
                        if (timelineDropFrame === frameIndex) setTimelineDropFrame(null);
                      }}
                    >
                      {commands.length ? (
                        <span className="art-timeline-marker-pill">{commands.map(({ command }) => timelineCommandLabel(command)).join(", ")}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {current.tracks.map((track) => {
            const trackLabel = timelineTargetLabel(track.targetId, component);
            return (
              <div className="art-timeline-lane" key={track.targetId}>
                <div className="art-timeline-lane-label" title={`${trackLabel.label} (${track.targetId})`}>
                  <span>{trackLabel.label}</span>
                  <small>{trackLabel.detail}</small>
                </div>
                <div className="art-timeline-lane-frames" style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}>
                  {visibleTimelineFrames.map((frameIndex) => {
                    const keyframe = track.keyframes.find((item) => item.frame === frameIndex);
                    const isSelected = selectedKeyframe?.targetId === track.targetId && selectedKeyframe.frame === frameIndex;
                    return (
                      <button
                        type="button"
                        key={frameIndex}
                        className="art-timeline-lane-frame"
                        aria-current={cleanFrame === frameIndex ? "true" : undefined}
                        data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
                        data-art-timeline-has-keyframe={keyframe ? "true" : "false"}
                        data-art-timeline-keyframe-selected={isSelected ? "true" : "false"}
                        data-art-timeline-drop-target={timelineDropFrame === frameIndex ? "true" : "false"}
                        draggable={Boolean(keyframe)}
                        title={keyframe ? `${track.targetId} keyframe ${frameIndex}` : `Preview frame ${frameIndex}`}
                        onClick={() => (keyframe ? selectKeyframe(track.targetId, keyframe.frame) : previewFrame(frameIndex))}
                        onDragStart={(event) => {
                          if (!keyframe) return;
                          startTimelineDrag(event, { kind: "keyframe", targetId: track.targetId, frame: keyframe.frame });
                        }}
                        onDragOver={(event) => handleTimelineFrameDragOver(event, frameIndex)}
                        onDrop={(event) => handleTimelineFrameDrop(event, frameIndex)}
                        onDragEnd={endTimelineDrag}
                        onDragLeave={() => {
                          if (timelineDropFrame === frameIndex) setTimelineDropFrame(null);
                        }}
                      >
                        {keyframe ? <span className="art-timeline-keyframe-dot" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {current.frameCount > visibleTimelineFrameCount ? (
            <small className="art-timeline-lane-note">
              Showing frames {cleanFrameWindowStart}-{visibleFrameEnd}; use the window controls for the rest of the timeline.
            </small>
          ) : null}
        </div>
      ) : null}
      <div className="art-timeline-actions">
        <label className="flow-react-field">
          <span>Keyframe Target</span>
          <select value={activeKeyframeTargetId} disabled={keyframeTargets.length === 0} onChange={(event) => setKeyframeTargetId(event.target.value)}>
            {keyframeTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flow-react-field">
          <span>Key Properties</span>
          <input
            type="text"
            list="art-timeline-property-suggestions"
            value={keyframePropertyNames}
            placeholder="scale opacity"
            onChange={(event) => setKeyframePropertyNames(event.target.value)}
          />
        </label>
        <label className="flow-react-field">
          <span>Label</span>
          <input type="text" value={labelName} placeholder="appear" onChange={(event) => setLabelName(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            const nextLabel = labelName.trim() || `Frame ${cleanFrame}`;
            onChange(addTimelineLabel(current, cleanFrame, nextLabel));
            setSelectedKeyframe(null);
            setSelectedMarker({ kind: "label", name: nextLabel });
            setLabelName("");
          }}
        >
          Add Label
        </button>
        <button
          type="button"
          disabled={!activeKeyframeTarget}
          onClick={() => {
            if (!activeKeyframeTarget) return;
            const nextTimeline = addTransformKeyframe(current, activeKeyframeTarget, cleanFrame);
            onChange(nextTimeline);
            setSelectedMarker(null);
            setSelectedKeyframe({ targetId: activeKeyframeTarget.id, frame: cleanFrame });
          }}
        >
          Add Keyframe
        </button>
        <button type="button" disabled={!activeKeyframeTarget || timelinePropertyKeyList(keyframePropertyNames).length === 0} onClick={addPropertyKeyframeAtCurrentFrame}>
          Add Property Keyframe
        </button>
        <button type="button" disabled={!activeKeyframeTarget || !copiedKeyframe} onClick={() => pasteCopiedKeyframe(cleanFrame)}>
          Paste Keyframe
        </button>
      </div>
      <div className="art-timeline-command-editor">
        <label className="flow-react-field">
          <span>Command</span>
          <select value={commandType} onChange={(event) => setNewCommandType(event.target.value)}>
            <option value="stop">Stop</option>
            <option value="gotoAndPlay">Go To And Play</option>
            <option value="gotoAndStop">Go To And Stop</option>
            <option value="playComponent">Play Component Timeline</option>
            <option value="stopComponent">Stop Component Timeline</option>
            <option value="emit">Emit Event</option>
          </select>
        </label>
        {timelineCommandUsesTarget(commandType) ? (
          <label className="flow-react-field">
            <span>{commandTargetLabel}</span>
            <input
              type="text"
              list={timelineCommandUsesComponentTarget(commandType) ? "art-timeline-target-components" : "art-timeline-labels"}
              value={commandTarget}
              placeholder={commandTargetPlaceholder}
              onChange={(event) => setNewCommandTarget(event.target.value)}
            />
          </label>
        ) : null}
        {timelineCommandUsesEvent(commandType) ? (
          <label className="flow-react-field">
            <span>{commandEventLabel}</span>
            <input
              type="text"
              list={commandType === "playComponent" || commandType === "stopComponent" ? "art-timeline-command-target-labels" : undefined}
              value={commandEvent}
              placeholder={commandEventPlaceholder}
              onChange={(event) => setCommandEvent(event.target.value)}
            />
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const nextTimeline = addTimelineCommand(current, cleanFrame, { type: commandType, target: commandTarget, event: commandEvent });
            const selectedCommandIndex = findLastTimelineCommandIndex(
              nextTimeline,
              (command) =>
                command.frame === cleanFrame &&
                command.type === commandType &&
                (command.target || "") === (timelineCommandUsesTarget(commandType) ? commandTarget.trim() : "") &&
                (command.event || "") === (timelineCommandUsesEvent(commandType) ? commandEvent.trim() : "")
            );
            onChange(nextTimeline);
            setSelectedKeyframe(null);
            if (selectedCommandIndex >= 0) setSelectedMarker(commandMarkerSelection(nextTimeline.commands[selectedCommandIndex], selectedCommandIndex));
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
        <datalist id="art-timeline-target-components">
          {keyframeTargets.map((target) => (
            <option value={target.id} key={target.id}>
              {target.label}
            </option>
          ))}
        </datalist>
        <datalist id="art-timeline-command-target-labels">
          {commandTargetAnimationLabels.map((label) => (
            <option value={label.name} key={label.name} />
          ))}
        </datalist>
        <datalist id="art-timeline-property-suggestions">
          {TIMELINE_PROPERTY_SUGGESTIONS.map((property) => (
            <option value={property} key={property} />
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
                  <button
                    type="button"
                    aria-current={selectedMarker?.kind === "label" && selectedMarker.name === label.name ? "true" : undefined}
                    onClick={() => selectTimelineMarker({ kind: "label", name: label.name }, label.frame)}
                  >
                    <span>{label.name}</span>
                  </button>
                  <small>Frame {label.frame}</small>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(removeTimelineLabel(current, label.name));
                      if (selectedMarker?.kind === "label" && selectedMarker.name === label.name) setSelectedMarker(null);
                    }}
                  >
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
              {current.commands.map((command, index) => {
                const order = timelineCommandFrameOrder(current, index);
                return (
                  <li key={command.id || `${command.type}-${command.frame}-${index}`}>
                    <button
                      type="button"
                      aria-current={isCommandMarkerSelected(selectedMarker, command, index) ? "true" : undefined}
                      onClick={() => selectTimelineMarker(commandMarkerSelection(command, index), command.frame)}
                    >
                      <span>{command.type}</span>
                    </button>
                    <small>
                      Frame {command.frame}
                      {order.total > 1 ? ` / Order ${order.position} of ${order.total}` : ""}
                      {command.target ? ` -> ${command.target}` : ""}
                      {command.event ? ` / ${command.event}` : ""}
                    </small>
                    <button type="button" disabled={!canMoveTimelineCommandInFrame(current, index, -1)} onClick={() => moveCommand(index, -1)}>
                      Earlier
                    </button>
                    <button type="button" disabled={!canMoveTimelineCommandInFrame(current, index, 1)} onClick={() => moveCommand(index, 1)}>
                      Later
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(removeTimelineCommandAt(current, index));
                        if (isCommandMarkerSelected(selectedMarker, command, index)) setSelectedMarker(null);
                      }}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>No commands.</p>
          )}
        </div>
      </div>
      {selectedTimelineMarker ? (
        <div className="art-timeline-marker-editor">
          <h4>{selectedTimelineMarker.kind === "label" ? "Selected Label" : "Selected Command"}</h4>
          {selectedTimelineMarker.kind === "label" ? (
            <>
              <label className="flow-react-field">
                <span>Name</span>
                <input type="text" value={selectedTimelineMarker.label.name} onChange={(event) => updateSelectedLabelName(event.target.value)} />
              </label>
              <label className="flow-react-field">
                <span>Frame</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, current.frameCount - 1)}
                  value={selectedTimelineMarker.label.frame}
                  onChange={(event) => updateSelectedMarkerFrame(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  onChange(removeTimelineLabel(current, selectedTimelineMarker.label.name));
                  setSelectedMarker(null);
                }}
              >
                Remove Label
              </button>
            </>
          ) : (
            <>
              {(() => {
                const order = timelineCommandFrameOrder(current, selectedTimelineMarker.index);
                return order.total > 1 ? (
                  <div className="art-timeline-command-order-actions">
                    <span>
                      Order {order.position} of {order.total} on frame {selectedTimelineMarker.command.frame}
                    </span>
                    <button
                      type="button"
                      disabled={!canMoveTimelineCommandInFrame(current, selectedTimelineMarker.index, -1)}
                      onClick={() => moveCommand(selectedTimelineMarker.index, -1)}
                    >
                      Earlier
                    </button>
                    <button
                      type="button"
                      disabled={!canMoveTimelineCommandInFrame(current, selectedTimelineMarker.index, 1)}
                      onClick={() => moveCommand(selectedTimelineMarker.index, 1)}
                    >
                      Later
                    </button>
                  </div>
                ) : null;
              })()}
              <label className="flow-react-field">
                <span>Command</span>
                <select value={selectedTimelineMarker.command.type} onChange={(event) => setSelectedCommandType(event.target.value)}>
                  <option value="stop">Stop</option>
                  <option value="gotoAndPlay">Go To And Play</option>
                  <option value="gotoAndStop">Go To And Stop</option>
                  <option value="playComponent">Play Component Timeline</option>
                  <option value="stopComponent">Stop Component Timeline</option>
                  <option value="emit">Emit Event</option>
                </select>
              </label>
              <label className="flow-react-field">
                <span>Frame</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, current.frameCount - 1)}
                  value={selectedTimelineMarker.command.frame}
                  onChange={(event) => updateSelectedMarkerFrame(Number(event.target.value))}
                />
              </label>
              {timelineCommandUsesTarget(selectedTimelineMarker.command.type) ? (
                <label className="flow-react-field">
                  <span>{timelineCommandTargetLabel(selectedTimelineMarker.command.type)}</span>
                  <input
                    type="text"
                    list={timelineCommandUsesComponentTarget(selectedTimelineMarker.command.type) ? "art-timeline-target-components" : "art-timeline-labels"}
                    value={selectedTimelineMarker.command.target || ""}
                    onChange={(event) => setSelectedCommandTarget(event.target.value)}
                  />
                </label>
              ) : null}
              {timelineCommandUsesEvent(selectedTimelineMarker.command.type) ? (
                <label className="flow-react-field">
                  <span>{timelineCommandEventLabel(selectedTimelineMarker.command.type)}</span>
                  <input
                    type="text"
                    list={selectedTimelineMarker.command.type === "playComponent" || selectedTimelineMarker.command.type === "stopComponent" ? "art-timeline-selected-command-target-labels" : undefined}
                    value={selectedTimelineMarker.command.event || ""}
                    onChange={(event) => updateSelectedCommand({ event: event.target.value })}
                  />
                </label>
              ) : null}
              <datalist id="art-timeline-selected-command-target-labels">
                {timelineTargetAnimationLabels(component, selectedTimelineMarker.command.target || "").map((label) => (
                  <option value={label.name} key={label.name} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => {
                  onChange(removeTimelineCommandAt(current, selectedTimelineMarker.index));
                  setSelectedMarker(null);
                }}
              >
                Remove Command
              </button>
            </>
          )}
        </div>
      ) : null}
      {current.tracks.length ? (
        <div className="art-timeline-keyframes">
          <h4>Keyframes</h4>
          <ol className="flow-react-list art-timeline-list">
            {current.tracks.flatMap((track) => {
              const targetLabel = timelineTargetLabel(track.targetId, component);
              return track.keyframes.map((keyframe) => (
                <li key={`${track.targetId}-${keyframe.frame}`}>
                  <button
                    type="button"
                    aria-current={selectedKeyframe?.targetId === track.targetId && selectedKeyframe.frame === keyframe.frame ? "true" : undefined}
                    onClick={() => selectKeyframe(track.targetId, keyframe.frame)}
                  >
                    <span>{targetLabel.label}</span>
                    <small>
                      Frame {keyframe.frame} / {targetLabel.detail}
                    </small>
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
              ));
            })}
          </ol>
        </div>
      ) : null}
      {selectedTimelineKeyframe ? (
        <div className="art-timeline-keyframe-editor">
          <h4>Selected Keyframe</h4>
          <label className="flow-react-field">
            <span>Target</span>
            <input type="text" value={timelineTargetLabel(selectedTimelineKeyframe.trackTargetId, component).label} readOnly />
          </label>
          <label className="flow-react-field">
            <span>Target Detail</span>
            <input type="text" value={timelineTargetLabel(selectedTimelineKeyframe.trackTargetId, component).detail} readOnly />
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
          <label className="flow-react-field">
            <span>Easing</span>
            <select
              value={selectedTimelineKeyframe.keyframe.easing || "linear"}
              onChange={(event) => updateSelectedKeyframe({ easing: event.target.value })}
            >
              {TIMELINE_EASING_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="art-timeline-keyframe-actions">
            <button type="button" disabled={!component} onClick={recaptureSelectedKeyframe}>
              Recapture Current State
            </button>
            <button
              type="button"
              disabled={!component || timelinePropertyKeyList(keyframePropertyNames).length === 0}
              onClick={recaptureSelectedKeyframeProperties}
            >
              Recapture Key Properties
            </button>
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
          </div>
        </div>
      ) : null}
    </section>
  );
}
