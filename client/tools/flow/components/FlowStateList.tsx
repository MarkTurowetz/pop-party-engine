import type { FlowState } from "../../../types/game-data";

const STATE_DND_TYPE = "application/x-flow-state";

export interface FlowStateListProps {
  chrome?: boolean;
  onSelectState?: (stateId: string) => void;
  onReorderState?: (draggedStateId: string, targetStateId: string) => void;
  selectedStateId?: string;
  states: FlowState[];
}

export function FlowStateList({
  chrome = true,
  onSelectState,
  onReorderState,
  selectedStateId = "",
  states
}: FlowStateListProps) {
  const draggable = Boolean(onReorderState);
  const contents = (
    <>
      <h3>Subroutines</h3>
      <ol className={chrome ? "flow-react-list" : "tool-sidebar-list"} data-flow-react-component="state-list">
      {states.map((state) => (
        <li
          aria-current={state.id === selectedStateId ? "true" : undefined}
          data-state-id={state.id}
          draggable={draggable}
          key={state.id}
          onDragStart={draggable ? (event) => event.dataTransfer.setData(STATE_DND_TYPE, state.id) : undefined}
          onDragOver={draggable ? (event) => event.preventDefault() : undefined}
          onDrop={
            draggable
              ? (event) => {
                  event.preventDefault();
                  const draggedId = event.dataTransfer.getData(STATE_DND_TYPE);
                  if (draggedId && draggedId !== state.id) onReorderState?.(draggedId, state.id);
                }
              : undefined
          }
        >
          <button type="button" onClick={() => onSelectState?.(state.id)}>
            <span>{state.name || state.id}</span>
            <span data-action-count>{state.actions?.length || 0}</span>
          </button>
        </li>
      ))}
      </ol>
    </>
  );
  return chrome ? <section className="flow-react-panel">{contents}</section> : contents;
}
