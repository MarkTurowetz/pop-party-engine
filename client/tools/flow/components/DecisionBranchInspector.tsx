import type { FlowAction } from "../../../types/game-data";
import { decisionBranchName } from "../flowDecision";
import type { InspectorTargetOption } from "./ActionInspector";
import type { DecisionBranchHandlers } from "./DecisionBranchControls";

export interface DecisionBranchInspectorProps {
  action: FlowAction;
  actionTargetOptions: InspectorTargetOption[];
  handlers?: DecisionBranchHandlers;
  parentAction?: FlowAction | null;
  stateId?: string;
}

function targetOptions(actionTargetOptions: InspectorTargetOption[]) {
  return [{ id: "", label: "Default" }, ...actionTargetOptions];
}

export function DecisionBranchInspector({
  action,
  actionTargetOptions,
  handlers,
  parentAction = null,
  stateId = ""
}: DecisionBranchInspectorProps) {
  const isNoMatch = action.type === "noMatch";
  const target = String(action.targetActionId || action.targetNodeId || "");
  return (
    <section
      className="flow-react-panel flow-react-inspector flow-branch-inspector"
      data-action-id={action.id}
      data-action-type={action.type}
      data-flow-react-component="decision-branch-inspector"
      data-is-branch="true"
      data-parent-action-id={parentAction?.id || ""}
      data-state-id={stateId}
    >
      <header className="flow-inspector-header">
        <div>
          <span className="flow-inspector-kicker">Decision Branch</span>
          <h2>{decisionBranchName(action)}</h2>
        </div>
        <span className="flow-inspector-tag" title={action.id}>
          {action.id}
        </span>
      </header>
      {!isNoMatch ? (
        <label className="flow-react-field" data-flow-react-field="branch-type">
          <span>Branch Type</span>
          <select
            value={action.type}
            data-decision-branch-type-select
            onChange={(event) => handlers?.onSetBranchField?.(action.id, "type", event.target.value)}
          >
            <option value="hit">Hit Value</option>
            <option value="code">Code Expression</option>
          </select>
        </label>
      ) : (
        <label className="flow-react-field" data-flow-react-field="branch-type">
          <span>Branch Type</span>
          <input type="text" value="No Match" readOnly />
        </label>
      )}
      {action.type === "hit" ? (
        <label className="flow-react-field" data-flow-react-field="branch-value">
          <span>Value</span>
          <input
            type="text"
            key={`${action.id}-value`}
            defaultValue={String(action.value || "")}
            data-decision-branch-value-input
            onBlur={(event) => handlers?.onSetBranchField?.(action.id, "value", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
      {action.type === "code" ? (
        <label className="flow-react-field" data-flow-react-field="branch-code">
          <span>Code</span>
          <input
            type="text"
            key={`${action.id}-code`}
            defaultValue={String(action.code || "")}
            data-decision-branch-code-input
            onBlur={(event) => handlers?.onSetBranchField?.(action.id, "code", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
      <label className="flow-react-field" data-flow-react-field="branch-target">
        <span>Target</span>
        <select
          value={target}
          data-decision-branch-target-select
          onChange={(event) =>
            handlers?.onSetBranchField?.(action.id, "targetActionId", event.target.value)
          }
        >
          {targetOptions(actionTargetOptions).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {!isNoMatch ? (
        <button
          type="button"
          className="danger-button"
          data-decision-branch-remove
          onClick={() => handlers?.onRemoveBranch?.(action.id)}
        >
          Remove Branch
        </button>
      ) : null}
    </section>
  );
}
