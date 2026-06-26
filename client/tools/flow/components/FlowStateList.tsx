import type { FlowState } from "../../../types/game-data";

export interface FlowStateListProps {
  selectedStateId?: string;
  states: FlowState[];
}

export function FlowStateList({ selectedStateId = "", states }: FlowStateListProps) {
  return (
    <ol data-flow-react-component="state-list">
      {states.map((state) => (
        <li
          aria-current={state.id === selectedStateId ? "true" : undefined}
          data-state-id={state.id}
          key={state.id}
        >
          <span>{state.name || state.id}</span>
          <span data-action-count>{state.actions?.length || 0}</span>
        </li>
      ))}
    </ol>
  );
}
