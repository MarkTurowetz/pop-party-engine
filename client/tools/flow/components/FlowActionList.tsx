import type { FlowAction } from "../../../types/game-data";
import { actionTypeName, type FlowActionTypeMeta } from "../flowSelectors";

export interface FlowActionListProps {
  actions: FlowAction[];
  actionTypes?: FlowActionTypeMeta[];
  onSelectAction?: (actionId: string) => void;
  selectedActionId?: string;
}

function actionLabel(action: FlowAction): string {
  return action.name || action.id;
}

function actionTypeLabel(action: FlowAction, actionTypes: FlowActionTypeMeta[]): string {
  return actionTypeName(actionTypes, action.type) || action.type || "action";
}

interface FlowActionItemProps {
  action: FlowAction;
  actionTypes: FlowActionTypeMeta[];
  isSubAction?: boolean;
  onSelectAction?: (actionId: string) => void;
  parentActionId?: string;
  selectedActionId: string;
}

function FlowActionItem({
  action,
  actionTypes,
  isSubAction = false,
  onSelectAction,
  parentActionId = "",
  selectedActionId
}: FlowActionItemProps) {
  const subActions = action.subActions || [];
  return (
    <li
      aria-current={action.id === selectedActionId ? "true" : undefined}
      data-action-id={action.id}
      data-action-type={action.type}
      data-is-sub-action={isSubAction ? "true" : "false"}
      data-parent-action-id={parentActionId}
    >
      <button type="button" onClick={() => onSelectAction?.(action.id)}>
        <span>
          <strong>{isSubAction ? `Sub: ${actionLabel(action)}` : actionLabel(action)}</strong>
          <small>{actionTypeLabel(action, actionTypes)}</small>
        </span>
        <span data-sub-action-count>{subActions.length}</span>
      </button>
      {subActions.length ? (
        <ol className="flow-react-list flow-react-sub-list">
          {subActions.map((subAction) => (
            <FlowActionItem
              action={subAction}
              actionTypes={actionTypes}
              isSubAction={true}
              key={subAction.id}
              onSelectAction={onSelectAction}
              parentActionId={action.id}
              selectedActionId={selectedActionId}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export function FlowActionList({ actions, actionTypes = [], onSelectAction, selectedActionId = "" }: FlowActionListProps) {
  return (
    <section className="flow-react-panel">
      <h3>Actions</h3>
      <ol className="flow-react-list" data-flow-react-component="action-list">
        {actions.map((action) => (
          <FlowActionItem
            action={action}
            actionTypes={actionTypes}
            key={action.id}
            onSelectAction={onSelectAction}
            selectedActionId={selectedActionId}
          />
        ))}
      </ol>
    </section>
  );
}
