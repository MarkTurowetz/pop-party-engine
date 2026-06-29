import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import type { ArtComponent } from "../../types/game-data";
import type { ArtCompositionsController } from "./artCompositionsController";
import { creatableComponentKinds } from "./artComponentSchema";
import { useArtCompositions } from "./useArtCompositions";

export interface ArtCompositionEditorProps {
  controller: ArtCompositionsController;
}

const SCALAR_FIELDS: { key: string; label: string }[] = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" }
];

function get(component: ArtComponent, key: string): unknown {
  return (component as Record<string, unknown>)[key];
}

function findComponent(components: ArtComponent[], id: string): ArtComponent | undefined {
  for (const component of components) {
    if (component.id === id) return component;
    const found = component.children ? findComponent(component.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

function ComponentTree({
  components,
  selectedIds,
  onSelect,
  depth = 0
}: {
  components: ArtComponent[];
  selectedIds: Set<string>;
  onSelect: (id: string, additive: boolean) => void;
  depth?: number;
}) {
  return (
    <ol className="flow-react-list" data-art-component-tree={depth}>
      {components.map((component) => (
        <li data-art-component-id={component.id} key={component.id}>
          <button
            type="button"
            aria-current={selectedIds.has(component.id) ? "true" : undefined}
            data-art-component-select={component.id}
            onClick={(event) => onSelect(component.id, event.metaKey || event.ctrlKey || event.shiftKey)}
          >
            <strong>{component.name || component.kind}</strong>
            <small>{component.kind}</small>
          </button>
          {component.children?.length ? (
            <ComponentTree components={component.children} selectedIds={selectedIds} onSelect={onSelect} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function ArtCompositionEditor({ controller }: ArtCompositionEditorProps) {
  const { compositions, selectedCompositionId, selectedComponentIds, dirty, saving, canUndo, canRedo } =
    useArtCompositions(controller);
  const [surface, setSurface] = useState<"stage" | "controller">("stage");
  const dragRef = useRef<{ id: string; originX: number; originY: number; startX: number; startY: number; moved: boolean } | null>(
    null
  );
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);

  const visible = compositions.filter((composition) => (composition.surface || "stage") === surface);
  const composition = compositions.find((item) => item.id === selectedCompositionId) || null;
  const selectedComponent =
    composition && selectedComponentIds.size === 1
      ? findComponent(composition.components || [], [...selectedComponentIds][0])
      : undefined;

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
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      setLive({ id: drag.id, x: drag.originX + dx, y: drag.originY + dy });
    };
    const up = (e: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const drag = dragRef.current;
      dragRef.current = null;
      setLive(null);
      if (drag && drag.moved) {
        controller.moveComponent(drag.id, drag.originX + (e.clientX - drag.startX), drag.originY + (e.clientY - drag.startY));
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const renderComponent = (component: ArtComponent): ReactElement => {
    const livePos = live?.id === component.id ? live : null;
    const x = livePos ? livePos.x : Number(get(component, "x") || 0);
    const y = livePos ? livePos.y : Number(get(component, "y") || 0);
    const width = Number(get(component, "width") || 1);
    const height = Number(get(component, "height") || 1);
    const fill = String(get(component, "fillColor") || "transparent");
    const border = String(get(component, "borderColor") || "#17131f");
    return (
      <div
        key={component.id}
        className="art-canvas-component"
        data-art-canvas-component={component.id}
        aria-current={selectedComponentIds.has(component.id) ? "true" : undefined}
        style={{
          position: "absolute",
          left: x - width / 2,
          top: y - height / 2,
          width,
          height,
          background: fill === "transparent" ? "rgba(255,255,255,0.06)" : fill,
          border: `2px solid ${border === "transparent" ? "#888" : border}`,
          outline: selectedComponentIds.has(component.id) ? "2px solid #22d3ee" : "none",
          fontSize: 11,
          overflow: "hidden"
        }}
        onPointerDown={(event) => beginDrag(component, event)}
        onClick={(event) => {
          event.stopPropagation();
          controller.selectComponent(component.id, event.metaKey || event.ctrlKey || event.shiftKey);
        }}
      >
        <span>{component.kind === "text" ? String(get(component, "defaultText") || component.name) : component.name}</span>
        {component.children?.map((child) => renderComponent(child))}
      </div>
    );
  };

  return (
    <section className="flow-react-panel" data-art-react-component="composition-editor">
      <div className="flow-editor-controls">
        <button type="button" aria-pressed={surface === "stage"} onClick={() => setSurface("stage")}>
          Stage
        </button>
        <button type="button" aria-pressed={surface === "controller"} onClick={() => setSurface("controller")}>
          Controller
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
        <span data-art-compositions-status>{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>

      <div className="art-editor-layout" style={{ display: "flex", gap: 12 }}>
        <section className="flow-react-panel" data-art-react-component="composition-list" style={{ minWidth: 160 }}>
          <h3>Compositions ({visible.length})</h3>
          <ol className="flow-react-list">
            {visible.map((item) => (
              <li data-art-composition-id={item.id} key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === selectedCompositionId ? "true" : undefined}
                  data-art-composition-select={item.id}
                  onClick={() => controller.selectComposition(item.id)}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="flow-react-panel" data-art-react-component="canvas" style={{ flex: 1 }}>
          <div className="flow-editor-controls">
            {creatableComponentKinds.map((kind) => (
              <button type="button" data-art-add-component={kind} key={kind} onClick={() => controller.addComponent(kind)}>
                Add {kind}
              </button>
            ))}
          </div>
          {composition ? (
            <div
              className="art-canvas"
              data-art-canvas={composition.id}
              style={{
                position: "relative",
                width: Number(composition.canvas?.width || 560),
                height: Number(composition.canvas?.height || 230),
                background: "#2b145f",
                overflow: "hidden"
              }}
              onClick={() => controller.clearComponentSelection()}
            >
              {(composition.components || []).map((component) => renderComponent(component))}
            </div>
          ) : (
            <p>No composition selected.</p>
          )}
          {composition ? (
            <ComponentTree
              components={composition.components || []}
              selectedIds={selectedComponentIds}
              onSelect={(id, additive) => controller.selectComponent(id, additive)}
            />
          ) : null}
        </section>

        <ArtComponentInspector controller={controller} component={selectedComponent ?? null} />
      </div>
    </section>
  );
}

function ArtComponentInspector({
  controller,
  component
}: {
  controller: ArtCompositionsController;
  component: ArtComponent | null;
}) {
  if (!component) {
    return (
      <section className="flow-react-panel flow-react-inspector" data-art-react-component="component-inspector" data-empty="true" style={{ minWidth: 180 }}>
        <h3>Component</h3>
        <p>Select a component.</p>
      </section>
    );
  }
  const commit = (patch: Partial<ArtComponent>) => controller.updateComponent(component.id, patch);
  const isTextual = component.kind === "text" || component.kind === "badge";
  return (
    <section className="flow-react-panel flow-react-inspector" data-art-react-component="component-inspector" data-art-component-id={component.id} style={{ minWidth: 180 }}>
      <h3>{component.name}</h3>
      <label className="flow-react-field" data-art-field="name">
        <span>Name</span>
        <input
          type="text"
          key={`${component.id}-name`}
          defaultValue={component.name || ""}
          data-art-component-name-input
          onBlur={(event) => commit({ name: event.target.value })}
        />
      </label>
      {SCALAR_FIELDS.map((field) => (
        <label className="flow-react-field" data-art-field={field.key} key={field.key}>
          <span>{field.label}</span>
          <input
            type="number"
            key={`${component.id}-${field.key}`}
            defaultValue={String(get(component, field.key) ?? 0)}
            data-art-component-field={field.key}
            onBlur={(event) => commit({ [field.key]: Number(event.target.value) } as Partial<ArtComponent>)}
          />
        </label>
      ))}
      <label className="flow-react-field" data-art-field="fillColor">
        <span>Fill</span>
        <input
          type="text"
          key={`${component.id}-fill`}
          defaultValue={String(get(component, "fillColor") || "")}
          data-art-component-field="fillColor"
          onBlur={(event) => commit({ fillColor: event.target.value } as Partial<ArtComponent>)}
        />
      </label>
      {isTextual ? (
        <label className="flow-react-field" data-art-field="defaultText">
          <span>Text</span>
          <input
            type="text"
            key={`${component.id}-text`}
            defaultValue={String(get(component, "defaultText") || "")}
            data-art-component-field="defaultText"
            onBlur={(event) => commit({ defaultText: event.target.value } as Partial<ArtComponent>)}
          />
        </label>
      ) : null}
    </section>
  );
}
