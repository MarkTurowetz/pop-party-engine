import { useState } from "react";
import { ToolSaveError } from "../common/ToolSaveError";
import { ToolWorkspace } from "../common/ToolWorkspace";
import type { ConstantsController } from "./constantsController";
import { CUSTOM_CONSTANT_TYPES, type CustomConstant, type NormalizedGameConstants } from "./constantsModel";
import { useConstantsEditor } from "./useConstantsEditor";

export interface ConstantsEditorProps {
  controller: ConstantsController;
  surface?: string;
}

interface BuiltInField {
  key: keyof NormalizedGameConstants;
  label: string;
  control: "text" | "int" | "float" | "bool";
}

const BUILT_IN_FIELDS: BuiltInField[] = [
  { key: "gameTitle", label: "Game Title", control: "text" },
  { key: "numberOfRounds", label: "Number of Rounds", control: "int" },
  { key: "craftingTimerDuration", label: "Crafting Timer Duration", control: "int" },
  { key: "startGameCountdownDuration", label: "Start Countdown Duration", control: "int" },
  { key: "pointsForCorrectAnswer", label: "Points for Correct Answer", control: "int" },
  { key: "randomChanceTest", label: "Random Chance Test", control: "float" },
  { key: "speechToTextSendInputBuffer", label: "Speech Input Buffer", control: "float" },
  { key: "overrideFirstGameOfSession", label: "Override First Game", control: "bool" }
];

const CONSTANT_SECTIONS = [
  { id: "built-in", label: "Game Constants" },
  { id: "player-colors", label: "Player Colors" },
  { id: "custom-constants", label: "Custom Constants" }
] as const;

type ConstantsSectionId = (typeof CONSTANT_SECTIONS)[number]["id"];

function listValueToText(value: unknown): string {
  return Array.isArray(value) ? value.join("\n") : String(value ?? "");
}

/**
 * Writable, React-only constants editor. Mirrors a {@link ConstantsController}
 * snapshot and routes every edit back through it (typed normalization + save),
 * with no window.PartyGame* bridge.
 */
export function ConstantsEditor({ controller, surface = "constants" }: ConstantsEditorProps) {
  const { constants, dirty, saving, canUndo, canRedo, error } =
    useConstantsEditor(controller);
  const [sectionId, setSectionId] = useState<ConstantsSectionId>("built-in");

  const customValueControl = (constant: CustomConstant, index: number) => {
    const commit = (value: unknown) => controller.updateCustomConstant(index, { value: value as CustomConstant["value"] });
    if (constant.type === "bool") {
      return (
        <select
          value={constant.value === true ? "true" : "false"}
          data-custom-value-input={index}
          onChange={(event) => commit(event.target.value === "true")}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }
    if (constant.type === "list") {
      return (
        <textarea
          key={`${constant.id}-list`}
          defaultValue={listValueToText(constant.value)}
          data-custom-value-input={index}
          onBlur={(event) => commit(event.target.value)}
        />
      );
    }
    const isNumber = constant.type === "int" || constant.type === "float";
    return (
      <input
        type={isNumber ? "number" : "text"}
        key={`${constant.id}-${constant.type}`}
        defaultValue={String(constant.value ?? "")}
        data-custom-value-input={index}
        onBlur={(event) => commit(isNumber ? Number(event.target.value) : event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
    );
  };

  const toolbar = (
    <>
      <button type="button" disabled={!canUndo} onClick={() => controller.undo()}>
        Undo
      </button>
      <button type="button" disabled={!canRedo} onClick={() => controller.redo()}>
        Redo
      </button>
      <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" disabled={!dirty} onClick={() => controller.revert()}>
        Revert
      </button>
      <span data-constants-editor-status>{dirty ? "Unsaved changes" : "Saved"}</span>
    </>
  );

  const sidebar = (
    <>
      <h3>Constants</h3>
      <ol className="tool-sidebar-list" data-constants-react-component="section-list">
        {CONSTANT_SECTIONS.map((section) => (
          <li data-constants-section-id={section.id} key={section.id}>
            <button
              type="button"
              aria-current={section.id === sectionId ? "true" : undefined}
              onClick={() => setSectionId(section.id)}
            >
              <span>
                <strong>{section.label}</strong>
                <small>{section.id}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );

  return (
    <ToolWorkspace
      className="constants-workspace"
      dataAttributes={{
        "constants-react-shell": "react",
        "surface": surface,
        "constants-editor-dirty": dirty ? "true" : "false"
      }}
      header={<h2>{CONSTANT_SECTIONS.find((section) => section.id === sectionId)?.label || "Constants"}</h2>}
      sidebar={sidebar}
      sidebarLabel="Constant sections"
      storageKey="partyTemplate.constantsSidebarWidth"
      title="Game Constants"
      toolbar={toolbar}
      toolId="constants"
      history={{
        id: "constants",
        canUndo,
        canRedo,
        onUndo: () => controller.undo(),
        onRedo: () => controller.redo()
      }}
    >
      <ToolSaveError error={error} source="constants" />
      {sectionId === "built-in" ? (
        <section className="flow-react-panel" data-constants-react-component="built-in">
        <h3>Game Constants</h3>
        {BUILT_IN_FIELDS.map((field) => {
          const value = constants[field.key];
          if (field.control === "bool") {
            return (
              <label className="flow-react-field" data-constants-field={field.key} key={field.key}>
                <span>{field.label}</span>
                <select
                  value={value === true ? "true" : "false"}
                  data-constants-field-input={field.key}
                  onChange={(event) => controller.setConstant(field.key, event.target.value === "true")}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </label>
            );
          }
          const isNumber = field.control === "int" || field.control === "float";
          return (
            <label className="flow-react-field" data-constants-field={field.key} key={field.key}>
              <span>{field.label}</span>
              <input
                type={isNumber ? "number" : "text"}
                key={`${field.key}-input`}
                step={field.control === "float" ? "0.0001" : undefined}
                defaultValue={String(value ?? "")}
                data-constants-field-input={field.key}
                onBlur={(event) =>
                  controller.setConstant(field.key, isNumber ? Number(event.target.value) : event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
              />
            </label>
          );
        })}
        </section>
      ) : null}

      {sectionId === "player-colors" ? (
        <section className="flow-react-panel" data-constants-react-component="player-colors">
        <header>
          <h3>Player Colors</h3>
          <button type="button" data-add-player-color onClick={() => controller.addPlayerColor()}>
            Add Color
          </button>
        </header>
        <ol className="flow-react-list">
          {constants.playerColors.map((color, index) => (
            <li className="flow-react-color" data-player-color-index={index} key={index}>
              <input
                type="color"
                value={color}
                data-player-color-input={index}
                onChange={(event) => controller.setPlayerColor(index, event.target.value)}
              />
              <button type="button" data-remove-player-color={index} onClick={() => controller.removePlayerColor(index)}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        </section>
      ) : null}

      {sectionId === "custom-constants" ? (
        <section className="flow-react-panel" data-constants-react-component="custom-constants">
        <header>
          <h3>Custom Constants</h3>
          <button type="button" data-add-custom-constant onClick={() => controller.addCustomConstant()}>
            Add Custom Constant
          </button>
        </header>
        <ol className="flow-react-list">
          {constants.customConstants.map((constant, index) => (
            <li className="flow-react-custom" data-custom-constant-id={constant.id} key={index}>
              <label className="flow-react-field" data-custom-field="name">
                <span>Name</span>
                <input
                  type="text"
                  key={`${constant.id}-name`}
                  defaultValue={constant.name}
                  data-custom-name-input={index}
                  onBlur={(event) => controller.updateCustomConstant(index, { name: event.target.value })}
                />
              </label>
              <label className="flow-react-field" data-custom-field="type">
                <span>Type</span>
                <select
                  value={constant.type}
                  data-custom-type-input={index}
                  onChange={(event) => controller.updateCustomConstant(index, { type: event.target.value as CustomConstant["type"] })}
                >
                  {CUSTOM_CONSTANT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flow-react-field" data-custom-field="value">
                <span>Value</span>
                {customValueControl(constant, index)}
              </label>
              <button type="button" data-remove-custom-constant={index} onClick={() => controller.removeCustomConstant(index)}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        </section>
      ) : null}
    </ToolWorkspace>
  );
}
