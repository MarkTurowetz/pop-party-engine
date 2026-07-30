import type {
  FlowAction,
  FlowSubroutineInput,
  FlowSubroutineOutput,
  FlowSubroutineValueType
} from "../../../types/game-data";
import {
  createSubroutineInput,
  createSubroutineOutput,
  renameSubroutineInterfaceItem,
  subroutineValueTypes
} from "../flowSubroutineInterface";

export interface SubroutineInterfaceControlsProps {
  action: FlowAction;
  onSetField: (key: string, value: unknown) => void;
}

function ValueTypeSelect({
  value,
  onChange
}: {
  value: FlowSubroutineValueType;
  onChange: (value: FlowSubroutineValueType) => void;
}) {
  return (
    <select
      value={value || "string"}
      aria-label="Value type"
      onChange={(event) => onChange(event.target.value as FlowSubroutineValueType)}
    >
      {subroutineValueTypes.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  );
}

function replaceAt<T>(values: ReadonlyArray<T>, index: number, patch: Partial<T>): T[] {
  return values.map((value, itemIndex) => itemIndex === index ? { ...value, ...patch } : { ...value });
}

export function SubroutineInterfaceControls({
  action,
  onSetField
}: SubroutineInterfaceControlsProps) {
  const inputs = Array.isArray(action.inputs) ? action.inputs : [];
  const outputs = Array.isArray(action.outputs) ? action.outputs : [];

  function setInputs(values: FlowSubroutineInput[]) {
    onSetField("inputs", values);
  }

  function setOutputs(values: FlowSubroutineOutput[]) {
    onSetField("outputs", values);
  }

  return (
    <section
      className="flow-subroutine-interface"
      data-flow-react-component="subroutine-interface"
    >
      <header>
        <div>
          <h3>Inputs</h3>
          <p>Caller expressions are copied into this subroutine&apos;s local <code>l</code> scope.</p>
        </div>
        <button
          type="button"
          data-subroutine-input-add
          onClick={() => setInputs([...inputs, createSubroutineInput(inputs)])}
        >
          Add Input
        </button>
      </header>
      <div className="flow-subroutine-interface-list" data-subroutine-input-list>
        {inputs.length ? inputs.map((input, index) => (
          <div className="flow-subroutine-interface-row" key={`input-${index}-${input.name}`}>
            <label>
              <span>Local name</span>
              <input
                type="text"
                defaultValue={input.name}
                aria-label={`Input ${index + 1} local name`}
                onBlur={(event) => setInputs(renameSubroutineInterfaceItem(inputs, index, event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <label>
              <span>Type</span>
              <ValueTypeSelect
                value={input.valueType}
                onChange={(value) => setInputs(replaceAt(inputs, index, { valueType: value }))}
              />
            </label>
            <label className="flow-subroutine-interface-expression">
              <span>Caller value</span>
              <input
                type="text"
                defaultValue={input.source}
                placeholder="g.currentPlayerId or l.currentPlayerId"
                aria-label={`Input ${index + 1} caller value`}
                onBlur={(event) => setInputs(replaceAt(inputs, index, { source: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <button
              type="button"
              className="flow-subroutine-interface-remove"
              aria-label={`Remove input ${input.name}`}
              onClick={() => setInputs(inputs.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
          </div>
        )) : <p className="flow-subroutine-interface-empty">No inputs declared.</p>}
      </div>

      <header>
        <div>
          <h3>Outputs</h3>
          <p>Child values return into an explicit <code>l.*</code> or <code>g.*</code> caller target.</p>
        </div>
        <button
          type="button"
          data-subroutine-output-add
          onClick={() => setOutputs([...outputs, createSubroutineOutput(outputs)])}
        >
          Add Output
        </button>
      </header>
      <div className="flow-subroutine-interface-list" data-subroutine-output-list>
        {outputs.length ? outputs.map((output, index) => (
          <div className="flow-subroutine-interface-row is-output" key={`output-${index}-${output.name}`}>
            <label>
              <span>Output name</span>
              <input
                type="text"
                defaultValue={output.name}
                aria-label={`Output ${index + 1} name`}
                onBlur={(event) => setOutputs(renameSubroutineInterfaceItem(outputs, index, event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <label>
              <span>Type</span>
              <ValueTypeSelect
                value={output.valueType}
                onChange={(value) => setOutputs(replaceAt(outputs, index, { valueType: value }))}
              />
            </label>
            <label className="flow-subroutine-interface-expression">
              <span>Child value</span>
              <input
                type="text"
                defaultValue={output.source}
                placeholder={`l.${output.name}`}
                aria-label={`Output ${index + 1} child value`}
                onBlur={(event) => setOutputs(replaceAt(outputs, index, { source: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <label className="flow-subroutine-interface-expression">
              <span>Caller target</span>
              <input
                type="text"
                defaultValue={output.target}
                placeholder={`l.${output.name} or g.${output.name}`}
                aria-label={`Output ${index + 1} caller target`}
                onBlur={(event) => setOutputs(replaceAt(outputs, index, { target: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <button
              type="button"
              className="flow-subroutine-interface-remove"
              aria-label={`Remove output ${output.name}`}
              onClick={() => setOutputs(outputs.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
          </div>
        )) : <p className="flow-subroutine-interface-empty">No outputs declared.</p>}
      </div>
    </section>
  );
}
