import {
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
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
  addTimelineLabel,
  addTransformKeyframe,
  copyTimelineFrameRange,
  copyTimelineKeyframe,
  effectiveArtVisibilityTimeline,
  insertTimelineFrames,
  overwriteTimelineFrameRange,
  removeTimelineCommandAt,
  removeTimelineKeyframe,
  removeTimelineLabel,
  removeTimelineFrames,
  replaceTimelineCommandsAtFrame,
  timelineFrameIsTweened,
  timelineFrameRangeFromAnchor,
  timelineTweenSpanAtFrame,
  toggleTimelineTweenAtFrame,
  type TimelineFrameClipboard,
  updateTimelineCommandAt,
  updateTimelineKeyframe,
  updateTimelineLabel,
  updateTimelineSettings,
  upsertTimelineKeyframeProps
} from "./artTimelineModel";
import { parseTimelineActionScript, timelineCommandsToActionScript } from "./artTimelineActionScript";
import {
  findTimelineTargetComponent,
  timelineTargetOptionsFor,
  timelineTrackRowsFor,
  timelineWithScopedComponentTracks
} from "./artTimelineTargets";
import { scopeTimelinePreviewOverridesToComponent } from "./artTimelinePreviewMapping";
import {
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
  type TimelineProperties
} from "../../../shared/timeline-model";
import { timelineSnapshotAt } from "../../runtime/timelinePlayer";
import { artComponentTargetPathId, findArtComponentTargetPath } from "../shared/artComponentTargets";

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
const TIMELINE_INSPECTOR_FIELDS = new Set(TIMELINE_PROPERTY_SUGGESTIONS);
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
type TimelineCellSelection =
  | { kind: "frame"; frame: number }
  | { kind: "label"; frame: number }
  | { kind: "command"; frame: number }
  | { kind: "keyframe"; frame: number; targetId: string };
type TimelineCommandOverlay = {
  frame: number;
  draft: string;
  error: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onReset: () => void;
};
type TimelineNavigationEntry = {
  compositionId: string;
  componentId?: string;
  frame?: number;
};
type TimelineDragItem =
  | { kind: "label"; name: string }
  | { kind: "command"; index: number; command: TimelineCommand }
  | { kind: "keyframe"; targetId: string; frame: number };
type MarqueeBox = { x: number; y: number; width: number; height: number };
type ArtSelectionBox = { id: string; minX: number; minY: number; maxX: number; maxY: number };

function get(component: ArtComponent, key: string): unknown {
  return (component as Record<string, unknown>)[key];
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizedMarqueeBox(start: { x: number; y: number }, end: { x: number; y: number }): MarqueeBox {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

function selectionBoxesIntersect(box: MarqueeBox, target: ArtSelectionBox): boolean {
  const boxMaxX = box.x + box.width;
  const boxMaxY = box.y + box.height;
  return box.x <= target.maxX && boxMaxX >= target.minX && box.y <= target.maxY && boxMaxY >= target.minY;
}

function cleanTimelineNavigationFrame(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
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

function isTimelineFrameShortcutTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(".art-timeline-ruler button, .art-timeline-lane-frame"));
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

function componentTimelineLocalTargetId(component: ArtComponent | null | undefined): string {
  return String(component?.id || "").trim() || "self";
}

function componentHasNestedTimelineTargets(component: ArtComponent, compositions: Map<string, ArtComposition>): boolean {
  if ((component.children || []).length > 0) return true;
  if (String(component.kind || "").toLowerCase() !== "reference") return false;
  const referenced = compositions.get(String(component.artCompositionId || ""));
  return Boolean(referenced?.components?.length);
}

function artCompositionReferenceResolver(compositions: ArtComposition[]) {
  const byId = new Map(compositions.map((item) => [String(item.id || ""), item]));
  return (component: ArtComponent) => byId.get(String(component.artCompositionId || "")) || null;
}

function timelineLabelsAtFrame(timeline: TimelineDocument, frame: number): TimelineLabel[] {
  return timeline.labels.filter((label) => label.frame === frame);
}

function timelineCommandsAtFrame(timeline: TimelineDocument, frame: number): { command: TimelineCommand; index: number }[] {
  return timeline.commands.map((command, index) => ({ command, index })).filter(({ command }) => command.frame === frame);
}

function inferredVisibilityCommandsAtFrame(timeline: TimelineDocument, frame: number): TimelineCommand[] {
  const visibleValues = new Set<boolean>();
  for (const track of timeline.tracks || []) {
    for (const keyframe of track.keyframes || []) {
      if (keyframe.frame !== frame) continue;
      const visible = keyframe.props?.visible;
      if (typeof visible === "boolean") visibleValues.add(visible);
    }
  }
  if (visibleValues.size !== 1) return [];
  const [visible] = [...visibleValues];
  return [{ frame, type: "setVisible", target: visible ? "true" : "false" }];
}

function timelineActionScriptForFrame(timeline: TimelineDocument, frame: number, commands: TimelineCommand[]): string {
  const hasExplicitVisibility = commands.some((command) => command.type === "setVisible");
  const displayCommands = hasExplicitVisibility ? commands : [...commands, ...inferredVisibilityCommandsAtFrame(timeline, frame)];
  return timelineCommandsToActionScript(displayCommands);
}

function timelineCommandLabel(command: TimelineCommand): string {
  if (command.type === "setVisible") return command.target === "false" ? "visible false" : "visible true";
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

function commandMarkerSelection(command: TimelineCommand, index: number): TimelineMarkerSelection {
  return { kind: "command", index, commandId: command.id };
}

function isCommandMarkerSelected(selection: TimelineMarkerSelection | null, command: TimelineCommand, index: number): boolean {
  if (selection?.kind !== "command") return false;
  if (selection.commandId && command.id) return selection.commandId === command.id;
  return selection.index === index;
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
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const [liveTransform, setLiveTransform] = useState<{ id: string; width?: number; height?: number; rotation?: number } | null>(null);
  const [previewMarquee, setPreviewMarquee] = useState<MarqueeBox | null>(null);
  const [layerDragId, setLayerDragId] = useState<string | null>(null);
  const [layerDropTarget, setLayerDropTarget] = useState<LayerDropTarget | null>(null);
  const [timelineScope, setTimelineScope] = useState<{ compositionId: string; componentId: string } | null>(null);
  const [timelineNavigationStack, setTimelineNavigationStack] = useState<TimelineNavigationEntry[]>([]);
  const [timelineDismissSignal, setTimelineDismissSignal] = useState(0);
  const [timelineCommandOverlay, setTimelineCommandOverlay] = useState<TimelineCommandOverlay | null>(null);
  const [timelinePreview, setTimelinePreview] = useState<{
    compositionId: string;
    frame: number;
    overrides: TimelinePreviewOverrides | null;
  } | null>(null);
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
  const activeTimelineScopeComponentId = timelineScope?.compositionId === selectedCompositionId ? timelineScope.componentId : null;
  const timelinePreviewFrame = timelinePreview?.compositionId === selectedCompositionId ? timelinePreview.frame : 0;
  const timelinePreviewOverrides = timelinePreview?.compositionId === selectedCompositionId ? timelinePreview.overrides : null;

  const selectedComponentId = selectedComponentIds.size === 1 ? [...selectedComponentIds][0] : "";
  const selectedComponentMatch = useMemo(
    () => (composition && selectedComponentId ? findArtComponentTargetPath(composition.components || [], selectedComponentId) : null),
    [composition, selectedComponentId]
  );
  const selectedComponent = selectedComponentMatch?.component;
  const selectedComponentPath = selectedComponentMatch?.path || null;
  const timelineScopeComponentMatch = useMemo(
    () => (composition && activeTimelineScopeComponentId ? findArtComponentTargetPath(composition.components || [], activeTimelineScopeComponentId) : null),
    [activeTimelineScopeComponentId, composition]
  );
  const timelineScopeComponent = timelineScopeComponentMatch?.component || null;
  const timelineScopeComponentPath = timelineScopeComponentMatch?.path || null;
  const timelineRootComponent = composition ? timelineScopeComponent || compositionTimelineTargetRoot(composition) : null;
  const activeTimeline = (timelineScopeComponent ? timelineScopeComponent.timeline || null : composition?.timeline || null) as TimelineDocument | null;
  const effectiveActiveTimeline = useMemo(
    () =>
      timelineWithScopedComponentTracks(effectiveArtVisibilityTimeline(activeTimeline, timelineScopeComponent || null), timelineRootComponent || undefined, {
        includeRoot: timelineScopeComponent ? true : false,
        useScopedIds: true,
        scopeRootPath: timelineScopeComponent ? true : false,
        resolveReference: artCompositionReferenceResolver(compositions)
      }),
    [activeTimeline, compositions, timelineRootComponent, timelineScopeComponent]
  );
  const baseTimelineFrameOverrides = useMemo(() => {
    if (effectiveActiveTimeline.tracks.length === 0) return null;
    const snapshotOverrides = timelineSnapshotAt(effectiveActiveTimeline, timelinePreviewFrame).targets;
    return scopeTimelinePreviewOverridesToComponent(snapshotOverrides, timelineScopeComponent || null, timelineScopeComponentPath);
  }, [effectiveActiveTimeline, timelineScopeComponent, timelineScopeComponentPath, timelinePreviewFrame]);
  const timelineFrameOverrides = useMemo(
    () => scopeTimelinePreviewOverridesToComponent(timelinePreviewOverrides || baseTimelineFrameOverrides, timelineScopeComponent || null, timelineScopeComponentPath),
    [baseTimelineFrameOverrides, timelineScopeComponent, timelineScopeComponentPath, timelinePreviewOverrides]
  );
  const selectedComponentScopedId = selectedComponentPath ? artComponentTargetPathId(selectedComponentPath) : selectedComponent?.id || "";
  const selectedTimelineEditTargetId = componentTimelineLocalTargetId(selectedComponent);
  const selectedComponentTimelineValues = selectedComponent
    ? timelineFrameOverrides?.[selectedComponentScopedId] || timelineFrameOverrides?.[selectedComponent.id] || {}
    : {};
  const commitSelectedTimelineFrameProps = (patch: TimelineProperties) => {
    if (!selectedComponent || !selectedTimelineEditTargetId || !composition) return;
    const nextTimeline = upsertTimelineKeyframeProps(
      selectedComponent.timeline || null,
      selectedTimelineEditTargetId,
      timelinePreviewFrame,
      patch,
      { defaultEasing: "hold", rootComponent: selectedComponent }
    );
    controller.updateComponent(selectedComponent.id, { timeline: nextTimeline } as Partial<ArtComponent>);
    setTimelinePreview((current) =>
      composition
        ? {
            compositionId: composition.id,
            frame: current?.compositionId === composition.id ? current.frame : timelinePreviewFrame,
            overrides: null
          }
        : current
    );
  };
  const componentPathForTimelineEdit = (componentId: string): string[] | null =>
    composition ? findArtComponentTargetPath(composition.components || [], componentId)?.path || null : null;
  const componentTimelineValuesForCanvasEdit = (component: ArtComponent): Record<string, unknown> => {
    const componentPath = componentPathForTimelineEdit(component.id);
    const scopedId = componentPath ? artComponentTargetPathId(componentPath) : component.id;
    return timelineFrameOverrides?.[scopedId] || timelineFrameOverrides?.[component.id] || {};
  };
  const timelineAwareComponentValue = (component: ArtComponent, key: string, fallback: number): number => {
    const frameValues = componentTimelineValuesForCanvasEdit(component);
    const value = Object.prototype.hasOwnProperty.call(frameValues, key) ? frameValues[key] : get(component, key);
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  };
  const commitCanvasComponentPatch = (component: ArtComponent, patch: TimelineProperties): void => {
    const shouldCommitToTimeline = Boolean(
      composition &&
        selectedComponentIds.has(component.id) &&
        selectedComponent?.id === component.id &&
        selectedTimelineEditTargetId
    );
    if (!shouldCommitToTimeline) {
      controller.updateComponent(component.id, patch as Partial<ArtComponent>);
      return;
    }
    commitSelectedTimelineFrameProps(patch);
  };
  const previewTimelineFrame = (frame: number, overrides?: TimelinePreviewOverrides | null) => {
    if (!composition) return;
    setTimelinePreview({ compositionId: composition.id, frame, overrides: overrides || null });
  };
  const openTimelineScope = (component: ArtComponent) => {
    if (!composition) return;
    if (String(component.kind || "").toLowerCase() === "reference" && component.artCompositionId) {
      const referenced = compositionById.get(String(component.artCompositionId));
      if (referenced) {
        dismissTimelineContext();
        setTimelineNavigationStack((stack) => [
          ...stack,
          { compositionId: composition.id, componentId: component.id, frame: timelinePreviewFrame }
        ]);
        setTimelineScope(null);
        controller.selectComposition(referenced.id);
        setTimelinePreview({ compositionId: referenced.id, frame: 0, overrides: null });
        return;
      }
    }
    if (!componentHasNestedTimelineTargets(component, compositionById)) return;
    setTimelineScope({ compositionId: composition.id, componentId: component.id });
    controller.selectComponent(component.id, false);
    setTimelinePreview((current) =>
      current?.compositionId === composition.id ? { ...current, overrides: null } : { compositionId: composition.id, frame: 0, overrides: null }
    );
  };
  const dismissTimelineContext = useCallback(() => {
    setTimelineDismissSignal((value) => value + 1);
    setTimelineCommandOverlay(null);
  }, []);
  const selectArtComponent = useCallback(
    (id: string, additive: boolean) => {
      dismissTimelineContext();
      controller.selectComponent(id, additive);
    },
    [controller, dismissTimelineContext]
  );
  const exitTimelineScopeOneLevel = () => {
    if (!composition) return;
    if (!timelineScopeComponentPath?.length) {
      const previous = timelineNavigationStack[timelineNavigationStack.length - 1] || null;
      if (!previous) return;
      dismissTimelineContext();
      setTimelineNavigationStack((stack) => stack.slice(0, -1));
      setTimelineScope(null);
      controller.selectComposition(previous.compositionId);
      if (previous.componentId) controller.selectComponent(previous.componentId, false);
      setTimelinePreview({ compositionId: previous.compositionId, frame: cleanTimelineNavigationFrame(previous.frame), overrides: null });
      return;
    }
    const parentPath = timelineScopeComponentPath.slice(0, -1);
    dismissTimelineContext();
    if (!parentPath.length) {
      setTimelineScope(null);
      controller.clearComponentSelection();
      setTimelinePreview({ compositionId: composition.id, frame: 0, overrides: null });
      return;
    }
    const parentId = parentPath[parentPath.length - 1];
    setTimelineScope({ compositionId: composition.id, componentId: parentId });
    controller.selectComponent(parentId, false);
    setTimelinePreview({ compositionId: composition.id, frame: 0, overrides: null });
  };
  const updateComposition = (patch: Partial<ArtComposition>) => {
    if (!composition) return;
    controller.updateComposition(composition.id, patch);
  };

  const artCanvasPointFromEvent = (event: PointerEvent | ReactPointerEvent<HTMLElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / previewScale,
      y: (event.clientY - rect.top) / previewScale
    };
  };

  const collectSelectableComponentBoxes = (
    components: ArtComponent[],
    parent: { left: number; top: number; scale: number } = { left: 0, top: 0, scale: 1 },
    boxes: ArtSelectionBox[] = []
  ): ArtSelectionBox[] => {
    for (const component of components || []) {
      const frameValues = componentTimelineValuesForCanvasEdit(component);
      const x = finiteNumber(frameValues.x ?? get(component, "x"), 0);
      const y = finiteNumber(frameValues.y ?? get(component, "y"), 0);
      const width = Math.max(1, finiteNumber(frameValues.width ?? get(component, "width"), 1));
      const height = Math.max(1, finiteNumber(frameValues.height ?? get(component, "height"), 1));
      const scale = finiteNumber(frameValues.scale ?? get(component, "scale"), 1);
      const visualScale = parent.scale * Math.max(1, Math.abs(scale));
      const left = parent.left + (x - width / 2) * parent.scale;
      const top = parent.top + (y - height / 2) * parent.scale;
      if (component.locked !== true) {
        boxes.push({
          id: component.id,
          minX: left,
          minY: top,
          maxX: left + width * visualScale,
          maxY: top + height * visualScale
        });
      }
      if (component.children?.length) {
        collectSelectableComponentBoxes(
          component.children,
          { left, top, scale: parent.scale * (Number.isFinite(scale) ? scale : 1) },
          boxes
        );
      }
    }
    return boxes;
  };

  const beginPreviewMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !composition) return;
    event.preventDefault();
    const start = artCanvasPointFromEvent(event);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let moved = false;
    let latest = normalizedMarqueeBox(start, start);
    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientX - startClientX) > 3 || Math.abs(e.clientY - startClientY) > 3) moved = true;
      latest = normalizedMarqueeBox(start, artCanvasPointFromEvent(e));
      setPreviewMarquee(latest);
    };
    const up = (e: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      latest = normalizedMarqueeBox(start, artCanvasPointFromEvent(e));
      setPreviewMarquee(null);
      if (!moved) {
        controller.clearComponentSelection();
        dismissTimelineContext();
        return;
      }
      const selectedIds = collectSelectableComponentBoxes(composition.components || [])
        .filter((box) => selectionBoxesIntersect(latest, box))
        .map((box) => box.id);
      dismissTimelineContext();
      controller.selectComponents(selectedIds, e.metaKey || e.ctrlKey || e.shiftKey);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
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

  const beginResize = (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const originW = timelineAwareComponentValue(component, "width", 1);
    const originH = timelineAwareComponentValue(component, "height", 1);
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
      commitCanvasComponentPatch(component, { width: next.width, height: next.height });
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
    let rotation = timelineAwareComponentValue(component, "rotation", 0);
    const move = (e: PointerEvent) => {
      rotation = Number(((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90).toFixed(1));
      setLiveTransform({ id: component.id, rotation });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLiveTransform(null);
      commitCanvasComponentPatch(component, { rotation });
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const beginDrag = (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    dragRef.current = {
      id: component.id,
      originX: timelineAwareComponentValue(component, "x", 0),
      originY: timelineAwareComponentValue(component, "y", 0),
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
        commitCanvasComponentPatch(component, { x: next.x, y: next.y });
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
                onPointerDown={beginPreviewMarquee}
                onDoubleClick={(event) => {
                  if ((event.target as HTMLElement | null)?.closest("[data-art-canvas-component]")) return;
                  event.preventDefault();
                  exitTimelineScopeOneLevel();
                }}
              >
                <div
                  ref={canvasRef}
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
                    onOpenTimelineScope={(component, event) => {
                      event.stopPropagation();
                      openTimelineScope(component);
                    }}
                    onSelect={selectArtComponent}
                    selectedIds={selectedComponentIds}
                  />
                  {previewMarquee ? (
                    <div
                      className="art-selection-marquee"
                      style={{
                        left: previewMarquee.x,
                        top: previewMarquee.y,
                        width: previewMarquee.width,
                        height: previewMarquee.height
                      }}
                    />
                  ) : null}
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
          timelineContext={
            selectedComponent && selectedTimelineEditTargetId
              ? {
                  frame: timelinePreviewFrame,
                  values: selectedComponentTimelineValues,
                  onCommit: commitSelectedTimelineFrameProps
                }
              : null
          }
          tree={
            composition ? (
              <ComponentTree
                components={composition.components || []}
                selectedIds={selectedComponentIds}
                onSelect={selectArtComponent}
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
        {timelineCommandOverlay ? <ArtTimelineCommandOverlay overlay={timelineCommandOverlay} /> : null}
      </div>
      <div className="art-timeline-dock" data-art-timeline-dock>
        {composition ? (
          <ArtTimelinePanel
            title={timelineScopeComponent ? `${timelineScopeComponent.name || timelineScopeComponent.kind} Timeline` : `${composition.name} Timeline`}
            timeline={activeTimeline}
            displayTimeline={effectiveActiveTimeline}
            component={timelineRootComponent || compositionTimelineTargetRoot(composition)}
            compositions={compositions}
            includeRootTarget={timelineScopeComponent ? true : false}
            scopeRootPath={timelineScopeComponent ? true : false}
            onChange={(timeline) => {
              if (timelineScopeComponent) controller.updateComponent(timelineScopeComponent.id, { timeline } as Partial<ArtComponent>);
              else controller.updateComposition(composition.id, { timeline });
            }}
            onExitScope={timelineScopeComponent ? () => setTimelineScope(null) : undefined}
            onPreviewFrame={previewTimelineFrame}
            dismissSelectionSignal={timelineDismissSignal}
            onCommandOverlayChange={setTimelineCommandOverlay}
          />
        ) : (
          <p>No timeline selected.</p>
        )}
      </div>
    </section>
  );
}

function ArtComponentInspector({
  controller,
  composition,
  compositions,
  component,
  timelineContext,
  tree
}: {
  controller: ArtCompositionsController;
  composition: ArtComposition | null;
  compositions: ArtComposition[];
  component: ArtComponent | null;
  timelineContext?: {
    frame: number;
    values: Record<string, unknown>;
    onCommit: (patch: TimelineProperties) => void;
  } | null;
  tree: ReactNode;
}) {
  void compositions;
  if (!component) {
    return (
      <section className="flow-react-panel flow-react-inspector art-component-inspector" data-art-react-component="component-inspector" data-empty="true">
        <div className="art-component-tree-panel">
          <h3>Layers</h3>
          {tree}
        </div>
        <h3>Composition</h3>
        <p>Select a component.</p>
      </section>
    );
  }
  const frameValue = (key: string): unknown =>
    timelineContext && TIMELINE_INSPECTOR_FIELDS.has(key) && Object.prototype.hasOwnProperty.call(timelineContext.values || {}, key)
      ? timelineContext.values[key]
      : get(component, key);
  const commitBase = (patch: Partial<ArtComponent>) => controller.updateComponent(component.id, patch);
  const commit = (patch: Partial<ArtComponent>) => {
    if (!timelineContext) {
      commitBase(patch);
      return;
    }
    const timelinePatch: TimelineProperties = {};
    const basePatch: Partial<ArtComponent> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (TIMELINE_INSPECTOR_FIELDS.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)) {
        timelinePatch[key] = value;
      } else {
        (basePatch as Record<string, unknown>)[key] = value;
      }
    }
    if (Object.keys(timelinePatch).length > 0) timelineContext.onCommit(timelinePatch);
    if (Object.keys(basePatch).length > 0) commitBase(basePatch);
  };
  const isTextual = component.kind === "text" || component.kind === "badge";
  const supportsShape = componentSupportsShapeStyle(component);
  const supportsImage = componentSupportsImageMask(component);
  const referenceOptions = compositions.filter((item) => item.id !== composition?.id);
  const commitNumberInput = (key: string, value: string) => {
    if (value.trim() === "") return;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return;
    commit({ [key]: numberValue } as Partial<ArtComponent>);
  };

  const numberField = (key: string, label: string, step?: string) => (
    <label className="flow-react-field" data-art-field={key} key={key}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        key={`${component.id}-${timelineContext?.frame ?? "base"}-${key}`}
        defaultValue={String(frameValue(key) ?? 0)}
        data-art-component-field={key}
        onChange={(event) => commitNumberInput(key, event.target.value)}
        onBlur={(event) => commitNumberInput(key, event.target.value)}
      />
    </label>
  );
  const textField = (key: string, label: string) => (
    <label className="flow-react-field" data-art-field={key} key={key}>
      <span>{label}</span>
      <input
        type="text"
        key={`${component.id}-${timelineContext?.frame ?? "base"}-${key}`}
        defaultValue={String(frameValue(key) ?? "")}
        data-art-component-field={key}
        onChange={(event) => commit({ [key]: event.target.value } as Partial<ArtComponent>)}
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
    commitBase({ imageDataUrl: dataUrl, imageName: file.name, imageMimeType: file.type, imageAssetId: "" } as Partial<ArtComponent>);
  };

  return (
    <section className="flow-react-panel flow-react-inspector art-component-inspector" data-art-react-component="component-inspector" data-art-component-id={component.id}>
      <div className="art-component-tree-panel">
        <h3>Layers</h3>
        {tree}
      </div>
      <h3>{component.name}</h3>
      <label className="flow-react-field" data-art-field="name">
        <span>Label</span>
        <input
          type="text"
          key={`${component.id}-name-${String(get(component, "name") ?? "")}`}
          defaultValue={String(get(component, "name") ?? "")}
          data-art-component-field="name"
          onBlur={(event) => commitBase({ name: event.target.value } as Partial<ArtComponent>)}
        />
      </label>
      {SCALAR_FIELDS.map((field) => numberField(field.key, field.label))}
      {numberField("scale", "Scale", "0.01")}
      {numberField("rotation", "Rotation", "0.1")}
      {numberField("opacity", "Opacity", "0.01")}
      {component.kind === "reference" ? (
        <label className="flow-react-field" data-art-field="artCompositionId">
          <span>Prefab</span>
          <select
            value={String(get(component, "artCompositionId") || "")}
            data-art-component-field="artCompositionId"
            onChange={(event) => commitBase({ artCompositionId: event.target.value } as Partial<ArtComponent>)}
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
              value={String(frameValue("shapeStyle") || "rounded")}
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
            onChange={(event) => commitBase({ childDistribution: event.target.value } as Partial<ArtComponent>)}
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
              value={normalizeGameTextFontFamily(frameValue("fontFamily"))}
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
              checked={frameValue("autoFitText") !== false}
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

function ArtTimelineCommandOverlay({ overlay }: { overlay: TimelineCommandOverlay }) {
  return (
    <aside className="art-timeline-command-overlay" data-art-timeline-command-overlay>
      <label className="flow-react-field">
        <span>Actions · Frame {overlay.frame}</span>
        <textarea
          value={overlay.draft}
          placeholder={'stop();\ngotoAndPlay("appear");'}
          spellCheck={false}
          onChange={(event) => overlay.onDraftChange(event.target.value)}
          onBlur={overlay.onCommit}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              overlay.onCommit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              overlay.onReset();
            }
          }}
        />
      </label>
      <small className="art-timeline-script-help">
        Use stop(), gotoAndPlay("label"), bubble.gotoAndPlay("label"), bubble.gotoAndStop("label"), emit("event"), or visible = false.
      </small>
      {overlay.error ? <strong className="art-timeline-script-error">{overlay.error}</strong> : null}
    </aside>
  );
}

function ArtTimelinePanel({
  title,
  timeline,
  displayTimeline,
  component,
  compositions = [],
  includeRootTarget = true,
  scopeRootPath = true,
  onChange,
  onExitScope,
  onPreviewFrame,
  dismissSelectionSignal,
  onCommandOverlayChange
}: {
  title: string;
  timeline: TimelineDocument | null | undefined;
  displayTimeline?: TimelineDocument | null | undefined;
  component?: ArtComponent;
  compositions?: ArtComposition[];
  includeRootTarget?: boolean;
  scopeRootPath?: boolean;
  onChange: (timeline: TimelineDocument) => void;
  onExitScope?: () => void;
  onPreviewFrame?: (frame: number, overrides?: TimelinePreviewOverrides | null) => void;
  dismissSelectionSignal?: number;
  onCommandOverlayChange?: (overlay: TimelineCommandOverlay | null) => void;
}) {
  const current = useMemo(
    () => effectiveArtVisibilityTimeline(displayTimeline ?? timeline, includeRootTarget ? component : null),
    [component, displayTimeline, includeRootTarget, timeline]
  );
  const [frame, setFrame] = useState(0);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [frameEditCount, setFrameEditCount] = useState(1);
  const [frameRangeAnchor, setFrameRangeAnchor] = useState<number | null>(null);
  const [frameRangeFocus, setFrameRangeFocus] = useState<number | null>(null);
  const [frameWindowStart, setFrameWindowStart] = useState(0);
  const [keyframeTargetId, setKeyframeTargetId] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ targetId: string; frame: number } | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<TimelineMarkerSelection | null>(null);
  const [selectedTimelineCell, setSelectedTimelineCell] = useState<TimelineCellSelection>({ kind: "frame", frame: 0 });
  const [timelineDragItem, setTimelineDragItem] = useState<TimelineDragItem | null>(null);
  const [timelineDropFrame, setTimelineDropFrame] = useState<number | null>(null);
  const [copiedKeyframe, setCopiedKeyframe] = useState<{ targetId: string; frame: number } | null>(null);
  const [copiedFrameRange, setCopiedFrameRange] = useState<TimelineFrameClipboard | null>(null);
  const [commandScriptDraft, setCommandScriptDraft] = useState("");
  const [commandScriptInitialDraft, setCommandScriptInitialDraft] = useState("");
  const [commandScriptError, setCommandScriptError] = useState("");
  const playbackRef = useRef<ArtTimelinePreviewPlayback | null>(null);
  const playbackFrameRef = useRef(0);
  const playbackControlsRef = useRef<{ toggle: () => void; playFromBeginning: () => void }>({
    toggle: () => {},
    playFromBeginning: () => {}
  });
  const timelineTweenControlsRef = useRef<{ toggle: () => void }>({ toggle: () => {} });
  const commitCommandScriptDraftRef = useRef<() => boolean>(() => true);
  const timelineRangeDragRef = useRef<{ anchorFrame: number; moved: boolean } | null>(null);
  const suppressTimelineClickRef = useRef(false);
  const shiftFrameRangeAnchorRef = useRef<number | null>(null);
  const dismissSelectionSignalRef = useRef(dismissSelectionSignal);
  const resolveReference = useMemo(() => artCompositionReferenceResolver(compositions), [compositions]);
  const cleanFrame = Math.max(0, Math.min(Math.max(0, current.frameCount - 1), Math.round(Number(frame) || 0)));
  const cleanTimelineFrame = (value: number): number => Math.max(0, Math.min(Math.max(0, current.frameCount - 1), Math.round(Number(value) || 0)));
  const cleanPlayheadFrame = cleanTimelineFrame(playheadFrame);
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
  const selectedTimelineCellFrame = cleanTimelineFrame(selectedTimelineCell.frame ?? cleanFrame);
  const selectedLabelFrame = selectedTimelineCell.kind === "label" ? selectedTimelineCellFrame : null;
  const selectedCommandFrame = selectedTimelineCell.kind === "command" ? cleanTimelineFrame(selectedTimelineCell.frame) : null;
  const selectedFrameLabels = useMemo(() => timelineLabelsAtFrame(current, selectedTimelineCellFrame), [current, selectedTimelineCellFrame]);
  const selectedLabelFrameLabels = useMemo(
    () => (selectedLabelFrame === null ? [] : timelineLabelsAtFrame(current, selectedLabelFrame)),
    [current, selectedLabelFrame]
  );
  const selectedCommandFrameCommands = useMemo(
    () => (selectedCommandFrame === null ? [] : timelineCommandsAtFrame(current, selectedCommandFrame)),
    [current, selectedCommandFrame]
  );
  const selectedTweenSpan = useMemo(() => {
    const targetId =
      selectedTimelineCell.kind === "keyframe"
        ? selectedTimelineCell.targetId
        : selectedTimelineKeyframe?.trackTargetId || "";
    if (!targetId) return null;
    const span = timelineTweenSpanAtFrame(current, targetId, selectedTimelineCellFrame);
    if (!span || span.easing === "hold" || selectedTimelineCellFrame >= span.endFrame) return null;
    return span;
  }, [current, selectedTimelineCell, selectedTimelineCellFrame, selectedTimelineKeyframe]);
  const selectedLabelFrameLabel =
    selectedMarker?.kind === "label" && selectedLabelFrame !== null
      ? selectedLabelFrameLabels.find((label) => label.name === selectedMarker.name) || selectedLabelFrameLabels[0] || null
      : selectedLabelFrameLabels[0] || null;
  const selectedFrameAnimationName =
    (selectedLabelFrame !== null ? selectedLabelFrameLabel?.name : selectedFrameLabels[0]?.name) || "";
  const animationNameIsEditable = selectedTimelineCell.kind === "label";
  const keyframeTargets = useMemo(
    () => timelineTargetOptionsFor(component, { includeRoot: includeRootTarget, useScopedIds: true, scopeRootPath, resolveReference }),
    [component, includeRootTarget, scopeRootPath, resolveReference]
  );
  const timelineTrackRows = useMemo(() => {
    return timelineTrackRowsFor(current, component, { includeRoot: includeRootTarget, useScopedIds: true, scopeRootPath, resolveReference });
  }, [component, current, includeRootTarget, resolveReference, scopeRootPath]);
  const activeKeyframeTargetId = keyframeTargets.some((target) => target.id === keyframeTargetId)
    ? keyframeTargetId
    : keyframeTargets[0]?.id || component?.id || "";
  const activeKeyframeTarget = component && activeKeyframeTargetId ? findTimelineTargetComponent([component], activeKeyframeTargetId, { scopeRootPath, resolveReference }) : undefined;
  function componentWithTimelineTargetId(target: ArtComponent, targetId: string): ArtComponent {
    return target.id === targetId ? target : { ...target, id: targetId };
  }

  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
      playbackRef.current = null;
      setIsPlaying(false);
      onCommandOverlayChange?.(null);
    };
  }, [component?.id, includeRootTarget, onCommandOverlayChange, scopeRootPath]);

  useEffect(() => {
    if (dismissSelectionSignalRef.current === dismissSelectionSignal) return;
    dismissSelectionSignalRef.current = dismissSelectionSignal;
    setSelectedMarker(null);
    setSelectedTimelineCell({ kind: "frame", frame: cleanFrame });
    setCommandScriptDraft("");
    setCommandScriptInitialDraft("");
    setCommandScriptError("");
    onCommandOverlayChange?.(null);
  }, [cleanFrame, dismissSelectionSignal, onCommandOverlayChange]);

  useEffect(() => {
    if (!isPlaying) {
      playbackFrameRef.current = cleanFrame;
    }
  }, [cleanFrame, isPlaying]);

  function windowStartForFrame(nextFrame: number, currentWindowStart = cleanFrameWindowStart): number {
    if (nextFrame < currentWindowStart) return Math.max(0, Math.min(maxFrameWindowStart, nextFrame));
    if (nextFrame > currentWindowStart + visibleTimelineFrameCount - 1) return Math.max(0, Math.min(maxFrameWindowStart, nextFrame - visibleTimelineFrameCount + 1));
    return currentWindowStart;
  }

  function setTimelineWindowStart(nextStart: number): void {
    setFrameWindowStart(Math.max(0, Math.min(maxFrameWindowStart, Math.round(Number(nextStart) || 0))));
  }

  function scrollTimelineWindowByWheel(event: ReactWheelEvent<HTMLElement>): void {
    if (maxFrameWindowStart <= 0) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 1) return;
    event.preventDefault();
    const step = Math.max(1, Math.round(Math.abs(delta) / 24));
    setTimelineWindowStart(cleanFrameWindowStart + Math.sign(delta) * step);
  }

  function previewFrame(nextFrame: number): void {
    const normalizedFrame = cleanTimelineFrame(nextFrame);
    shiftFrameRangeAnchorRef.current = null;
    playbackFrameRef.current = normalizedFrame;
    setFrame(normalizedFrame);
    setPlayheadFrame(normalizedFrame);
    setFrameEditCount(1);
    setFrameRangeAnchor(null);
    setFrameRangeFocus(null);
    setFrameWindowStart(windowStartForFrame(normalizedFrame));
    onPreviewFrame?.(normalizedFrame);
  }

  function selectTimelineCell(selection: TimelineCellSelection): void {
    setSelectedTimelineCell({ ...selection, frame: cleanTimelineFrame(selection.frame) } as TimelineCellSelection);
  }

  function timelineCellIsActive(kind: TimelineCellSelection["kind"], frameIndex: number, targetId?: string): boolean {
    if (selectedTimelineCell.kind !== kind || cleanTimelineFrame(selectedTimelineCell.frame) !== frameIndex) return false;
    if (kind !== "keyframe") return true;
    return selectedTimelineCell.kind === "keyframe" && selectedTimelineCell.targetId === targetId;
  }

  function timelineFrameIsPlayhead(frameIndex: number): boolean {
    return cleanPlayheadFrame === frameIndex;
  }

  function frameInSelectedRange(frameIndex: number): boolean {
    return frameIndex >= cleanFrame && frameIndex <= selectedFrameRangeEnd;
  }

  function selectFrameRangeTo(nextFrame: number): void {
    const normalizedFrame = cleanTimelineFrame(nextFrame);
    const anchorFrame = cleanTimelineFrame(frameRangeAnchor ?? cleanFrame);
    selectFrameRangeFrom(anchorFrame, normalizedFrame);
  }

  function selectFrameRangeFrom(anchorFrameInput: number, nextFrameInput: number): void {
    const normalizedFrame = cleanTimelineFrame(nextFrameInput);
    const anchorFrame = cleanTimelineFrame(anchorFrameInput);
    const range = timelineFrameRangeFromAnchor(current.frameCount, anchorFrame, normalizedFrame);
    setFrame(range.startFrame);
    setPlayheadFrame(range.startFrame);
    setFrameRangeAnchor(anchorFrame);
    setFrameRangeFocus(normalizedFrame);
    setFrameEditCount(range.frameCount);
    setFrameWindowStart(windowStartForFrame(normalizedFrame));
    onPreviewFrame?.(range.startFrame);
  }

  function selectFrameRangeByShiftClick(nextFrame: number): void {
    stopPlayback();
    setSelectedKeyframe(null);
    setSelectedMarker(null);
    const normalizedFrame = cleanTimelineFrame(nextFrame);
    const anchorFrame = shiftFrameRangeAnchorRef.current ?? frameRangeAnchor ?? cleanFrame;
    shiftFrameRangeAnchorRef.current = anchorFrame;
    selectTimelineCell({ kind: "frame", frame: Math.min(anchorFrame, normalizedFrame) });
    selectFrameRangeFrom(anchorFrame, normalizedFrame);
  }

  function consumeTimelineRangeDragClick(): boolean {
    if (!suppressTimelineClickRef.current) return false;
    suppressTimelineClickRef.current = false;
    return true;
  }

  function timelineFrameFromPointer(container: HTMLElement, event: PointerEvent): number {
    const rect = container.getBoundingClientRect();
    const relativeX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const frameOffset = Math.max(0, Math.min(visibleTimelineFrameCount - 1, Math.floor(relativeX * visibleTimelineFrameCount)));
    return cleanTimelineFrame(cleanFrameWindowStart + frameOffset);
  }

  function beginTimelineFrameRangeDrag(frameIndex: number, event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0) return;
    const container = event.currentTarget.parentElement;
    if (!container) return;
    timelineRangeDragRef.current = { anchorFrame: frameIndex, moved: false };
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const move = (e: PointerEvent) => {
      const drag = timelineRangeDragRef.current;
      if (!drag) return;
      const nextFrame = timelineFrameFromPointer(container, e);
      const hasMoved = Math.abs(e.clientX - startClientX) > 3 || Math.abs(e.clientY - startClientY) > 3 || nextFrame !== drag.anchorFrame;
      if (!hasMoved) return;
      drag.moved = true;
      suppressTimelineClickRef.current = true;
      stopPlayback();
      setSelectedKeyframe(null);
      setSelectedMarker(null);
      selectTimelineCell({ kind: "frame", frame: Math.min(drag.anchorFrame, nextFrame) });
      selectFrameRangeFrom(drag.anchorFrame, nextFrame);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const moved = timelineRangeDragRef.current?.moved === true;
      timelineRangeDragRef.current = null;
      if (moved) {
        shiftFrameRangeAnchorRef.current = null;
        suppressTimelineClickRef.current = true;
        window.setTimeout(() => {
          suppressTimelineClickRef.current = false;
        }, 0);
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function previewFrameWithOverrides(nextFrame: number, overrides: TimelinePreviewOverrides | null): void {
    const normalizedFrame = cleanTimelineFrame(nextFrame);
    playbackFrameRef.current = normalizedFrame;
    setFrame(normalizedFrame);
    setPlayheadFrame(normalizedFrame);
    setFrameWindowStart(windowStartForFrame(normalizedFrame));
    onPreviewFrame?.(normalizedFrame, overrides);
  }

  function stopPlayback(): void {
    const stoppedFrame = cleanTimelineFrame(playbackFrameRef.current);
    playbackRef.current?.stop();
    playbackRef.current = null;
    playbackFrameRef.current = stoppedFrame;
    setFrame(stoppedFrame);
    setPlayheadFrame(stoppedFrame);
    setFrameWindowStart(windowStartForFrame(stoppedFrame));
    onPreviewFrame?.(stoppedFrame, null);
    setIsPlaying(false);
  }

  function playTimelineFromFrame(startFrame = cleanFrame): void {
    const normalizedStartFrame = cleanTimelineFrame(startFrame);
    stopPlayback();
    playbackFrameRef.current = normalizedStartFrame;
    let completedSynchronously = false;
    const playback = playArtTimelinePreview({
      timeline: current,
      component,
      start: normalizedStartFrame,
      scopeRootPath,
      resolveReference,
      onPreview: (previewFrameValue, overrides) => previewFrameWithOverrides(previewFrameValue, overrides),
      onComplete: () => {
        completedSynchronously = true;
        playbackRef.current = null;
        setIsPlaying(false);
      }
    });
    if (completedSynchronously) {
      playback.stop();
      setIsPlaying(false);
      return;
    }
    playbackRef.current = playback;
    setIsPlaying(true);
  }

  function playTimeline(): void {
    playTimelineFromFrame(cleanFrame);
  }

  function playTimelineFromBeginning(): void {
    previewFrame(0);
    playTimelineFromFrame(0);
  }

  function toggleTimelinePlayback(): void {
    if (isPlaying) stopPlayback();
    else if (current.frameCount > 1) playTimeline();
  }

  function tweenTargetForSelection(): string {
    if (selectedTimelineCell.kind === "keyframe") return selectedTimelineCell.targetId;
    if (selectedTimelineKeyframe) return selectedTimelineKeyframe.trackTargetId;
    return activeKeyframeTargetId;
  }

  function toggleTweenAtCurrentSelection(): boolean {
    const targetId = tweenTargetForSelection();
    if (!targetId) return false;
    const selectionFrame = cleanTimelineFrame(selectedTimelineCell.frame ?? cleanFrame);
    const span = timelineTweenSpanAtFrame(current, targetId, selectionFrame);
    if (!span) return false;
    const nextTimeline = toggleTimelineTweenAtFrame(current, targetId, selectionFrame);
    if (nextTimeline === current) return false;
    stopPlayback();
    onChange(nextTimeline);
    setKeyframeTargetId(targetId);
    setSelectedMarker(null);
    setSelectedKeyframe({ targetId, frame: span.startFrame });
    selectTimelineCell({ kind: "keyframe", targetId, frame: selectionFrame });
    previewFrame(selectionFrame);
    return true;
  }

  function updateSelectedTweenEasing(easing: string): void {
    if (!selectedTweenSpan) return;
    const selectionFrame = selectedTimelineCellFrame;
    const nextTimeline = updateTimelineKeyframe(current, selectedTweenSpan.targetId, selectedTweenSpan.startFrame, { easing });
    if (nextTimeline === current) return;
    stopPlayback();
    onChange(nextTimeline);
    setKeyframeTargetId(selectedTweenSpan.targetId);
    setSelectedMarker(null);
    setSelectedKeyframe({ targetId: selectedTweenSpan.targetId, frame: selectedTweenSpan.startFrame });
    selectTimelineCell({ kind: "keyframe", targetId: selectedTweenSpan.targetId, frame: selectionFrame });
    previewFrame(selectionFrame);
  }

  useEffect(() => {
    playbackControlsRef.current = {
      toggle: toggleTimelinePlayback,
      playFromBeginning: playTimelineFromBeginning
    };
    timelineTweenControlsRef.current = {
      toggle: () => {
        toggleTweenAtCurrentSelection();
      }
    };
  });

  useEffect(() => {
    function handleGlobalTimelineKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTimelineShortcutTarget(event.target)) return;
      if (isButtonTimelineShortcutTarget(event.target) && !isTimelineFrameShortcutTarget(event.target)) return;
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        playbackControlsRef.current.toggle();
      } else if (event.key === "Enter") {
        event.preventDefault();
        playbackControlsRef.current.playFromBeginning();
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        timelineTweenControlsRef.current.toggle();
      }
    }
    window.addEventListener("keydown", handleGlobalTimelineKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalTimelineKeyDown);
  }, []);

  useEffect(() => {
    function handleGlobalTimelineKeyUp(event: KeyboardEvent): void {
      if (event.key === "Shift") shiftFrameRangeAnchorRef.current = null;
    }
    window.addEventListener("keyup", handleGlobalTimelineKeyUp);
    return () => window.removeEventListener("keyup", handleGlobalTimelineKeyUp);
  }, []);

  function updateCurrentFrameAnimationName(name: string): void {
    if (selectedLabelFrame === null) return;
    const nextName = String(name || "").trim();
    if (!nextName) {
      if (!selectedLabelFrameLabel) return;
      const nextTimeline = removeTimelineLabel(current, selectedLabelFrameLabel.name);
      onChange(nextTimeline);
      setSelectedMarker(null);
      previewFrame(selectedLabelFrame);
      selectTimelineCell({ kind: "label", frame: selectedLabelFrame });
      return;
    }
    const nextTimeline = selectedLabelFrameLabel
      ? updateTimelineLabel(current, selectedLabelFrameLabel.name, { name: nextName })
      : addTimelineLabel(current, selectedLabelFrame, nextName);
    onChange(nextTimeline);
    setSelectedKeyframe(null);
    setSelectedMarker({ kind: "label", name: nextName });
    previewFrame(selectedLabelFrame);
    selectTimelineCell({ kind: "label", frame: selectedLabelFrame });
  }

  function commitCommandScriptDraft(): boolean {
    if (selectedCommandFrame === null) return true;
    if (commandScriptDraft === commandScriptInitialDraft) {
      setCommandScriptError("");
      return true;
    }
    const result = parseTimelineActionScript(commandScriptDraft);
    if (result.error) {
      setCommandScriptError(result.error);
      return false;
    }
    const nextTimeline = replaceTimelineCommandsAtFrame(current, selectedCommandFrame, result.commands);
    onChange(nextTimeline);
    setSelectedKeyframe(null);
    const commands = timelineCommandsAtFrame(nextTimeline, selectedCommandFrame);
    setSelectedMarker(commands[0] ? commandMarkerSelection(commands[0].command, commands[0].index) : null);
    const nextDraft = timelineActionScriptForFrame(nextTimeline, selectedCommandFrame, commands.map(({ command }) => command));
    setCommandScriptDraft(nextDraft);
    setCommandScriptInitialDraft(nextDraft);
    setCommandScriptError("");
    previewFrame(selectedCommandFrame);
    selectTimelineCell({ kind: "command", frame: selectedCommandFrame });
    return true;
  }

  useEffect(() => {
    commitCommandScriptDraftRef.current = commitCommandScriptDraft;
  });

  useEffect(() => {
    if (!onCommandOverlayChange) return;
    if (selectedCommandFrame === null) {
      onCommandOverlayChange(null);
      return;
    }
    onCommandOverlayChange({
      frame: selectedCommandFrame,
      draft: commandScriptDraft,
      error: commandScriptError,
      onDraftChange: (value: string) => {
        setCommandScriptDraft(value);
        setCommandScriptError("");
      },
      onCommit: () => {
        commitCommandScriptDraftRef.current();
      },
      onReset: () => {
        const nextDraft = timelineActionScriptForFrame(
          current,
          selectedCommandFrame,
          selectedCommandFrameCommands.map(({ command }) => command)
        );
        setCommandScriptDraft(nextDraft);
        setCommandScriptInitialDraft(nextDraft);
        setCommandScriptError("");
      }
    });
  }, [commandScriptDraft, commandScriptError, current, onCommandOverlayChange, selectedCommandFrame, selectedCommandFrameCommands]);

  function applyTimelineFrameEdit(nextTimeline: TimelineDocument, nextFrame = cleanFrame): void {
    stopPlayback();
    onChange(nextTimeline);
    previewFrame(Math.max(0, Math.min(Math.max(0, nextTimeline.frameCount - 1), nextFrame)));
  }

  function copyFrameRangeAtCurrentFrame(): void {
    setCopiedKeyframe(null);
    setCopiedFrameRange(copyTimelineFrameRange(current, selectedTimelineCellFrame, selectedFrameRangeCount));
  }

  function overwriteFrameRangeAtCurrentFrame(): void {
    if (!copiedFrameRange) return;
    setSelectedKeyframe(null);
    setSelectedMarker(null);
    applyTimelineFrameEdit(overwriteTimelineFrameRange(current, copiedFrameRange, selectedTimelineCellFrame), selectedTimelineCellFrame);
  }

  function insertFramesAtCurrentSelection(): void {
    applyTimelineFrameEdit(insertTimelineFrames(current, cleanFrame, selectedFrameRangeCount), cleanFrame);
  }

  function removeFramesAtCurrentSelection(): void {
    if (current.frameCount <= 1) return;
    setSelectedKeyframe(null);
    setSelectedMarker(null);
    applyTimelineFrameEdit(removeTimelineFrames(current, cleanFrame, selectedFrameRangeCount), cleanFrame);
  }

  function keyframeTargetForSelection(): { targetId: string; target?: ArtComponent } {
    const targetId =
      selectedTimelineCell.kind === "keyframe"
        ? selectedTimelineCell.targetId
        : selectedTimelineKeyframe?.trackTargetId || activeKeyframeTargetId;
    const target =
      component && targetId
        ? findTimelineTargetComponent([component], targetId, { scopeRootPath, resolveReference })
        : undefined;
    return { targetId, target };
  }

  function convertSelectionToKeyframe(): void {
    const { targetId, target } = keyframeTargetForSelection();
    if (!target || !targetId) return;
    const normalizedFrame = selectedTimelineCellFrame;
    const nextTimeline = addTransformKeyframe(current, componentWithTimelineTargetId(target, targetId), normalizedFrame);
    onChange(nextTimeline);
    setKeyframeTargetId(targetId);
    setSelectedMarker(null);
    setSelectedKeyframe({ targetId, frame: normalizedFrame });
    selectTimelineCell({ kind: "keyframe", targetId, frame: normalizedFrame });
    previewFrame(normalizedFrame);
  }

  function clearKeyframeAtCurrentSelection(): void {
    const { targetId } = keyframeTargetForSelection();
    if (!targetId) return;
    const normalizedFrame = selectedTimelineCellFrame;
    const nextTimeline = removeTimelineKeyframe(current, targetId, normalizedFrame);
    onChange(nextTimeline);
    setSelectedKeyframe(null);
    setSelectedMarker(null);
    selectTimelineCell({ kind: "keyframe", targetId, frame: normalizedFrame });
    previewFrame(normalizedFrame);
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
    if (event.altKey && event.metaKey && key === "c") {
      event.preventDefault();
      copyFrameRangeAtCurrentFrame();
      return;
    }
    if (event.altKey && event.metaKey && key === "v") {
      event.preventDefault();
      overwriteFrameRangeAtCurrentFrame();
      return;
    }
    if (!usesModifier && !event.altKey && event.key === "F5") {
      event.preventDefault();
      if (event.shiftKey) removeFramesAtCurrentSelection();
      else insertFramesAtCurrentSelection();
      return;
    }
    if (!usesModifier && !event.altKey && event.key === "F6") {
      event.preventDefault();
      if (event.shiftKey) clearKeyframeAtCurrentSelection();
      else convertSelectionToKeyframe();
      return;
    }
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
      if (current.frameCount > 1) {
        copyFrameRangeAtCurrentFrame();
        removeFramesAtCurrentSelection();
      }
      return;
    }
    if (usesModifier && key === "v") {
      event.preventDefault();
      if (copiedFrameRange) overwriteFrameRangeAtCurrentFrame();
      else if (copiedKeyframe) pasteCopiedKeyframe(cleanFrame);
      return;
    }
    if (!usesModifier && !event.altKey && key === "t") {
      event.preventDefault();
      toggleTweenAtCurrentSelection();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (removeSelectedTimelineItem()) return;
      removeFramesAtCurrentSelection();
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      if (isButtonTimelineShortcutTarget(event.target) && !isTimelineFrameShortcutTarget(event.target)) return;
      event.preventDefault();
      toggleTimelinePlayback();
      return;
    }
    if (event.key === "Enter") {
      if (isButtonTimelineShortcutTarget(event.target) && !isTimelineFrameShortcutTarget(event.target)) return;
      event.preventDefault();
      if (current.frameCount > 1) playTimelineFromBeginning();
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
    setKeyframeTargetId(targetId);
    setSelectedKeyframe({ targetId, frame: keyframeFrame });
    selectTimelineCell({ kind: "keyframe", targetId, frame: keyframeFrame });
    previewFrame(keyframeFrame);
  }

  function selectTimelineMarker(selection: TimelineMarkerSelection, markerFrame: number): void {
    stopPlayback();
    setSelectedKeyframe(null);
    setSelectedMarker(selection);
    selectTimelineCell({ kind: selection.kind, frame: markerFrame });
    previewFrame(markerFrame);
  }

  function selectCommandFrame(commands: { command: TimelineCommand; index: number }[], commandFrame: number): void {
    selectTimelineCell({ kind: "command", frame: commandFrame });
    const nextDraft = timelineActionScriptForFrame(current, commandFrame, commands.map(({ command }) => command));
    setCommandScriptDraft(nextDraft);
    setCommandScriptInitialDraft(nextDraft);
    setCommandScriptError("");
    if (!commands.length) {
      stopPlayback();
      setSelectedKeyframe(null);
      setSelectedMarker(null);
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
    const nextTimeline = copyTimelineKeyframe(current, copiedKeyframe.targetId, copiedKeyframe.frame, activeKeyframeTargetId, normalizedFrame);
    onChange(nextTimeline);
    setSelectedKeyframe({ targetId: activeKeyframeTargetId, frame: normalizedFrame });
    previewFrame(normalizedFrame);
  }

  return (
    <section
      className="art-timeline-panel"
      data-art-timeline-panel
      tabIndex={0}
      aria-keyshortcuts="T F5 F6 Shift+F5 Shift+F6 ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End Space Enter Meta+Alt+C Meta+Alt+V Meta+C Meta+X Meta+V Control+C Control+X Control+V Delete Backspace"
      onKeyDown={handleTimelineKeyDown}
    >
      <div className="art-timeline-header">
        <h3>{title}</h3>
        {onExitScope ? (
          <button type="button" onClick={onExitScope}>
            Back To Parent Timeline
          </button>
        ) : null}
      </div>
      <div className="art-timeline-settings">
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
      <div className="art-timeline-segment-editor">
        <label className="flow-react-field">
          <span>Animation Name</span>
          <input
            type="text"
            value={selectedFrameAnimationName}
            placeholder="None"
            readOnly={!animationNameIsEditable}
            aria-readonly={!animationNameIsEditable}
            onChange={(event) => {
              if (animationNameIsEditable) updateCurrentFrameAnimationName(event.target.value);
            }}
          />
        </label>
      </div>
      <div className="art-timeline-frame-editor">
        <div className="art-timeline-tween-slot" data-art-tween-selected={selectedTweenSpan ? "true" : "false"}>
          {selectedTweenSpan ? (
            <>
              <label className="flow-react-field">
                <span>Tween Easing</span>
                <select value={selectedTweenSpan.easing} onChange={(event) => updateSelectedTweenEasing(event.target.value)}>
                  {TIMELINE_EASING_OPTIONS.filter((option) => option.value !== "hold").map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                {selectedTweenSpan.startFrame}-{selectedTweenSpan.endFrame} · {selectedTweenSpan.targetId}
              </small>
            </>
          ) : (
            <span aria-hidden="true">Tween easing</span>
          )}
        </div>
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
      <div
        className="art-timeline-ruler"
        style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}
        onWheel={scrollTimelineWindowByWheel}
      >
        {visibleTimelineFrames.map((frameIndex) => (
          <button
            type="button"
            key={frameIndex}
            aria-current={cleanFrame === frameIndex ? "true" : undefined}
            data-art-timeline-playhead={timelineFrameIsPlayhead(frameIndex) ? "true" : "false"}
            data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
            onPointerDown={(event) => beginTimelineFrameRangeDrag(frameIndex, event)}
            onClick={(event) => {
              if (consumeTimelineRangeDragClick()) return;
              stopPlayback();
              if (event.shiftKey) selectFrameRangeByShiftClick(frameIndex);
              else {
                previewFrame(frameIndex);
                selectTimelineCell({ kind: "frame", frame: frameIndex });
              }
            }}
            title={`Frame ${frameIndex}${frameInSelectedRange(frameIndex) ? " / selected range" : ""}`}
          >
            {frameIndex % 5 === 0 ? frameIndex : ""}
          </button>
        ))}
      </div>
      <div className="art-timeline-lanes" data-art-timeline-lanes onWheel={scrollTimelineWindowByWheel}>
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
                      data-art-timeline-playhead={timelineFrameIsPlayhead(frameIndex) ? "true" : "false"}
                      data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
                      data-art-timeline-has-label={labels.length ? "true" : "false"}
                      data-art-timeline-marker-selected={
                        labels.some((label) => selectedMarker?.kind === "label" && selectedMarker.name === label.name) ? "true" : "false"
                      }
                      data-art-timeline-active-cell={timelineCellIsActive("label", frameIndex) ? "true" : "false"}
                      data-art-timeline-drop-target={timelineDropFrame === frameIndex ? "true" : "false"}
                      draggable={labels.length > 0}
                      title={labels.length ? `Frame ${frameIndex}: ${labels.map((label) => label.name).join(", ")}` : `Preview frame ${frameIndex}`}
                      onPointerDown={(event) => beginTimelineFrameRangeDrag(frameIndex, event)}
                      onClick={(event) => {
                        if (consumeTimelineRangeDragClick()) return;
                        if (event.shiftKey) {
                          selectFrameRangeByShiftClick(frameIndex);
                          return;
                        }
                        if (labels[0]) selectTimelineMarker({ kind: "label", name: labels[0].name }, frameIndex);
                        else {
                          stopPlayback();
                          setSelectedKeyframe(null);
                          setSelectedMarker(null);
                          previewFrame(frameIndex);
                          selectTimelineCell({ kind: "label", frame: frameIndex });
                        }
                      }}
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
                      data-art-timeline-playhead={timelineFrameIsPlayhead(frameIndex) ? "true" : "false"}
                      data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
                      data-art-timeline-has-command={commands.length ? "true" : "false"}
                      data-art-timeline-marker-selected={
                        commands.some(({ command, index: commandIndex }) => isCommandMarkerSelected(selectedMarker, command, commandIndex)) ? "true" : "false"
                      }
                      data-art-timeline-active-cell={timelineCellIsActive("command", frameIndex) ? "true" : "false"}
                      data-art-timeline-drop-target={timelineDropFrame === frameIndex ? "true" : "false"}
                      draggable={commands.length > 0}
                      title={
                        commands.length
                          ? `Frame ${frameIndex}: ${commands.map(({ command }) => timelineCommandTitle(command)).join(", ")}`
                          : `Preview frame ${frameIndex}`
                      }
                      onPointerDown={(event) => beginTimelineFrameRangeDrag(frameIndex, event)}
                      onClick={(event) => {
                        if (consumeTimelineRangeDragClick()) return;
                        if (event.shiftKey) {
                          selectFrameRangeByShiftClick(frameIndex);
                          return;
                        }
                        selectCommandFrame(commands, frameIndex);
                      }}
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
          {timelineTrackRows.map(({ target: trackLabel, track }) => {
            return (
              <div className="art-timeline-lane" key={trackLabel.id}>
                <div className="art-timeline-lane-label" title={`${trackLabel.label} (${trackLabel.id})`}>
                  <span>{trackLabel.label}</span>
                  <small>{trackLabel.detail}</small>
                </div>
                <div className="art-timeline-lane-frames" style={{ gridTemplateColumns: `repeat(${visibleTimelineFrameCount}, minmax(10px, 1fr))` }}>
                  {visibleTimelineFrames.map((frameIndex) => {
                    const keyframe = track?.keyframes.find((item) => item.frame === frameIndex) || null;
                    const isSelected = selectedKeyframe?.targetId === trackLabel.id && selectedKeyframe.frame === frameIndex;
                    const isTweened = timelineFrameIsTweened(current, trackLabel.id, frameIndex);
                    return (
                      <button
                        type="button"
                        key={frameIndex}
                        className="art-timeline-lane-frame"
                        aria-current={cleanFrame === frameIndex ? "true" : undefined}
                        data-art-timeline-playhead={timelineFrameIsPlayhead(frameIndex) ? "true" : "false"}
                        data-art-timeline-range-selected={frameInSelectedRange(frameIndex) ? "true" : "false"}
                        data-art-timeline-has-keyframe={keyframe ? "true" : "false"}
                        data-art-timeline-tweened={isTweened ? "true" : "false"}
                        data-art-timeline-keyframe-selected={isSelected ? "true" : "false"}
                        data-art-timeline-active-cell={timelineCellIsActive("keyframe", frameIndex, trackLabel.id) ? "true" : "false"}
                        data-art-timeline-drop-target={timelineDropFrame === frameIndex ? "true" : "false"}
                        draggable={Boolean(keyframe)}
                        title={keyframe ? `${trackLabel.label} keyframe ${frameIndex}` : `Frame ${frameIndex}: add/select ${trackLabel.label} keyframe target`}
                        onPointerDown={(event) => beginTimelineFrameRangeDrag(frameIndex, event)}
                        onClick={(event) => {
                          if (consumeTimelineRangeDragClick()) return;
                          if (event.shiftKey) {
                            selectFrameRangeByShiftClick(frameIndex);
                            return;
                          }
                          setKeyframeTargetId(trackLabel.id);
                          if (keyframe) selectKeyframe(trackLabel.id, keyframe.frame);
                          else {
                            stopPlayback();
                            setSelectedMarker(null);
                            setSelectedKeyframe(null);
                            previewFrame(frameIndex);
                            selectTimelineCell({ kind: "keyframe", targetId: trackLabel.id, frame: frameIndex });
                          }
                        }}
                        onDragStart={(event) => {
                          if (!keyframe) return;
                          startTimelineDrag(event, { kind: "keyframe", targetId: trackLabel.id, frame: keyframe.frame });
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
    </section>
  );
}
