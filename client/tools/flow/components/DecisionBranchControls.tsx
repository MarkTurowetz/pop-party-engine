import type { FlowAction } from "../../../types/game-data";
import { decisionBranchName, ensureDecisionBranches, type FlowDecisionBranch } from "../flowDecision";
import type { InspectorTargetOption } from "./ActionInspector";

export interface DecisionBranchHandlers {
  onAddBranch?: () => void;
  onRemoveBranch?: (branchId: string) => void;
  onSetBranchField?: (branchId: string, key: string, value: unknown) => void;
}

export interface DecisionBranchControlsProps {
  action: FlowAction;
  actionTargetOptions: InspectorTargetOption[];
  handlers: DecisionBranchHandlers;
}

function branchTargetOptions(actionTargetOptions: InspectorTargetOption[]) {
  return [{ id: "", label: "Default" }, ...actionTargetOptions];
}

function BranchRow({
  branch,
  index,
  actionTargetOptions,
  handlers
}: {
  branch: FlowDecisionBranch;
  index: number;
  actionTargetOptions: InspectorTargetOption[];
  handlers: DecisionBranchHandlers;
}) {
  const isNoMatch = branch.type === "noMatch";
  return (
    <li className="flow-react-branch" data-decision-branch-id={branch.id} data-branch-type={branch.type}>
      <header>
        <strong>{decisionBranchName(branch, index)}</strong>
        {!isNoMatch ? (
          <button type="button" data-decision-branch-remove onClick={() => handlers.onRemoveBranch?.(branch.id)}>
            Remove
          </button>
        ) : null}
      </header>
      {!isNoMatch ? (
        <label className="flow-react-field" data-flow-react-field="branch-type">
          <span>Branch Type</span>
          <select
            value={branch.type}
            data-decision-branch-type-select
            onChange={(event) => handlers.onSetBranchField?.(branch.id, "type", event.target.value)}
          >
            <option value="hit">Hit Value</option>
            <option value="code">Code Expression</option>
          </select>
        </label>
      ) : null}
      {branch.type === "code" ? (
        <label className="flow-react-field" data-flow-react-field="branch-code">
          <span>Code</span>
          <input
            type="text"
            key={`${branch.id}-code`}
            defaultValue={branch.code || ""}
            data-decision-branch-code-input
            onBlur={(event) => handlers.onSetBranchField?.(branch.id, "code", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
      {branch.type === "hit" ? (
        <label className="flow-react-field" data-flow-react-field="branch-value">
          <span>Value</span>
          <input
            type="text"
            key={`${branch.id}-value`}
            defaultValue={branch.value || ""}
            data-decision-branch-value-input
            onBlur={(event) => handlers.onSetBranchField?.(branch.id, "value", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
      <label className="flow-react-field" data-flow-react-field="branch-target">
        <span>Target</span>
        <select
          value={String(branch.targetActionId || "")}
          data-decision-branch-target-select
          onChange={(event) => handlers.onSetBranchField?.(branch.id, "targetActionId", event.target.value)}
        >
          {branchTargetOptions(actionTargetOptions).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

/**
 * Decision-branch editor. Reads a normalized branch list (the protected `noMatch`
 * branch is always last) and routes add/remove/field edits back through the typed
 * command history. Read-only normalization here never mutates the live action.
 */
export function DecisionBranchControls({ action, actionTargetOptions, handlers }: DecisionBranchControlsProps) {
  // Normalize a copy so rendering never mutates the snapshot's action.
  const branches = ensureDecisionBranches({ ...action, branches: action.branches ? [...action.branches] : undefined });

  return (
    <div className="flow-react-decision" data-flow-react-component="decision-branches">
      <header>
        <h3>Decision Branches</h3>
        <button type="button" data-decision-branch-add onClick={() => handlers.onAddBranch?.()}>
          Add Branch
        </button>
      </header>
      <ol className="flow-react-list">
        {branches.map((branch, index) => (
          <BranchRow
            key={branch.id}
            branch={branch}
            index={index}
            actionTargetOptions={actionTargetOptions}
            handlers={handlers}
          />
        ))}
      </ol>
    </div>
  );
}
