import type { FlowAction } from "../../../types/game-data";

export interface FlowActionListProps {
  actions: FlowAction[];
  onSelectAction?: (actionId: string) => void;
  selectedActionId?: string;
}

function actionLabel(action: FlowAction): string {
  return action.name || action.id;
}

interface FlowActionItemProps {
  action: FlowAction;
  isSubAction?: boolean;
  onSelectAction?: (actionId: string) => void;
  parentActionId?: string;
  selectedActionId: string;
}

function FlowActionItem({
  action,
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
        <span>{isSubAction ? `Sub: ${actionLabel(action)}` : actionLabel(action)}</span>
        <span data-sub-action-count>{subActions.length}</span>
      </button>
      {subActions.length ? (
        <ol className="flow-react-list flow-react-sub-list">
          {subActions.map((subAction) => (
            <FlowActionItem
              action={subAction}
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

export function FlowActionList({ actions, onSelectAction, selectedActionId = "" }: FlowActionListProps) {
  return (
    <section className="flow-react-panel">
      <h3>Actions</h3>
      <ol className="flow-react-list" data-flow-react-component="action-list">
        {actions.map((action) => (
          <FlowActionItem
            action={action}
            key={action.id}
            onSelectAction={onSelectAction}
            selectedActionId={selectedActionId}
          />
        ))}
      </ol>
    </section>
  );
}
