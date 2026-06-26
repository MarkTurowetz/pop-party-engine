import type { FlowAction } from "../../../types/game-data";

export interface FlowActionListProps {
  actions: FlowAction[];
  selectedActionId?: string;
}

function actionLabel(action: FlowAction): string {
  return action.name || action.id;
}

export function FlowActionList({ actions, selectedActionId = "" }: FlowActionListProps) {
  return (
    <ol data-flow-react-component="action-list">
      {actions.map((action) => (
        <li
          aria-current={action.id === selectedActionId ? "true" : undefined}
          data-action-id={action.id}
          data-action-type={action.type}
          key={action.id}
        >
          <span>{actionLabel(action)}</span>
          <span data-sub-action-count>{action.subActions?.length || 0}</span>
        </li>
      ))}
    </ol>
  );
}
