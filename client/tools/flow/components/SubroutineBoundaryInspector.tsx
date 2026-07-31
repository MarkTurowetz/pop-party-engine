import type {
  FlowSubroutineInput,
  FlowSubroutineOutput
} from "../../../types/game-data";
import {
  subroutineValueTypes
} from "../flowSubroutineInterface";
import type { FlowSubroutine } from "../flowSubroutines";

export interface SubroutineBoundaryInspectorProps {
  boundary: "start" | "return";
  onSetOutputs?: (outputs: FlowSubroutineOutput[]) => void;
  subroutine: FlowSubroutine;
}

function valueTypeName(valueType: string): string {
  return subroutineValueTypes.find((option) => option.id === valueType)?.name || "String";
}

function ReadonlyField({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="text" value={value} readOnly />
    </label>
  );
}

function StartInputs({ inputs }: { inputs: FlowSubroutineInput[] }) {
  return (
    <>
      <p>
        These caller values are available inside this subroutine under the listed
        local <code>l</code> names.
      </p>
      <div className="flow-subroutine-interface-list" data-subroutine-start-input-list>
        {inputs.length ? inputs.map((input, index) => (
          <div
            className="flow-subroutine-interface-row"
            key={`start-input-${index}-${input.name}`}
          >
            <ReadonlyField label="Local name" value={`l.${input.name}`} />
            <ReadonlyField label="Type" value={valueTypeName(input.valueType)} />
            <ReadonlyField label="Caller value" value={String(input.source || "Not set")} />
          </div>
        )) : (
          <p className="flow-subroutine-interface-empty">No inputs enter this subroutine.</p>
        )}
      </div>
    </>
  );
}

function EndOutputs({
  outputs,
  onSetOutputs
}: {
  outputs: FlowSubroutineOutput[];
  onSetOutputs?: (outputs: FlowSubroutineOutput[]) => void;
}) {
  const replaceOutput = (index: number, value: string) => {
    onSetOutputs?.(outputs.map((output, outputIndex) => (
      outputIndex === index ? { ...output, value } : { ...output }
    )));
  };

  return (
    <>
      <p>
        Set each returned value from this child&apos;s local <code>l</code> scope.
        It will become the same named <code>l</code> value in the parent.
      </p>
      <div className="flow-subroutine-interface-list" data-subroutine-end-output-list>
        {outputs.length ? outputs.map((output, index) => (
          <div
            className="flow-subroutine-interface-row"
            key={`end-output-${index}-${output.name}`}
          >
            <ReadonlyField label="Parent output" value={`l.${output.name}`} />
            <ReadonlyField label="Type" value={valueTypeName(output.valueType)} />
            <label className="flow-subroutine-interface-expression">
              <span>Child value</span>
              <input
                type="text"
                key={`${output.name}:${String(output.value || "")}`}
                defaultValue={String(output.value || "")}
                placeholder={`l.${output.name}`}
                aria-label={`Output ${index + 1} child value`}
                readOnly={!onSetOutputs}
                onBlur={(event) => replaceOutput(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
          </div>
        )) : (
          <p className="flow-subroutine-interface-empty">No outputs leave this subroutine.</p>
        )}
      </div>
    </>
  );
}

export function SubroutineBoundaryInspector({
  boundary,
  onSetOutputs,
  subroutine
}: SubroutineBoundaryInspectorProps) {
  const inputs = Array.isArray(subroutine.inputs) ? subroutine.inputs : [];
  const outputs = Array.isArray(subroutine.outputs) ? subroutine.outputs : [];
  const isStart = boundary === "start";

  return (
    <section
      className="flow-react-panel flow-react-inspector flow-action-inspector"
      data-flow-react-component="subroutine-boundary-inspector"
      data-subroutine-boundary={boundary}
      data-state-id={subroutine.id}
    >
      <header className="flow-inspector-header">
        <div>
          <span className="flow-inspector-kicker">Subroutine</span>
          <h2>{isStart ? "Start" : "End"}</h2>
        </div>
        <span className="flow-inspector-tag" title={String(subroutine.id)}>
          {subroutine.name || subroutine.id}
        </span>
      </header>
      <section className="flow-subroutine-interface">
        <header>
          <div>
            <h3>{isStart ? "Inputs" : "Outputs"}</h3>
          </div>
        </header>
        {isStart ? (
          <StartInputs inputs={inputs} />
        ) : (
          <EndOutputs outputs={outputs} onSetOutputs={onSetOutputs} />
        )}
      </section>
    </section>
  );
}
