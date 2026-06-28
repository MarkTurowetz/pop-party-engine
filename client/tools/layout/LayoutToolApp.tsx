import type { LayoutElement, LayoutState, StageLayoutCollection } from "../../types/game-data";

export interface LayoutToolSelection {
  mode?: string;
  selectedElementIds?: string[];
  selectedStateId?: string;
}

export interface LayoutToolHandlers {
  selectElement?: (elementId: string) => void;
  selectState?: (stateId: string) => void;
}

export interface LayoutToolAppProps extends LayoutToolSelection {
  handlers?: LayoutToolHandlers;
  layouts?: StageLayoutCollection | null;
  surface?: string;
  visible?: boolean;
}

function layoutGroups(layouts: StageLayoutCollection | null | undefined): LayoutState[] {
  if (!layouts) return [];
  return [layouts.global, ...(layouts.states || [])].filter(Boolean);
}

function selectedGroup(layouts: StageLayoutCollection | null | undefined, selectedStateId = ""): LayoutState | null {
  return layoutGroups(layouts).find((group) => group.id === selectedStateId) || layouts?.global || null;
}

function selectedElements(group: LayoutState | null, selectedElementIds: string[]): LayoutElement[] {
  const selected = new Set(selectedElementIds);
  return (group?.elements || []).filter((element) => selected.has(element.id));
}

export function LayoutToolApp({
  handlers = {},
  layouts = null,
  mode = "stage",
  selectedElementIds = [],
  selectedStateId = "global",
  surface = "layout",
  visible = false
}: LayoutToolAppProps) {
  const groups = layoutGroups(layouts);
  const group = selectedGroup(layouts, selectedStateId);
  const elements = selectedElements(group, selectedElementIds);

  return (
    <section
      aria-hidden={visible ? "false" : "true"}
      className="layout-react-shell"
      data-layout-react-shell="legacy-bridge"
      data-layout-group-count={groups.length}
      data-layout-mode={mode}
      data-layout-selected-count={elements.length}
      data-surface={surface}
      hidden={!visible}
    >
      <header className="flow-react-header">
        <div>
          <p>React Preview</p>
          <h2>{group?.name || group?.id || "Layouts"}</h2>
        </div>
        <dl>
          <div>
            <dt>Groups</dt>
            <dd>{groups.length}</dd>
          </div>
          <div>
            <dt>Elements</dt>
            <dd>{group?.elements?.length || 0}</dd>
          </div>
        </dl>
      </header>
      <section className="flow-react-panel">
        <h3>Layout Groups</h3>
        <ol className="flow-react-list" data-layout-react-component="group-list">
          {groups.map((item) => (
            <li aria-current={item.id === group?.id ? "true" : undefined} data-layout-group-id={item.id} key={item.id}>
              <button type="button" onClick={() => handlers.selectState?.(item.id)}>
                <span>
                  <strong>{item.name || item.id}</strong>
                  <small>{item.id}</small>
                </span>
                <span data-action-count>{item.elements?.length || 0}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="flow-react-panel">
        <h3>Elements</h3>
        <ol className="flow-react-list" data-layout-react-component="element-list">
          {(group?.elements || []).map((element) => (
            <li aria-current={selectedElementIds.includes(element.id) ? "true" : undefined} data-layout-element-id={element.id} key={element.id}>
              <button type="button" onClick={() => handlers.selectElement?.(element.id)}>
                <span>
                  <strong>{element.name || element.id}</strong>
                  <small>{element.kind || element.selector || "object"}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="flow-react-panel flow-react-inspector" data-layout-react-component="inspector">
        <h3>Inspector</h3>
        <h2>{elements[0]?.name || elements[0]?.id || group?.name || group?.id || "Selection"}</h2>
        <dl>
          <dt>Mode</dt>
          <dd>{mode}</dd>
          <dt>Group</dt>
          <dd>{group?.id || ""}</dd>
          <dt>Selected</dt>
          <dd>{selectedElementIds.length}</dd>
          <dt>Canvas</dt>
          <dd>{layouts?.canvas ? `${layouts.canvas.width} x ${layouts.canvas.height}` : "Unknown"}</dd>
        </dl>
      </section>
    </section>
  );
}
