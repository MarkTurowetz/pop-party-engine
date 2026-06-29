import type { FlowAction, FlowState } from "../../../types/game-data";
import { actionTypeName, type FlowActionTypeMeta } from "../flowSelectors";

export interface InspectorTargetOption {
  id: string;
  label: string;
}

export interface ActionInspectorEditHandlers {
  onRenameAction?: (name: string) => void;
  onSetActionType?: (type: string) => void;
  onSetNextTarget?: (targetId: string) => void;
  onSetEntryTarget?: (targetId: string) => void;
  actionTypeOptions?: InspectorTargetOption[];
  nextTargetOptions?: InspectorTargetOption[];
  entryTargetOptions?: InspectorTargetOption[];
}

export interface ActionInspectorProps {
  action: FlowAction | null;
  actionTypes?: FlowActionTypeMeta[];
  edit?: ActionInspectorEditHandlers;
  isBranch?: boolean;
  isSubAction?: boolean;
  parentAction?: FlowAction | null;
  state: FlowState | null;
}

function actionTimingLabel(action: FlowAction): string {
  const timing = action.timing;
  if (!timing) return "default";
  const mode = typeof timing.mode === "string" && timing.mode ? timing.mode : "E+";
  const seconds = Number(timing.seconds ?? 0);
  return `${mode} ${Number.isFinite(seconds) ? seconds.toFixed(2) : "0.00"}s`;
}

function actionKind(isBranch: boolean, isSubAction: boolean): string {
  if (isBranch) return "Decision branch";
  if (isSubAction) return "Sub-action";
  return "Action";
}

function TargetSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: InspectorTargetOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flow-react-field" data-flow-react-field={label.toLowerCase()}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Default</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ActionInspector({
  action,
  actionTypes = [],
  edit,
  isBranch = false,
  isSubAction = false,
  parentAction = null,
  state
}: ActionInspectorProps) {
  if (!state) {
    return (
      <section className="flow-react-panel flow-react-inspector" data-flow-react-component="action-inspector" data-empty="true">
        <h3>Inspector</h3>
        No state selected
      </section>
    );
  }

  if (!action) {
    return (
      <section
        className="flow-react-panel flow-react-inspector"
        data-empty="true"
        data-flow-react-component="action-inspector"
        data-state-id={state.id}
      >
        <h3>Inspector</h3>
        <h2>{state.name || state.id}</h2>
        <dl>
          <dt>ID</dt>
          <dd>{state.id}</dd>
          <dt>Kind</dt>
          <dd>State</dd>
          <dt>Actions</dt>
          <dd>{state.actions?.length || 0}</dd>
        </dl>
        {edit?.onSetEntryTarget ? (
          <TargetSelect
            label="Entry"
            value={String(state.entryTargetActionId || "")}
            options={edit.entryTargetOptions || []}
            onChange={edit.onSetEntryTarget}
          />
        ) : (
          <dl>
            <dt>Entry</dt>
            <dd>{String(state.entryTargetActionId || "Default")}</dd>
          </dl>
        )}
        {edit?.onSetNextTarget ? (
          <TargetSelect
            label="Next"
            value={String(state.nextStateTargetId || "")}
            options={edit.nextTargetOptions || []}
            onChange={edit.onSetNextTarget}
          />
        ) : (
          <dl>
            <dt>Next</dt>
            <dd>{String(state.nextStateTargetId || "Default")}</dd>
          </dl>
        )}
      </section>
    );
  }

  return (
    <section
      className="flow-react-panel flow-react-inspector"
      data-action-id={action.id}
      data-action-type={action.type}
      data-flow-react-component="action-inspector"
      data-is-branch={isBranch ? "true" : "false"}
      data-is-sub-action={isSubAction ? "true" : "false"}
      data-parent-action-id={parentAction?.id || ""}
      data-state-id={state.id}
    >
      <h2>{action.name || action.id}</h2>
      {edit?.onRenameAction ? (
        <label className="flow-react-field" data-flow-react-field="name">
          <span>Name</span>
          <input
            type="text"
            key={action.id}
            defaultValue={action.name || ""}
            data-flow-react-action-name-input
            onBlur={(event) => edit.onRenameAction?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
      {edit?.onSetActionType && (edit.actionTypeOptions || []).length ? (
        <label className="flow-react-field" data-flow-react-field="action-type">
          <span>Action Type</span>
          <select
            value={action.type}
            data-flow-react-action-type-select
            onChange={(event) => edit.onSetActionType?.(event.target.value)}
          >
            {(edit.actionTypeOptions || []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <dl>
        <dt>ID</dt>
        <dd>{action.id}</dd>
        <dt>Type</dt>
        <dd>{actionTypeName(actionTypes, action.type) || action.type}</dd>
        <dt>Kind</dt>
        <dd>{actionKind(isBranch, isSubAction)}</dd>
        <dt>State</dt>
        <dd>{state.name || state.id}</dd>
        <dt>Parent</dt>
        <dd>{parentAction?.name || parentAction?.id || "None"}</dd>
        <dt>Timing</dt>
        <dd>{actionTimingLabel(action)}</dd>
      </dl>
    </section>
  );
}
