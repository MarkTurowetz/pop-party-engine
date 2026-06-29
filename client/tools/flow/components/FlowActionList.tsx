import type { DragEvent } from "react";
import type { FlowAction } from "../../../types/game-data";
import { actionTypeName, type FlowActionTypeMeta } from "../flowSelectors";

const ACTION_DND_TYPE = "application/x-flow-action-dnd";

export interface FlowActionReorderHandlers {
  onReorderAction?: (draggedActionId: string, targetActionId: string) => void;
  onReorderSubAction?: (parentActionId: string, draggedActionId: string, targetActionId: string) => void;
}

export interface FlowActionListProps extends FlowActionReorderHandlers {
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

interface DragPayload {
  actionId: string;
  parentActionId: string;
}

interface FlowActionItemProps {
  action: FlowAction;
  actionTypes: FlowActionTypeMeta[];
  isSubAction?: boolean;
  onSelectAction?: (actionId: string) => void;
  parentActionId?: string;
  reorder: FlowActionReorderHandlers;
  selectedActionId: string;
}

function FlowActionItem({
  action,
  actionTypes,
  isSubAction = false,
  onSelectAction,
  parentActionId = "",
  reorder,
  selectedActionId
}: FlowActionItemProps) {
  const subActions = action.subActions || [];
  const draggable = Boolean(reorder.onReorderAction || reorder.onReorderSubAction);

  const handleDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData(ACTION_DND_TYPE);
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }
    if (payload.actionId === action.id) return;
    // Only reorder within the same level (same parent).
    if (payload.parentActionId !== parentActionId) return;
    if (parentActionId) reorder.onReorderSubAction?.(parentActionId, payload.actionId, action.id);
    else reorder.onReorderAction?.(payload.actionId, action.id);
  };

  return (
    <li
      aria-current={action.id === selectedActionId ? "true" : undefined}
      data-action-id={action.id}
      data-action-type={action.type}
      data-is-sub-action={isSubAction ? "true" : "false"}
      data-parent-action-id={parentActionId}
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              event.stopPropagation();
              event.dataTransfer.setData(ACTION_DND_TYPE, JSON.stringify({ actionId: action.id, parentActionId }));
            }
          : undefined
      }
      onDragOver={draggable ? (event) => event.preventDefault() : undefined}
      onDrop={draggable ? handleDrop : undefined}
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
              reorder={reorder}
              selectedActionId={selectedActionId}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export function FlowActionList({
  actions,
  actionTypes = [],
  onSelectAction,
  onReorderAction,
  onReorderSubAction,
  selectedActionId = ""
}: FlowActionListProps) {
  const reorder: FlowActionReorderHandlers = { onReorderAction, onReorderSubAction };
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
            reorder={reorder}
            selectedActionId={selectedActionId}
          />
        ))}
      </ol>
    </section>
  );
}
