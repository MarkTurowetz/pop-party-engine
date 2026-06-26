import type { FlowAction, FlowState } from "../../../types/game-data";
import { actionTypeName, type FlowActionTypeMeta } from "../flowSelectors";

export interface ActionInspectorProps {
  action: FlowAction | null;
  actionTypes?: FlowActionTypeMeta[];
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

export function ActionInspector({ action, actionTypes = [], isBranch = false, isSubAction = false, parentAction = null, state }: ActionInspectorProps) {
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
          <dt>Entry</dt>
          <dd>{String(state.entryTargetActionId || "Default")}</dd>
          <dt>Next</dt>
          <dd>{String(state.nextStateTargetId || "Default")}</dd>
        </dl>
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
