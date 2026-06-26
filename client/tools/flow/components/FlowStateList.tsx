import type { FlowState } from "../../../types/game-data";

export interface FlowStateListProps {
  onSelectState?: (stateId: string) => void;
  selectedStateId?: string;
  states: FlowState[];
}

export function FlowStateList({ onSelectState, selectedStateId = "", states }: FlowStateListProps) {
  return (
    <section className="flow-react-panel">
      <h3>States</h3>
      <ol className="flow-react-list" data-flow-react-component="state-list">
      {states.map((state) => (
        <li
          aria-current={state.id === selectedStateId ? "true" : undefined}
          data-state-id={state.id}
          key={state.id}
        >
          <button type="button" onClick={() => onSelectState?.(state.id)}>
            <span>{state.name || state.id}</span>
            <span data-action-count>{state.actions?.length || 0}</span>
          </button>
        </li>
      ))}
      </ol>
    </section>
  );
}
