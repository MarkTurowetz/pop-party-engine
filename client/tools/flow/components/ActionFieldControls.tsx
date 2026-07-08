import type { FlowAction } from "../../../types/game-data";
import { actionFieldsForType, type FlowActionFieldDescriptor } from "../flowActionFieldSchema";
import { flowGameObjectTargetParts, normalizeFlowTextTargetId } from "../flowSelectors";
import type { InspectorTargetOption } from "./ActionInspector";
import { FlowFreeformFuzzyInput } from "./FlowFreeformFuzzyInput";

export interface ActionFieldControlsProps {
  action: FlowAction;
  actionTargetOptions: InspectorTargetOption[];
  animationLabelOptions?: InspectorTargetOption[];
  componentTargetOptions?: InspectorTargetOption[];
  gameObjectTargetOptions?: InspectorTargetOption[];
  textTargetOptions?: InspectorTargetOption[];
  onSetField: (key: string, value: unknown) => void;
  onSetFields?: (patch: Record<string, unknown>) => void;
}

function rawValue(action: FlowAction, key: string): unknown {
  return (action as Record<string, unknown>)[key];
}

function booleanValue(action: FlowAction, key: string): boolean {
  const value = rawValue(action, key);
  if (value === true) return true;
  if (value === false) return false;
  // isShown-style flags default visible; everything else defaults off (matches legacy).
  return key === "isShown";
}

type SelectOption = { id: string; name: string };

function withDefaultSelectOption(options: SelectOption[], defaultOption: SelectOption): SelectOption[] {
  return options.some((option) => option.id === "") ? options : [defaultOption, ...options];
}

function FieldControl({
  field,
  action,
  actionTargetOptions,
  animationLabelOptions = [],
  componentTargetOptions = [],
  gameObjectTargetOptions = [],
  textTargetOptions = [],
  onSetField,
  onSetFields
}: {
  field: FlowActionFieldDescriptor;
  action: FlowAction;
  actionTargetOptions: InspectorTargetOption[];
  animationLabelOptions?: InspectorTargetOption[];
  componentTargetOptions?: InspectorTargetOption[];
  gameObjectTargetOptions?: InspectorTargetOption[];
  textTargetOptions?: InspectorTargetOption[];
  onSetField: (key: string, value: unknown) => void;
  onSetFields?: (patch: Record<string, unknown>) => void;
}) {
  const fieldKey = `${action.id}:${field.key}`;
  const commitText = (value: string) => onSetField(field.key, value);

  if (field.control === "boolean") {
    return (
      <label className="flow-react-field" data-flow-react-field={field.key}>
        <span>{field.label}</span>
        <select
          value={booleanValue(action, field.key) ? "true" : "false"}
          data-flow-react-field-input={field.key}
          onChange={(event) => onSetField(field.key, event.target.value === "true")}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    );
  }

  if (
    field.control === "select" ||
    field.control === "actionTarget" ||
    field.control === "componentTarget" ||
    field.control === "textTarget" ||
    field.control === "gameObjectTarget"
  ) {
    const options =
      field.control === "actionTarget"
        ? withDefaultSelectOption(
            actionTargetOptions.map((option) => ({ id: option.id, name: option.label })),
            { id: "", name: "Default" }
          )
        : field.control === "componentTarget"
          ? componentTargetOptions.map((option) => ({ id: option.id, name: option.label }))
        : field.control === "gameObjectTarget"
          ? gameObjectTargetOptions.map((option) => ({ id: option.id, name: option.label }))
          : field.control === "textTarget"
            ? withDefaultSelectOption(
                textTargetOptions.map((option) => ({ id: option.id, name: option.label })),
                { id: "", name: "No Text Field" }
              )
            : field.options || [];
    const currentValue = String(rawValue(action, field.key) ?? "");
    const currentTargetScope = String(rawValue(action, "targetLayoutScope") || "moment");
    const selectedValue =
      field.control === "textTarget" && currentValue
        ? options.find(
            (option) =>
              option.id === currentValue ||
              normalizeFlowTextTargetId(option.id) === normalizeFlowTextTargetId(currentValue)
          )?.id || currentValue
        : field.control === "gameObjectTarget" && currentValue
          ? options.find((option) => {
              const parts = flowGameObjectTargetParts(option.id);
              return parts.id === currentValue && (parts.scope || "moment") === currentTargetScope;
            })?.id || `${currentTargetScope}:${currentValue}`
          : currentValue;
    return (
      <label className="flow-react-field" data-flow-react-field={field.key}>
        <span>{field.label}</span>
        <select
          value={selectedValue}
          data-flow-react-field-input={field.key}
          onChange={(event) => {
            if (field.control !== "gameObjectTarget") {
              onSetField(field.key, event.target.value);
              return;
            }
            const parts = flowGameObjectTargetParts(event.target.value);
            if (onSetFields) {
              const patch: Record<string, unknown> = {
                targetLayoutScope: parts.scope || "",
                [field.key]: parts.id
              };
              if (action.type === "playGameObjectAnimation" || action.type === "stopGameObjectAnimation") patch.targetComponentId = "";
              onSetFields(patch);
              return;
            }
            onSetField("targetLayoutScope", parts.scope || "");
            onSetField(field.key, parts.id);
          }}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.control === "animationLabel") {
    return (
      <label className="flow-react-field" data-flow-react-field={field.key}>
        <span>{field.label}</span>
        <FlowFreeformFuzzyInput
          key={fieldKey}
          value={String(rawValue(action, field.key) ?? "")}
          options={animationLabelOptions.map((option) => ({ id: option.id, label: option.label }))}
          placeholder="appear"
          inputDataAttribute={field.key}
          onCommit={commitText}
        />
      </label>
    );
  }

  if (field.control === "textarea") {
    return (
      <label className="flow-react-field" data-flow-react-field={field.key}>
        <span>{field.label}</span>
        <textarea
          key={fieldKey}
          defaultValue={String(rawValue(action, field.key) ?? "")}
          data-flow-react-field-input={field.key}
          onBlur={(event) => commitText(event.target.value)}
        />
      </label>
    );
  }

  const isNumber = field.control === "number" || field.control === "integer";
  return (
    <label className="flow-react-field" data-flow-react-field={field.key}>
      <span>{field.label}</span>
      <input
        type={isNumber ? "number" : "text"}
        key={fieldKey}
        min={field.min}
        max={field.max}
        defaultValue={String(rawValue(action, field.key) ?? (isNumber ? 0 : ""))}
        data-flow-react-field-input={field.key}
        onBlur={(event) => {
          if (!isNumber) return commitText(event.target.value);
          const numeric = Number(event.target.value);
          const safe = Number.isFinite(numeric) ? numeric : 0;
          onSetField(field.key, field.control === "integer" ? Math.floor(safe) : safe);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

/**
 * Renders the scalar/enum/target inspector controls for the action's type, driven
 * by {@link actionFieldsForType}. Each edit commits through `onSetField`, which the
 * controller turns into an undoable command.
 */
export function ActionFieldControls({
  action,
  actionTargetOptions,
  animationLabelOptions = [],
  componentTargetOptions = [],
  gameObjectTargetOptions = [],
  textTargetOptions = [],
  onSetField,
  onSetFields
}: ActionFieldControlsProps) {
  const fields = actionFieldsForType(action.type);
  if (!fields.length) return null;
  return (
    <div className="flow-react-action-fields" data-flow-react-component="action-fields">
      {fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          action={action}
          actionTargetOptions={actionTargetOptions}
          animationLabelOptions={animationLabelOptions}
          componentTargetOptions={componentTargetOptions}
          gameObjectTargetOptions={gameObjectTargetOptions}
          textTargetOptions={textTargetOptions}
          onSetField={onSetField}
          onSetFields={onSetFields}
        />
      ))}
    </div>
  );
}
