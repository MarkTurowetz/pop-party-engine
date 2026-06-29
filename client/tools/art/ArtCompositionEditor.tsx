import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from "react";
import type { ArtComponent } from "../../types/game-data";
import type { ArtCompositionsController } from "./artCompositionsController";
import {
  componentSupportsImageMask,
  componentSupportsShapeStyle,
  containerDistributionOptions,
  creatableComponentKinds,
  shapeStyleOptions,
  validateImageFile
} from "./artComponentSchema";
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
  const [liveTransform, setLiveTransform] = useState<{ id: string; width?: number; height?: number; rotation?: number } | null>(
    null
  );

  const beginResize = (component: ArtComponent, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const originW = Number(get(component, "width") || 1);
    const originH = Number(get(component, "height") || 1);
    const startX = event.clientX;
    const startY = event.clientY;
    let next = { width: originW, height: originH };
    const move = (e: PointerEvent) => {
      next = { width: Math.max(4, originW + (e.clientX - startX)), height: Math.max(4, originH + (e.clientY - startY)) };
      setLiveTransform({ id: component.id, width: next.width, height: next.height });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
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
    const imageUrl = componentSupportsImageMask(component) ? String(get(component, "imageDataUrl") || "") : "";
    const objectFit = String(get(component, "imageObjectFit") || "cover");
    const selected = selectedComponentIds.has(component.id);

    const style: CSSProperties = {
      position: "absolute",
      left: x - width / 2,
      top: y - height / 2,
      width,
      height,
      transform: `scale(${scale}) rotate(${rotation}deg)`,
      transformOrigin: "center",
      borderRadius: shapeBorderRadius(String(get(component, "shapeStyle") || "rounded"), Number(get(component, "borderRadius") || 0)),
      background: imageUrl ? "transparent" : fillCss || (fillColor === "transparent" ? "rgba(255,255,255,0.06)" : fillColor),
      backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
      backgroundSize: imageUrl ? objectFit : undefined,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : "1px solid rgba(255,255,255,0.18)",
      outline: selected ? "2px solid #22d3ee" : "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: String(get(component, "fontColor") || "#17131f"),
      fontSize: isTextual ? Number(get(component, "fontSize") || 16) : 11,
      overflow: "hidden",
      boxSizing: "border-box"
    };

    return (
      <div
        key={component.id}
        className="art-canvas-component"
        data-art-canvas-component={component.id}
        data-art-component-kind={kind}
        aria-current={selected ? "true" : undefined}
        style={style}
        onPointerDown={(event) => beginDrag(component, event)}
        onClick={(event) => {
          event.stopPropagation();
          controller.selectComponent(component.id, event.metaKey || event.ctrlKey || event.shiftKey);
        }}
      >
        {isTextual ? <span>{String(get(component, "defaultText") || "")}</span> : null}
        {component.children?.map((child) => renderComponent(child))}
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
    <section className="flow-react-panel flow-react-inspector" data-art-react-component="component-inspector" data-art-component-id={component.id} style={{ minWidth: 180 }}>
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
          {numberField("fontSize", "Font Size")}
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
