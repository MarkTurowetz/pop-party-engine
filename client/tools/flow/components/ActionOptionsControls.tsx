import type { FlowAction } from "../../../types/game-data";

export interface ActionOptionsHandlers {
  onAddOption?: () => void;
  onRemoveOption?: (index: number) => void;
  onSetOption?: (index: number, value: string) => void;
}

export interface ActionOptionsControlsProps {
  action: FlowAction;
  handlers: ActionOptionsHandlers;
}

function readOptions(action: FlowAction): string[] {
  const value = (action as Record<string, unknown>).options;
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

/**
 * Editor for an action's `options` string array (multiple-choice / trivia answers).
 * Adds/removes/edits entries through the typed command history.
 */
export function ActionOptionsControls({ action, handlers }: ActionOptionsControlsProps) {
  const options = readOptions(action);
  return (
    <div className="flow-react-action-options" data-flow-react-component="action-options">
      <header>
        <h3>Options</h3>
        <button type="button" data-action-option-add onClick={() => handlers.onAddOption?.()}>
          Add Option
        </button>
      </header>
      <ol className="flow-react-list">
        {options.map((option, index) => (
          <li className="flow-react-option" data-option-index={index} key={`${action.id}-option-${index}`}>
            <input
              type="text"
              defaultValue={option}
              data-action-option-input={index}
              onBlur={(event) => handlers.onSetOption?.(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
            />
            <button type="button" data-action-option-remove={index} onClick={() => handlers.onRemoveOption?.(index)}>
              Remove
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
