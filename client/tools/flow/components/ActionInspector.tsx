import type { FlowAction, FlowState } from "../../../types/game-data";

export interface ActionInspectorProps {
  action: FlowAction | null;
  isBranch?: boolean;
  isSubAction?: boolean;
  parentAction?: FlowAction | null;
  state: FlowState | null;
}

export function ActionInspector({ action, isBranch = false, isSubAction = false, parentAction = null, state }: ActionInspectorProps) {
  if (!action || !state) {
    return (
      <section data-flow-react-component="action-inspector" data-empty="true">
        No action selected
      </section>
    );
  }

  return (
    <section
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
        <dt>Type</dt>
        <dd>{action.type}</dd>
        <dt>State</dt>
        <dd>{state.name || state.id}</dd>
      </dl>
    </section>
  );
}
