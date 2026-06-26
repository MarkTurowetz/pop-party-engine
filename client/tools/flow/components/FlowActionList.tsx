import type { FlowAction } from "../../../types/game-data";

export interface FlowActionListProps {
  actions: FlowAction[];
  onSelectAction?: (actionId: string) => void;
  selectedActionId?: string;
}

function actionLabel(action: FlowAction): string {
  return action.name || action.id;
}

export function FlowActionList({ actions, onSelectAction, selectedActionId = "" }: FlowActionListProps) {
  return (
    <section className="flow-react-panel">
      <h3>Actions</h3>
      <ol className="flow-react-list" data-flow-react-component="action-list">
      {actions.map((action) => (
        <li
          aria-current={action.id === selectedActionId ? "true" : undefined}
          data-action-id={action.id}
          data-action-type={action.type}
          key={action.id}
        >
          <button type="button" onClick={() => onSelectAction?.(action.id)}>
            <span>{actionLabel(action)}</span>
            <span data-sub-action-count>{action.subActions?.length || 0}</span>
          </button>
        </li>
      ))}
      </ol>
    </section>
  );
}
