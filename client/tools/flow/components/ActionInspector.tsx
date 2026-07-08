import type { FlowAction } from "../../../types/game-data";
import type { FlowSubroutine } from "../flowSubroutines";
import type { FlowActionTypeMeta } from "../flowSelectors";
import { ActionFieldControls } from "./ActionFieldControls";
import type { DecisionBranchHandlers } from "./DecisionBranchControls";
import { DecisionBranchInspector } from "./DecisionBranchInspector";
import { ActionOptionsControls, type ActionOptionsHandlers } from "./ActionOptionsControls";
import { ActionTypeSelect } from "./ActionTypeSelect";

export interface InspectorTargetOption {
  id: string;
  label: string;
}

export interface ActionInspectorEditHandlers {
  onAddSubAction?: () => void;
  onRenameAction?: (name: string) => void;
  onRefreshActionName?: () => void;
  onSetActionType?: (type: string) => void;
  onSetNextTarget?: (targetId: string) => void;
  onSetEntryTarget?: (targetId: string) => void;
  onSetActionField?: (key: string, value: unknown) => void;
  onSetActionFields?: (patch: Record<string, unknown>) => void;
  onSetActionTiming?: (timing: { mode?: string; seconds?: number }) => void;
  decision?: DecisionBranchHandlers;
  options?: ActionOptionsHandlers;
  actionTypeOptions?: InspectorTargetOption[];
  actionTargetOptions?: InspectorTargetOption[];
  animationLabelOptions?: InspectorTargetOption[];
  componentTargetOptions?: InspectorTargetOption[];
  gameObjectTargetOptions?: InspectorTargetOption[];
  textTargetOptions?: InspectorTargetOption[];
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
  state: FlowSubroutine | null;
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

const UNTIMED_ACTION_TYPES = new Set(["decision", "jumpNode", "labelNode", "codeNode", "subroutine"]);

function inspectorShouldShowTiming(action: FlowAction): boolean {
  return !UNTIMED_ACTION_TYPES.has(action.type);
}

export function ActionInspector({
  action,
  edit,
  isBranch = false,
  isSubAction = false,
  parentAction = null,
  state
}: ActionInspectorProps) {
  if (!state) {
    return (
      <section
        className="flow-react-panel flow-react-inspector"
        data-flow-react-component="action-inspector"
        data-empty="true"
      >
        <h3>Inspector</h3>
        No subroutine selected
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
          <dd>Subroutine</dd>
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
        {"nextStateTargetId" in state && edit?.onSetNextTarget ? (
          <TargetSelect
            label="Next"
            value={String(state.nextStateTargetId || "")}
            options={edit.nextTargetOptions || []}
            onChange={edit.onSetNextTarget}
          />
        ) : "nextStateTargetId" in state ? (
          <dl>
            <dt>Next</dt>
            <dd>{String(state.nextStateTargetId || "Default")}</dd>
          </dl>
        ) : null}
      </section>
    );
  }

  if (isBranch && parentAction?.type === "decision") {
    return (
      <DecisionBranchInspector
        action={action}
        actionTargetOptions={edit?.actionTargetOptions || []}
        handlers={edit?.decision}
        parentAction={parentAction}
        stateId={String(state.id)}
      />
    );
  }

  return (
    <section
      className="flow-react-panel flow-react-inspector flow-action-inspector"
      data-action-id={action.id}
      data-action-type={action.type}
      data-flow-react-component="action-inspector"
      data-is-branch={isBranch ? "true" : "false"}
      data-is-sub-action={isSubAction ? "true" : "false"}
      data-parent-action-id={parentAction?.id || ""}
      data-state-id={state.id}
    >
      <header className="flow-inspector-header">
        <div>
          <span className="flow-inspector-kicker">Action</span>
          <h2>{action.name || action.id}</h2>
        </div>
        <span className="flow-inspector-tag" title={action.id}>
          {action.id}
        </span>
      </header>
      {edit?.onRenameAction ? (
        <label className="flow-react-field" data-flow-react-field="name">
          <span>Name</span>
          <div className="flow-action-name-control">
            <input
              type="text"
              key={`${action.id}:${action.name || ""}`}
              defaultValue={action.name || ""}
              data-flow-react-action-name-input
              onBlur={(event) => edit.onRenameAction?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
            />
            {edit.onRefreshActionName ? (
              <button
                type="button"
                className="flow-action-name-refresh-button"
                data-flow-action-refresh-name
                onClick={() => edit.onRefreshActionName?.()}
              >
                Refresh
              </button>
            ) : null}
          </div>
        </label>
      ) : null}
      {edit?.onSetActionType && (edit.actionTypeOptions || []).length ? (
        <label className="flow-react-field" data-flow-react-field="action-type">
          <span>Action Type</span>
          <ActionTypeSelect
            value={action.type}
            options={edit.actionTypeOptions || []}
            onChange={(type) => edit.onSetActionType?.(type)}
          />
        </label>
      ) : null}
      {edit?.onSetActionTiming && inspectorShouldShowTiming(action) ? (
        <div className="flow-react-action-timing" data-flow-react-component="action-timing">
          {isSubAction ? (
            <label className="flow-react-field" data-flow-react-field="timing-mode">
              <span>Timing Mode</span>
              <input
                type="text"
                value="S+ (after parent starts)"
                readOnly
                data-flow-react-timing-mode
              />
            </label>
          ) : (
            <label className="flow-react-field" data-flow-react-field="timing-mode">
              <span>Timing Mode</span>
              <select
                value={action.timing?.mode || "E+"}
                data-flow-react-timing-mode
                onChange={(event) => edit.onSetActionTiming?.({ mode: event.target.value })}
              >
                <option value="E+">E+ (after enter)</option>
                <option value="S+">S+ (after start)</option>
              </select>
            </label>
          )}
          <label className="flow-react-field" data-flow-react-field="timing-seconds">
            <span>Timing Seconds</span>
            <input
              type="number"
              min={0}
              step="0.01"
              key={`${action.id}-timing-seconds`}
              defaultValue={String(Number(action.timing?.seconds ?? 0))}
              data-flow-react-timing-seconds
              onBlur={(event) =>
                edit.onSetActionTiming?.({
                  ...(isSubAction ? { mode: "S+" } : {}),
                  seconds: Number(event.target.value)
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
            />
          </label>
        </div>
      ) : null}
      {edit?.onSetActionField ? (
        <ActionFieldControls
          action={action}
          actionTargetOptions={edit.actionTargetOptions || []}
          animationLabelOptions={edit.animationLabelOptions || []}
          componentTargetOptions={edit.componentTargetOptions || []}
          gameObjectTargetOptions={edit.gameObjectTargetOptions || []}
          textTargetOptions={edit.textTargetOptions || []}
          onSetField={edit.onSetActionField}
          onSetFields={edit.onSetActionFields}
        />
      ) : null}
      {action.type === "decision" && edit?.decision?.onAddBranch ? (
        <div className="flow-react-decision-summary" data-flow-react-component="decision-summary">
          <h3>Decision Branches</h3>
          <button
            type="button"
            data-decision-branch-add
            onClick={() => edit.decision?.onAddBranch?.()}
          >
            Add Branch
          </button>
        </div>
      ) : null}
      {edit?.onAddSubAction && !isBranch && !isSubAction && action.type !== "decision" ? (
        <div
          className="flow-react-sub-action-summary"
          data-flow-react-component="sub-action-summary"
        >
          <h3>Sub-actions</h3>
          <button type="button" data-flow-sub-action-add onClick={() => edit.onAddSubAction?.()}>
            Add S+ Sub-action
          </button>
          <span>{(action.subActions || []).length}</span>
        </div>
      ) : null}
      {action.type === "multipleChoiceInput" && edit?.options ? (
        <ActionOptionsControls action={action} handlers={edit.options} />
      ) : null}
    </section>
  );
}
