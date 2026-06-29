import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { LayoutElement } from "../../types/game-data";
import type { LayoutController } from "./layoutController";
import { layoutGroups } from "./layoutModel";
import { useLayoutEditor } from "./useLayoutEditor";

export interface LayoutEditorProps {
  stageController: LayoutController;
  controllerController: LayoutController;
  surface?: string;
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

export function LayoutEditor({ stageController, controllerController, surface = "layout" }: LayoutEditorProps) {
  const [mode, setMode] = useState<"stage" | "controller">("stage");
  const controller = mode === "stage" ? stageController : controllerController;
  const state = useLayoutEditor(controller);
  const { layouts, selectedGroupId, selectedElementIds, dirty, saving, canUndo } = state;
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);

  const groups = layoutGroups(layouts);
  const group = groups.find((item) => item.id === selectedGroupId) || layouts.global || null;
  const canvasWidth = Number(layouts.canvas?.width || (mode === "controller" ? 390 : 1920));
  const canvasHeight = Number(layouts.canvas?.height || (mode === "controller" ? 844 : 1080));
  const scaleToFit = Math.min(1, 640 / canvasWidth, 360 / canvasHeight);
  const selectedElement =
    group && selectedElementIds.size === 1
      ? (group.elements || []).find((element) => element.id === [...selectedElementIds][0])
      : undefined;

  const beginDrag = (element: LayoutElement, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const originX = Number(get(element, "x") || 0);
    const originY = Number(get(element, "y") || 0);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let nextX = originX;
    let nextY = originY;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - startX) / scaleToFit;
      const dy = (e.clientY - startY) / scaleToFit;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      nextX = originX + dx;
      nextY = originY + dy;
      setLive({ id: element.id, x: nextX, y: nextY });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setLive(null);
      if (moved) controller.moveElement(element.id, nextX, nextY);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const renderElement = (element: LayoutElement) => {
    const livePos = live?.id === element.id ? live : null;
    const x = livePos ? livePos.x : Number(get(element, "x") || 0);
    const y = livePos ? livePos.y : Number(get(element, "y") || 0);
    const width = Number(get(element, "width") || 1);
    const height = Number(get(element, "height") || 1);
    const isText = element.kind === "text" || get(element, "artCompositionId") === "layout-text-field";
    const selected = selectedElementIds.has(element.id);
    const style: CSSProperties = {
      position: "absolute",
      left: x - width / 2,
      top: y - height / 2,
      width,
      height,
      transform: `scale(${Number(get(element, "scale") || 1)}) rotate(${Number(get(element, "rotation") || 0)}deg)`,
      transformOrigin: "center",
      border: selected ? "2px solid #22d3ee" : "1px solid rgba(255,255,255,0.4)",
      background: "rgba(255,255,255,0.08)",
      color: isText ? String(get(element, "fontColor") || "#ffffff") : "#fff",
      fontSize: isText ? Number(get(element, "fontSize") || 58) : 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      boxSizing: "border-box"
    };
    return (
      <div
        key={element.id}
        className="layout-canvas-element"
        data-layout-element={element.id}
        aria-current={selected ? "true" : undefined}
        style={style}
        onPointerDown={(event) => beginDrag(element, event)}
        onClick={(event) => {
          event.stopPropagation();
          controller.selectElement(element.id, event.metaKey || event.ctrlKey || event.shiftKey);
        }}
      >
        <span>{isText ? String(get(element, "defaultText") || "") : element.name || element.kind || "art"}</span>
      </div>
    );
  };

  return (
    <section className="layout-react-shell" data-layout-react-shell="react" data-surface={surface} data-layout-mode={mode}>
      <div className="flow-editor-controls">
        <button type="button" aria-pressed={mode === "stage"} onClick={() => setMode("stage")}>
          Stage
        </button>
        <button type="button" aria-pressed={mode === "controller"} onClick={() => setMode("controller")}>
          Controller
        </button>
        <button type="button" data-layout-add-text onClick={() => controller.addTextElement()}>
          Add Text
        </button>
        <button type="button" disabled={!canUndo} onClick={() => controller.undo()}>
          Undo
        </button>
        <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <span data-layout-status>{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>

      <div className="art-editor-layout" style={{ display: "flex", gap: 12 }}>
        <section className="flow-react-panel" data-layout-react-component="state-list" style={{ minWidth: 150 }}>
          <h3>Layout States</h3>
          <ol className="flow-react-list">
            {groups.map((item) => (
              <li data-layout-group-id={item.id} key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === selectedGroupId ? "true" : undefined}
                  data-layout-group-select={item.id}
                  onClick={() => controller.selectGroup(item.id)}
                >
                  {item.name || item.id}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="flow-react-panel" data-layout-react-component="canvas" style={{ flex: 1 }}>
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
            <div style={{ position: "absolute", inset: 0, transform: `scale(${scaleToFit})`, transformOrigin: "0 0", width: canvasWidth, height: canvasHeight }}>
              {(group?.elements || []).map((element) => renderElement(element))}
            </div>
          </div>
        </section>

        <LayoutElementInspector controller={controller} element={selectedElement ?? null} />
      </div>
    </section>
  );
}

function LayoutElementInspector({ controller, element }: { controller: LayoutController; element: LayoutElement | null }) {
  if (!element) {
    return (
      <section className="flow-react-panel flow-react-inspector" data-layout-react-component="element-inspector" data-empty="true" style={{ minWidth: 170 }}>
        <h3>Element</h3>
        <p>Select an element.</p>
      </section>
    );
  }
  const commit = (patch: Partial<LayoutElement>) => controller.updateElement(element.id, patch);
  const isText = element.kind === "text" || get(element, "artCompositionId") === "layout-text-field";
  return (
    <section className="flow-react-panel flow-react-inspector" data-layout-react-component="element-inspector" data-layout-element-id={element.id} style={{ minWidth: 170 }}>
      <h3>{element.name || element.kind}</h3>
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
      {SCALAR_FIELDS.map((field) => (
        <label className="flow-react-field" data-layout-field={field.key} key={field.key}>
          <span>{field.label}</span>
          <input
            type="number"
            key={`${element.id}-${field.key}-${String(get(element, field.key) ?? "")}`}
            defaultValue={String(get(element, field.key) ?? 0)}
            data-layout-element-field={field.key}
            onBlur={(event) => commit({ [field.key]: Number(event.target.value) } as Partial<LayoutElement>)}
          />
        </label>
      ))}
      {isText ? (
        <>
          <label className="flow-react-field" data-layout-field="defaultText">
            <span>Text</span>
            <input
              type="text"
              key={`${element.id}-text`}
              defaultValue={String(get(element, "defaultText") || "")}
              data-layout-element-field="defaultText"
              onBlur={(event) => commit({ defaultText: event.target.value } as Partial<LayoutElement>)}
            />
          </label>
          <label className="flow-react-field" data-layout-field="fontSize">
            <span>Font Size</span>
            <input
              type="number"
              key={`${element.id}-fontSize`}
              defaultValue={String(get(element, "fontSize") ?? 58)}
              data-layout-element-field="fontSize"
              onBlur={(event) => commit({ fontSize: Number(event.target.value) } as Partial<LayoutElement>)}
            />
          </label>
        </>
      ) : null}
    </section>
  );
}
