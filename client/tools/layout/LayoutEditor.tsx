import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { ArtAsset, ArtComposition, LayoutElement } from "../../types/game-data";
import { gameTextHtml } from "../../runtime/gameTextMarkup";
import {
  choiceCollectionItemDimensions,
  choiceCollectionLayoutStyle
} from "../../runtime/controllerChoiceCollectionLayout";
import { gameTextFontOptions, normalizeGameTextFontFamily } from "../../textFonts";
import {
  ArtPreviewRenderer,
  assetUrlMap,
  compositionMap,
  type ArtTextOverride
} from "../art/ArtPreviewRenderer";
import { applyDragModifiers, createDragModifierState } from "../common/dragModifiers";
import { ToolSaveError } from "../common/ToolSaveError";
import { ToolWorkspace } from "../common/ToolWorkspace";
import type { LayoutController } from "./layoutController";
import { ControllerConfigurationPicker, LayoutElementTagEditor } from "./LayoutTagControls";
import {
  controllerInitialAnimationState,
  layoutGameObjectCompositions,
  layoutGroups,
  normalizeLayoutAuthoringId
} from "./layoutModel";
import {
  canonicalLayoutTag,
  layoutElementHasTag,
  layoutElementTags,
  layoutViewTags
} from "./layoutTags";
import { useLayoutEditor } from "./useLayoutEditor";

export interface LayoutEditorProps {
  artAssets?: ArtAsset[];
  artCompositions?: ArtComposition[];
  onOpenArtComposition?: (compositionId: string) => void;
  stageController: LayoutController;
  controllerController: LayoutController;
  initialMode?: "stage" | "controller";
  surface?: string;
  gamePluginInputs?: GamePluginInputManifest[];
  gamePluginRenderers?: GamePluginRendererManifest[];
}

interface GamePluginChoiceCollectionBinding {
  kind: "choiceCollection";
  layoutElementId: string;
  item: { artCompositionId: string; targetComponentId: string };
}

interface GamePluginInputManifest {
  controller?: {
    bindings?: GamePluginChoiceCollectionBinding[];
    submitted?: { bindings?: GamePluginChoiceCollectionBinding[] };
  };
}

interface GamePluginRendererManifest {
  surface?: "stage" | "controller";
  target?: { layoutElementId?: string };
  bindings?: Array<{
    kind?: string;
    item?: { artCompositionId?: string };
  }>;
}

function choiceCollectionBindingForElement(
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

function rendererCollectionCompositionForElement(
  renderers: GamePluginRendererManifest[],
  surface: "stage" | "controller",
  elementId: string
): string {
  const renderer = renderers.find((candidate) => candidate.surface === surface && candidate.target?.layoutElementId === elementId);
  return String(renderer?.bindings?.find((binding) => binding.kind === "collection")?.item?.artCompositionId || "");
}

function get(element: LayoutElement, key: string): unknown {
  return (element as Record<string, unknown>)[key];
}

const SCALAR_FIELDS = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
  { key: "scale", label: "Scale" },
  { key: "rotation", label: "Rotation" }
];
type LayerDropPlacement = "before" | "after";

type LayerDropTarget = {
  id: string;
  placement: LayerDropPlacement;
};

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const measure = () => {
      setSize({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        measure();
        return;
      }
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function layerDropPlacement(event: ReactDragEvent<HTMLElement>): LayerDropPlacement {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function layoutElementArtCompositionId(element: LayoutElement): string {
  return String(get(element, "artCompositionId") || "");
}

function layoutTextOverride(element: LayoutElement): ArtTextOverride {
  return {
    autoFitText: get(element, "autoFitText") === true,
    fontColor: String(get(element, "fontColor") || "#ffffff"),
    fontFamily: normalizeGameTextFontFamily(get(element, "fontFamily")),
    fontSize: Number(get(element, "fontSize") || 58),
    text: String(get(element, "defaultText") || "")
  };
}

function artCompositionDefaultDimensions(
  composition: ArtComposition | null | undefined
): { width: number; height: number } | null {
  const width = Number(composition?.canvas?.width || 0);
  const height = Number(composition?.canvas?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

export function LayoutEditor({
  artAssets = [],
  artCompositions = [],
  onOpenArtComposition,
  stageController,
  controllerController,
  initialMode = "stage",
  surface = "layout",
  gamePluginInputs = [],
  gamePluginRenderers = []
}: LayoutEditorProps) {
  const [mode, setMode] = useState<"stage" | "controller">(initialMode);
  const [controllerPreviewTagsByGroup, setControllerPreviewTagsByGroup] = useState<
    Record<string, string>
  >({});
  const [gameObjectPickerOpen, setGameObjectPickerOpen] = useState(false);
  const [gameObjectSearch, setGameObjectSearch] = useState("");
  const [groupCreatorOpen, setGroupCreatorOpen] = useState(false);
  const [groupCreatorKind, setGroupCreatorKind] = useState<"state" | "layer">("state");
  const [newGroupName, setNewGroupName] = useState("New Controller Layout");
  const [newGroupId, setNewGroupId] = useState("new-controller-layout");
  const [groupIdEdited, setGroupIdEdited] = useState(false);
  const controller = mode === "stage" ? stageController : controllerController;
  const state = useLayoutEditor(controller);
  const { layouts, selectedGroupId, selectedElementIds, dirty, saving, canUndo, canRedo } = state;
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const [elementDragId, setElementDragId] = useState<string | null>(null);
  const [elementDropTarget, setElementDropTarget] = useState<LayerDropTarget | null>(null);
  const [previewPanelRef, previewPanelSize] = useElementSize<HTMLElement>();
  const assetUrlById = useMemo(() => assetUrlMap(artAssets), [artAssets]);
  const compositionById = useMemo(() => compositionMap(artCompositions), [artCompositions]);
  const availableGameObjects = useMemo(
    () => layoutGameObjectCompositions(artCompositions, mode),
    [artCompositions, mode]
  );
  const visibleGameObjects = useMemo(() => {
    const query = gameObjectSearch.trim().toLowerCase();
    if (!query) return availableGameObjects;
    return availableGameObjects.filter((composition) =>
      `${composition.name || ""} ${composition.id}`.toLowerCase().includes(query)
    );
  }, [availableGameObjects, gameObjectSearch]);

  const groups = layoutGroups(layouts);
  const group = groups.find((item) => item.id === selectedGroupId) || layouts.global || null;
  const selectedPersistentLayer = (layouts.layers || []).find((item) => item.id === selectedGroupId) || null;
  const selectedControllerState = (layouts.states || []).find((item) => item.id === selectedGroupId) || null;
  const canvasWidth = Number(layouts.canvas?.width || (mode === "controller" ? 390 : 1920));
  const canvasHeight = Number(layouts.canvas?.height || (mode === "controller" ? 844 : 1080));
  const fallbackPreviewWidth = mode === "controller" ? 420 : 960;
  const fallbackPreviewHeight = mode === "controller" ? 680 : 540;
  const availablePreviewWidth = Math.max(1, (previewPanelSize.width || fallbackPreviewWidth) - 32);
  const availablePreviewHeight = Math.max(
    1,
    (previewPanelSize.height || fallbackPreviewHeight) - 32
  );
  const maxPreviewScale = mode === "controller" ? 1.2 : 1;
  const scaleToFit = Math.max(
    0.05,
    Math.min(
      maxPreviewScale,
      availablePreviewWidth / canvasWidth,
      availablePreviewHeight / canvasHeight
    )
  );
  const groupElements = group?.elements || [];
  const controllerViewTags = mode === "controller" ? layoutViewTags(groupElements) : [];
  const controllerPreviewTag =
    mode === "controller" && group
      ? canonicalLayoutTag(controllerViewTags, controllerPreviewTagsByGroup[group.id])
      : "";
  const previewElements =
    mode === "controller" && controllerPreviewTag
      ? groupElements.filter((element) => layoutElementHasTag(element, controllerPreviewTag))
      : groupElements;
  const selectedElement =
    group && selectedElementIds.size === 1
      ? groupElements.find((element) => element.id === [...selectedElementIds][0])
      : undefined;
  const selectedArtCompositionId = selectedElement
    ? layoutElementArtCompositionId(selectedElement)
    : "";
  const selectedArtComposition = selectedArtCompositionId
    ? compositionById.get(selectedArtCompositionId) || null
    : null;

  const openArtCompositionForElement = (element: LayoutElement) => {
    if (!onOpenArtComposition) return;
    const compositionId = layoutElementArtCompositionId(element);
    if (!compositionId || !compositionById.has(compositionId)) return;
    onOpenArtComposition(compositionId);
  };

  const beginDrag = (element: LayoutElement, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (get(element, "locked") === true) return;
    event.stopPropagation();
    const originX = Number(get(element, "x") || 0);
    const originY = Number(get(element, "y") || 0);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let nextX = originX;
    let nextY = originY;
    const modifierState = createDragModifierState();
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - startX) / scaleToFit;
      const dy = (e.clientY - startY) / scaleToFit;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      const next = applyDragModifiers(
        {
          originX,
          originY,
          deltaX: dx,
          deltaY: dy,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey
        },
        modifierState
      );
      nextX = next.x;
      nextY = next.y;
      setLive({ id: element.id, x: nextX, y: nextY });
    };
    const up = (e: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLive(null);
      const dx = (e.clientX - startX) / scaleToFit;
      const dy = (e.clientY - startY) / scaleToFit;
      const next = applyDragModifiers(
        {
          originX,
          originY,
          deltaX: dx,
          deltaY: dy,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey
        },
        modifierState
      );
      nextX = next.x;
      nextY = next.y;
      if (moved) controller.moveElement(element.id, nextX, nextY);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const renderElement = (element: LayoutElement, index: number, total: number) => {
    const livePos = live?.id === element.id ? live : null;
    const x = livePos ? livePos.x : Number(get(element, "x") || 0);
    const y = livePos ? livePos.y : Number(get(element, "y") || 0);
    const width = Number(get(element, "width") || 1);
    const height = Number(get(element, "height") || 1);
    const compositionId = layoutElementArtCompositionId(element);
    const composition = compositionId ? compositionById.get(compositionId) : null;
    const isText = element.kind === "text" || compositionId === "layout-text-field";
    const isCollection = element.kind === "collection";
    const collectionBinding = isCollection
      ? choiceCollectionBindingForElement(gamePluginInputs, element.id)
      : null;
    const rendererCollectionCompositionId = isCollection
      ? rendererCollectionCompositionForElement(gamePluginRenderers, mode, element.id)
      : "";
    const collectionCompositionCandidate = collectionBinding || rendererCollectionCompositionId
      ? compositionById.get(collectionBinding?.item.artCompositionId || rendererCollectionCompositionId) || null
      : null;
    const collectionComposition = collectionCompositionCandidate
      && String(collectionCompositionCandidate.surface || "").toLowerCase() === mode
      && String(collectionCompositionCandidate.compositionKind || "gameObject").toLowerCase() === "gameobject"
      ? collectionCompositionCandidate
      : null;
    const textValue = String(get(element, "defaultText") || "");
    const fontFamily = normalizeGameTextFontFamily(get(element, "fontFamily"));
    const selected = selectedElementIds.has(element.id);
    const hidden = get(element, "hidden") === true;
    const locked = get(element, "locked") === true;
    const style: CSSProperties = {
      position: "absolute",
      left: x - width / 2,
      top: y - height / 2,
      width,
      height,
      transform: `scale(${Number(get(element, "scale") || 1)}) rotate(${Number(get(element, "rotation") || 0)}deg)`,
      transformOrigin: "center",
      border: selected ? "2px solid #22d3ee" : "1px solid rgba(255,255,255,0.4)",
      background: composition ? "transparent" : "rgba(255,255,255,0.08)",
      color: isText ? String(get(element, "fontColor") || "#ffffff") : "#fff",
      fontFamily: isText ? fontFamily : undefined,
      display: isCollection ? undefined : "grid",
      placeItems: isCollection ? undefined : "center",
      opacity: hidden ? (selected ? 0.28 : 0.08) : 1,
      overflow: isCollection ? undefined : "visible",
      boxSizing: "border-box",
      zIndex: get(element, "layoutLayer") === "background" ? 0 : Math.max(1, total - index),
      pointerEvents: locked || hidden ? "none" : "auto",
      ...(isCollection ? choiceCollectionLayoutStyle(element as Record<string, unknown>) : {})
    };
    const compositionCanvas = composition?.canvas || { width, height };
    const compositionScaleX = width / Math.max(1, Number(compositionCanvas.width || width));
    const compositionScaleY = height / Math.max(1, Number(compositionCanvas.height || height));
    return (
      <div
        key={element.id}
        className="layout-canvas-element"
        data-layout-element={element.id}
        data-layout-art-composition={composition ? composition.id : undefined}
        data-layout-element-hidden={hidden ? "true" : "false"}
        data-layout-element-locked={locked ? "true" : "false"}
        aria-current={selected ? "true" : undefined}
        style={style}
        onDoubleClick={
          locked || hidden || !composition
            ? undefined
            : (event) => {
                event.stopPropagation();
                openArtCompositionForElement(element);
              }
        }
        onPointerDown={locked || hidden ? undefined : (event) => beginDrag(element, event)}
        onClick={
          locked || hidden
            ? undefined
            : (event) => {
                event.stopPropagation();
                controller.selectElement(
                  element.id,
                  event.metaKey || event.ctrlKey || event.shiftKey
                );
              }
        }
      >
        {composition ? (
          <div
            className="layout-art-instance-canvas"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: Number(compositionCanvas.width || width),
              height: Number(compositionCanvas.height || height),
              transform: `scale(${compositionScaleX}, ${compositionScaleY})`,
              transformOrigin: "top left",
              pointerEvents: "none"
            }}
          >
            <ArtPreviewRenderer
              assetUrlById={assetUrlById}
              components={composition.components || []}
              compositionById={compositionById}
              interactive={false}
              showHandles={false}
              textOverride={isText ? layoutTextOverride(element) : undefined}
            />
          </div>
        ) : isCollection ? (
          ["Option", "A realistic long private option label", "Option"].map((label, previewIndex) => {
            const itemDimensions = collectionComposition
              ? choiceCollectionItemDimensions(
                  element as Record<string, unknown>,
                  collectionComposition as unknown as Record<string, unknown>,
                  3
                )
              : { width: element.collectionDirection === "horizontal" ? 96 : width, height: 72 };
            const itemCanvas = collectionComposition?.canvas || itemDimensions;
            return (
            <div
              data-layout-choice-collection-preview-item
              key={`${element.id}-preview-${previewIndex}`}
              style={{
                position: "relative",
                boxSizing: "border-box",
                flex: "0 0 auto",
                width: itemDimensions.width,
                height: itemDimensions.height,
                minWidth: 0,
                display: "grid",
                placeItems: "center",
                padding: collectionComposition ? 0 : 8,
                border: collectionComposition ? 0 : "1px dashed rgba(255,255,255,0.55)",
                borderRadius: 12,
                overflow: "visible",
                textAlign: "center",
                fontSize: 14,
                lineHeight: 1.1,
                pointerEvents: "none"
              }}
            >
              {collectionComposition ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: Number(itemCanvas.width || itemDimensions.width),
                    height: Number(itemCanvas.height || itemDimensions.height),
                    transform: `scale(${itemDimensions.width / Math.max(1, Number(itemCanvas.width || 1))}, ${itemDimensions.height / Math.max(1, Number(itemCanvas.height || 1))})`,
                    transformOrigin: "top left"
                  }}
                >
                  <ArtPreviewRenderer
                    assetUrlById={assetUrlById}
                    components={collectionComposition.components || []}
                    compositionById={compositionById}
                    interactive={false}
                    showHandles={false}
                    textOverrides={{ [collectionBinding!.item.targetComponentId]: label }}
                  />
                </div>
              ) : label}
            </div>
            );
          })
        ) : (
          <span
            dangerouslySetInnerHTML={isText ? { __html: gameTextHtml(textValue) } : undefined}
            style={
              isText
                ? {
                    width: "100%",
                    minWidth: 0,
                    boxSizing: "border-box",
                    whiteSpace: "pre-wrap",
                    overflowWrap: get(element, "autoFitText") === true ? "normal" : "anywhere",
                    wordBreak: get(element, "autoFitText") === true ? "keep-all" : "normal",
                    textAlign: "center",
                    fontSize: Number(get(element, "fontSize") || 58),
                    fontWeight: 1000,
                    lineHeight: 1
                  }
                : undefined
            }
          >
            {isText ? null : element.name || element.kind || "art"}
          </span>
        )}
      </div>
    );
  };

  const beginElementLayerDrag = (id: string, event: ReactDragEvent<HTMLDivElement>) => {
    setElementDragId(id);
    setElementDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const updateElementLayerDropTarget = (
    targetId: string,
    event: ReactDragEvent<HTMLDivElement>
  ) => {
    const draggingId = elementDragId || event.dataTransfer.getData("text/plain");
    if (!draggingId || draggingId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setElementDropTarget({ id: targetId, placement: layerDropPlacement(event) });
  };

  const dropElementLayer = (targetId: string, event: ReactDragEvent<HTMLDivElement>) => {
    const draggingId = elementDragId || event.dataTransfer.getData("text/plain");
    const placement = layerDropPlacement(event);
    setElementDragId(null);
    setElementDropTarget(null);
    if (!draggingId || draggingId === targetId) return;
    event.preventDefault();
    controller.reorderElement(draggingId, targetId, placement);
  };

  const endElementLayerDrag = () => {
    setElementDragId(null);
    setElementDropTarget(null);
  };

  const toolbar = (
    <>
      <button type="button" data-layout-add-text onClick={() => controller.addTextElement()}>
        Add Text
      </button>
      <button
        type="button"
        data-layout-add-choice-collection
        onClick={() => controller.addChoiceCollection()}
      >
        Add Collection
      </button>
      <button
        type="button"
        data-layout-add-game-object
        onClick={() => {
          setGameObjectSearch("");
          setGameObjectPickerOpen(true);
        }}
      >
        Add Game Object
      </button>
      <button type="button" disabled={!canUndo} onClick={() => controller.undo()}>
        Undo
      </button>
      <button type="button" disabled={!canRedo} onClick={() => controller.redo()}>
        Redo
      </button>
      <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
        {saving ? "Saving…" : "Save"}
      </button>
      {mode === "controller" ? (
        <ControllerConfigurationPicker
          tags={controllerViewTags}
          value={controllerPreviewTag}
          onChange={(tag) => {
            if (!group) return;
            setControllerPreviewTagsByGroup((current) => ({ ...current, [group.id]: tag }));
          }}
        />
      ) : null}
      <span data-layout-status>{dirty ? "Unsaved changes" : "Saved"}</span>
    </>
  );

  const sidebar = (
    <>
      <h3>Layouts</h3>
      {surface !== "tools" ? (
        <div className="tool-sidebar-switcher" role="group" aria-label="Layout surface">
          <button type="button" aria-pressed={mode === "stage"} onClick={() => setMode("stage")}>
            Stage
          </button>
          <button
            type="button"
            aria-pressed={mode === "controller"}
            onClick={() => setMode("controller")}
          >
            Controller
          </button>
        </div>
      ) : null}
      {mode === "controller" ? (
        <div className="layout-group-create">
          <button
            type="button"
            data-layout-add-group
            aria-expanded={groupCreatorOpen}
            onClick={() => {
              setGroupCreatorKind("state");
              setNewGroupName("New Controller Layout");
              setNewGroupId("new-controller-layout");
              setGroupIdEdited(false);
              setGroupCreatorOpen(true);
            }}
          >
            Add Game Layout
          </button>
          <button
            type="button"
            data-layout-add-persistent-layer
            aria-expanded={groupCreatorOpen && groupCreatorKind === "layer"}
            onClick={() => {
              setGroupCreatorKind("layer");
              setNewGroupName("Persistent Layer");
              setNewGroupId("persistent-layer");
              setGroupIdEdited(false);
              setGroupCreatorOpen(true);
            }}
          >
            Add Persistent Layer
          </button>
          {groupCreatorOpen ? (
            <form
              data-layout-group-create-form
              onSubmit={(event) => {
                event.preventDefault();
                const createdId = groupCreatorKind === "layer"
                  ? controller.addPersistentLayer({ id: newGroupId, name: newGroupName })
                  : controller.addLayoutGroup({ id: newGroupId, name: newGroupName });
                if (!createdId) return;
                setGroupCreatorOpen(false);
                setNewGroupName("New Controller Layout");
                setNewGroupId("new-controller-layout");
                setGroupIdEdited(false);
              }}
            >
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={newGroupName}
                  data-layout-group-name
                  onChange={(event) => {
                    const name = event.target.value;
                    setNewGroupName(name);
                    if (!groupIdEdited) {
                      setNewGroupId(normalizeLayoutAuthoringId(name, "controller-layout"));
                    }
                  }}
                />
              </label>
              <label>
                <span>Layout ID</span>
                <input
                  type="text"
                  value={newGroupId}
                  data-layout-group-id
                  onChange={(event) => {
                    setGroupIdEdited(true);
                    setNewGroupId(normalizeLayoutAuthoringId(event.target.value));
                  }}
                />
              </label>
              <small>
                {groupCreatorKind === "layer"
                  ? "Use this stable ID as a persistent renderer layer scope."
                  : "Use this ID in a game-owned controller input registration."}
              </small>
              <div>
                <button type="submit" disabled={!newGroupId}>
                  Create
                </button>
                <button type="button" onClick={() => setGroupCreatorOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
      <ol className="tool-sidebar-list" data-layout-react-component="state-list">
        {groups.map((item) => (
          <li data-layout-group-id={item.id} key={item.id}>
            <button
              type="button"
              aria-current={item.id === selectedGroupId ? "true" : undefined}
              data-layout-group-select={item.id}
              onClick={() => controller.selectGroup(item.id)}
            >
              <span>
                <strong>{item.name || item.id}</strong>
                <small>
                  {item.id}
                  {(layouts.layers || []).some((layer) => layer.id === item.id) ? " · persistent" : ""}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {selectedPersistentLayer ? (
        <label data-layout-persistent-layer-order>
          <span>Persistent layer z-order</span>
          <input
            type="number"
            value={selectedPersistentLayer.zIndex}
            onChange={(event) => controller.updatePersistentLayer(selectedPersistentLayer.id, {
              zIndex: Number(event.target.value)
            })}
          />
          <small>Lower values render behind Global (200); active state renders at 300.</small>
        </label>
      ) : null}
      {selectedControllerState && (layouts.layers || []).length ? (
        <fieldset data-layout-persistent-layer-visibility>
          <legend>Persistent layers in this state</legend>
          {(layouts.layers || []).map((layer) => {
            const visible = !(selectedControllerState.hiddenLayers || []).includes(layer.id);
            return (
              <label key={layer.id}>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) => controller.setPersistentLayerVisible(
                    selectedControllerState.id,
                    layer.id,
                    event.target.checked
                  )}
                />
                <span>{layer.name || layer.id}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}
      <div className="layout-object-list-panel" data-layout-react-component="object-list">
        <h3>Game Objects</h3>
        {group ? (
          <ol className="layout-object-list">
            {groupElements.map((element) => {
              const hidden = get(element, "hidden") === true;
              const locked = get(element, "locked") === true;
              const selected = selectedElementIds.has(element.id);
              const compositionId = layoutElementArtCompositionId(element);
              const linkedComposition = compositionId ? compositionById.get(compositionId) : null;
              const initialState =
                mode === "controller"
                  ? controllerInitialAnimationState(get(element, "defaultAnimationState"))
                  : "";
              const tags = mode === "controller" ? layoutElementTags(element) : [];
              return (
                <li
                  data-layout-object-id={element.id}
                  data-layout-object-art-composition={
                    linkedComposition ? linkedComposition.id : undefined
                  }
                  data-layout-object-initial-state={initialState || undefined}
                  data-layout-object-tags={tags.join("|") || undefined}
                  data-layout-layer-drop-placement={
                    elementDropTarget?.id === element.id ? elementDropTarget.placement : undefined
                  }
                  key={element.id}
                >
                  <div
                    className="layout-object-row"
                    draggable
                    data-layout-object-hidden={hidden ? "true" : "false"}
                    data-layout-object-locked={locked ? "true" : "false"}
                    onDragStart={(event) => beginElementLayerDrag(element.id, event)}
                    onDragOver={(event) => updateElementLayerDropTarget(element.id, event)}
                    onDrop={(event) => dropElementLayer(element.id, event)}
                    onDragEnd={endElementLayerDrag}
                  >
                    <button
                      type="button"
                      className="layout-object-select"
                      aria-current={selected ? "true" : undefined}
                      data-layout-object-select={element.id}
                      onClick={(event) =>
                        controller.selectElement(
                          element.id,
                          event.metaKey || event.ctrlKey || event.shiftKey
                        )
                      }
                      onDoubleClick={
                        linkedComposition
                          ? (event) => {
                              event.stopPropagation();
                              openArtCompositionForElement(element);
                            }
                          : undefined
                      }
                    >
                      <strong>{element.name || element.id}</strong>
                      <small>
                        {compositionId || element.kind || "object"}
                        {initialState ? ` · ${initialState}` : ""}
                        {tags.length ? ` · ${tags.join(", ")}` : ""}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="layout-object-toggle layout-object-visible-toggle"
                      aria-label={
                        hidden
                          ? `Show ${element.name || element.id}`
                          : `Hide ${element.name || element.id}`
                      }
                      aria-pressed={!hidden}
                      title={hidden ? "Show in layout" : "Hide in layout"}
                      data-layout-object-visible={element.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        controller.updateElement(element.id, {
                          hidden: !hidden
                        } as Partial<LayoutElement>);
                      }}
                    >
                      <span
                        className="layout-object-eye-icon"
                        data-layout-object-eye-icon={hidden ? "hidden" : "visible"}
                      />
                    </button>
                    <button
                      type="button"
                      className="layout-object-toggle layout-object-lock-toggle"
                      aria-label={
                        locked
                          ? `Unlock ${element.name || element.id}`
                          : `Lock ${element.name || element.id}`
                      }
                      aria-pressed={locked}
                      title={locked ? "Unlock preview selection" : "Lock preview selection"}
                      data-layout-object-lock={element.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        controller.updateElement(element.id, {
                          locked: !locked
                        } as Partial<LayoutElement>);
                      }}
                    >
                      <span
                        className="art-component-layer-lock-icon"
                        data-art-layer-lock-icon={locked ? "locked" : "unlocked"}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="layout-object-empty">Select a layout.</p>
        )}
      </div>
    </>
  );

  return (
    <ToolWorkspace
      className="layout-react-shell"
      dataAttributes={{ "layout-react-shell": "react", surface: surface, "layout-mode": mode }}
      header={<h2>{group?.name || group?.id || "Layouts"}</h2>}
      sidebar={sidebar}
      sidebarLabel="Layout groups"
      storageKey="partyTemplate.layoutSidebarWidth"
      title={mode === "controller" ? "Controller Layout Tool" : "Layout Tool"}
      toolbar={toolbar}
      toolId="layout"
      history={{
        id: "layout",
        canUndo,
        canRedo,
        onUndo: () => controller.undo(),
        onRedo: () => controller.redo()
      }}
    >
      <ToolSaveError
        error={state.error}
        source={mode === "stage" ? "layout" : "controller-layout"}
      />
      {gameObjectPickerOpen ? (
        <div
          className="art-prefab-dialog-backdrop layout-game-object-picker-backdrop"
          role="presentation"
          onMouseDown={() => setGameObjectPickerOpen(false)}
        >
          <section
            className="flow-react-panel art-prefab-dialog layout-game-object-picker"
            role="dialog"
            aria-modal="true"
            aria-label={`Add ${mode} Game Object`}
            data-layout-game-object-picker={mode}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h3>Add Game Object</h3>
                <p>
                  Choose an existing {mode === "controller" ? "Controller" : "Stage"} Game Object
                  from Art Manager.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Game Object picker"
                onClick={() => setGameObjectPickerOpen(false)}
              >
                Close
              </button>
            </header>
            <input
              type="search"
              autoFocus
              placeholder="Search Game Objects"
              value={gameObjectSearch}
              data-layout-game-object-search
              onChange={(event) => setGameObjectSearch(event.target.value)}
            />
            {visibleGameObjects.length ? (
              <ol>
                {visibleGameObjects.map((composition) => (
                  <li key={composition.id}>
                    <button
                      type="button"
                      data-layout-game-object-option={composition.id}
                      onClick={() => {
                        if (!controller.addGameObject(composition)) return;
                        setGameObjectPickerOpen(false);
                      }}
                    >
                      <strong>{composition.name || composition.id}</strong>
                      <small>
                        {composition.id} · {Number(composition.canvas?.width || 0)} ×{" "}
                        {Number(composition.canvas?.height || 0)}
                      </small>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p data-layout-game-object-empty>
                {availableGameObjects.length
                  ? "No Game Objects match that search."
                  : `No ${mode} Game Objects are available in Art Manager.`}
              </p>
            )}
          </section>
        </div>
      ) : null}
      <div className="tool-main-columns layout-workspace-content">
        <section
          ref={previewPanelRef}
          className="flow-react-panel layout-preview-panel"
          data-layout-react-component="canvas"
        >
          <div
            className="layout-canvas"
            data-layout-canvas
            style={{
              position: "relative",
              width: canvasWidth * scaleToFit,
              height: canvasHeight * scaleToFit,
              background: "#1a1030",
              overflow: "hidden"
            }}
            onClick={() => controller.clearElementSelection()}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `scale(${scaleToFit})`,
                transformOrigin: "0 0",
                width: canvasWidth,
                height: canvasHeight
              }}
            >
              {previewElements.map((element, index) =>
                renderElement(element, index, previewElements.length || 1)
              )}
            </div>
          </div>
        </section>

        <LayoutElementInspector
          artComposition={selectedArtComposition}
          controller={controller}
          element={selectedElement ?? null}
          mode={mode}
          viewTags={controllerViewTags}
        />
      </div>
    </ToolWorkspace>
  );
}

function LayoutElementInspector({
  artComposition,
  controller,
  element,
  mode,
  viewTags
}: {
  artComposition: ArtComposition | null;
  controller: LayoutController;
  element: LayoutElement | null;
  mode: "stage" | "controller";
  viewTags: string[];
}) {
  if (!element) {
    return (
      <section
        className="flow-react-panel flow-react-inspector layout-element-inspector"
        data-layout-react-component="element-inspector"
        data-empty="true"
      >
        <h3>Element</h3>
        <p>Select an element.</p>
      </section>
    );
  }
  const commit = (patch: Partial<LayoutElement>) => controller.updateElement(element.id, patch);
  const isText =
    element.kind === "text" || get(element, "artCompositionId") === "layout-text-field";
  const isCollection = element.kind === "collection";
  const defaultDimensions = artCompositionDefaultDimensions(artComposition);
  return (
    <section
      className="flow-react-panel flow-react-inspector layout-element-inspector"
      data-layout-react-component="element-inspector"
      data-layout-element-id={element.id}
    >
      <h3>{element.name || element.kind}</h3>
      <label className="flow-react-field" data-layout-field="id">
        <span>Element ID</span>
        <input type="text" readOnly value={element.id} data-layout-element-id-value />
      </label>
      {element.artCompositionId ? (
        <label className="flow-react-field" data-layout-field="artCompositionId">
          <span>Game Object</span>
          <input
            type="text"
            readOnly
            value={String(element.artCompositionId)}
            data-layout-element-composition-id
          />
        </label>
      ) : null}
      <label className="flow-react-field" data-layout-field="name">
        <span>Name</span>
        <input
          type="text"
          key={`${element.id}-name`}
          defaultValue={element.name || ""}
          data-layout-element-name
          onBlur={(event) => commit({ name: event.target.value })}
        />
      </label>
      <label className="flow-react-field" data-layout-field="visible">
        <span>Visible</span>
        <input
          type="checkbox"
          checked={get(element, "hidden") !== true}
          data-layout-element-field="visible"
          onChange={(event) => commit({ hidden: !event.target.checked } as Partial<LayoutElement>)}
        />
      </label>
      <label className="flow-react-field" data-layout-field="locked">
        <span>Locked</span>
        <input
          type="checkbox"
          checked={get(element, "locked") === true}
          data-layout-element-field="locked"
          onChange={(event) => commit({ locked: event.target.checked } as Partial<LayoutElement>)}
        />
      </label>
      {mode === "stage" ? (
        <label className="flow-react-field" data-layout-field="layoutLayer">
          <span>Layout Layer</span>
          <select
            value={get(element, "layoutLayer") === "background" ? "background" : "content"}
            data-layout-element-field="layoutLayer"
            onChange={(event) =>
              commit({ layoutLayer: event.target.value } as Partial<LayoutElement>)
            }
          >
            <option value="content">Content</option>
            <option value="background">Background</option>
          </select>
        </label>
      ) : null}
      {mode === "controller" ? (
        <>
          <label className="flow-react-field" data-layout-field="defaultAnimationState">
            <span>Initial State</span>
            <select
              value={controllerInitialAnimationState(get(element, "defaultAnimationState"))}
              data-layout-element-field="defaultAnimationState"
              onChange={(event) =>
                commit({ defaultAnimationState: event.target.value } as Partial<LayoutElement>)
              }
            >
              <option value="On">On</option>
              <option value="Off">Off</option>
            </select>
          </label>
          <LayoutElementTagEditor
            availableTags={viewTags}
            key={element.id}
            tags={layoutElementTags(element)}
            onChange={(tags) => commit({ tags })}
          />
        </>
      ) : null}
      {isCollection ? (
        <fieldset data-layout-choice-collection-fields>
          <legend>Dynamic renderer collection</legend>
          <label className="flow-react-field" data-layout-field="collectionDirection">
            <span>Direction</span>
            <select
              value={String(get(element, "collectionDirection") || "vertical")}
              onChange={(event) => commit({ collectionDirection: event.target.value } as Partial<LayoutElement>)}
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
          <label className="flow-react-field" data-layout-field="collectionDistribution">
            <span>Distribution</span>
            <select
              value={String(get(element, "collectionDistribution") || "start")}
              onChange={(event) => commit({ collectionDistribution: event.target.value } as Partial<LayoutElement>)}
            >
              <option value="start">Start</option>
              <option value="center">Center</option>
              <option value="end">End</option>
              <option value="space-between">Space between</option>
              <option value="space-around">Space around</option>
              <option value="space-evenly">Space evenly</option>
            </select>
          </label>
          <label className="flow-react-field" data-layout-field="collectionAlignment">
            <span>Alignment</span>
            <select
              value={String(get(element, "collectionAlignment") || "stretch")}
              onChange={(event) => commit({ collectionAlignment: event.target.value } as Partial<LayoutElement>)}
            >
              <option value="stretch">Stretch</option>
              <option value="start">Start</option>
              <option value="center">Center</option>
              <option value="end">End</option>
            </select>
          </label>
          <label className="flow-react-field" data-layout-field="collectionOverflow">
            <span>Overflow</span>
            <select
              value={String(get(element, "collectionOverflow") || "auto")}
              onChange={(event) => commit({ collectionOverflow: event.target.value } as Partial<LayoutElement>)}
            >
              <option value="auto">Auto scroll</option>
              <option value="scroll">Always scroll</option>
              <option value="hidden">Hidden</option>
              <option value="visible">Visible</option>
            </select>
          </label>
          {[
            ["collectionGap", "Gap", 16],
            ["collectionPadding", "Padding", 0],
            ["zIndex", "Local z-order", 0]
          ].map(([key, label, fallback]) => (
            <label className="flow-react-field" data-layout-field={String(key)} key={String(key)}>
              <span>{String(label)}</span>
              <input
                type="number"
                key={`${element.id}-${String(key)}-${String(get(element, String(key)) ?? fallback)}`}
                defaultValue={String(get(element, String(key)) ?? fallback)}
                onBlur={(event) => commit({ [String(key)]: Number(event.target.value) } as Partial<LayoutElement>)}
              />
            </label>
          ))}
        </fieldset>
      ) : null}
      {SCALAR_FIELDS.map((field) => (
        <label className="flow-react-field" data-layout-field={field.key} key={field.key}>
          <span>{field.label}</span>
          <input
            type="number"
            key={`${element.id}-${field.key}-${String(get(element, field.key) ?? "")}`}
            defaultValue={String(get(element, field.key) ?? 0)}
            data-layout-element-field={field.key}
            onBlur={(event) =>
              commit({ [field.key]: Number(event.target.value) } as Partial<LayoutElement>)
            }
          />
        </label>
      ))}
      {defaultDimensions ? (
        <div
          className="flow-react-field layout-dimension-reset-row"
          data-layout-field="resetDimensions"
          data-layout-art-default-width={defaultDimensions.width}
          data-layout-art-default-height={defaultDimensions.height}
        >
          <span>Size Preset</span>
          <button
            type="button"
            data-layout-reset-art-dimensions
            title={`Reset width and height to ${defaultDimensions.width} x ${defaultDimensions.height}`}
            onClick={() =>
              commit({
                width: defaultDimensions.width,
                height: defaultDimensions.height
              } as Partial<LayoutElement>)
            }
          >
            Refresh Width/Height
          </button>
        </div>
      ) : null}
      {isText ? (
        <>
          <label className="flow-react-field" data-layout-field="defaultText">
            <span>Text</span>
            <input
              type="text"
              key={`${element.id}-text`}
              defaultValue={String(get(element, "defaultText") || "")}
              data-layout-element-field="defaultText"
              onBlur={(event) =>
                commit({ defaultText: event.target.value } as Partial<LayoutElement>)
              }
            />
          </label>
          <label className="flow-react-field" data-layout-field="fontSize">
            <span>Font Size</span>
            <input
              type="number"
              key={`${element.id}-fontSize`}
              defaultValue={String(get(element, "fontSize") ?? 58)}
              data-layout-element-field="fontSize"
              onBlur={(event) =>
                commit({ fontSize: Number(event.target.value) } as Partial<LayoutElement>)
              }
            />
          </label>
          <label className="flow-react-field" data-layout-field="fontFamily">
            <span>Font</span>
            <select
              value={normalizeGameTextFontFamily(get(element, "fontFamily"))}
              data-layout-element-field="fontFamily"
              onChange={(event) =>
                commit({ fontFamily: event.target.value } as Partial<LayoutElement>)
              }
            >
              {gameTextFontOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flow-react-field" data-layout-field="autoFitText">
            <span>Auto Fit Text</span>
            <input
              type="checkbox"
              checked={get(element, "autoFitText") === true}
              data-layout-element-field="autoFitText"
              onChange={(event) =>
                commit({ autoFitText: event.target.checked } as Partial<LayoutElement>)
              }
            />
          </label>
        </>
      ) : null}
    </section>
  );
}
