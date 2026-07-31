type Dict = Record<string, unknown>;

type InputBinding = {
  id: string;
  kind: "choice" | "integer" | "submit" | "text";
  layoutElementId: string;
  field?: string;
  optionIndex?: number;
  source?: string;
  labelSource?: string;
  targetComponentId?: string;
  autoSubmit?: boolean;
};

type InputManifest = {
  id: string;
  submission: Array<{ id: string; type: "choice" | "integer"; min?: number; max?: number; optionsSource?: string }>;
  controller: { bindings: InputBinding[] };
};

function propertyPathValue(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of String(path || "").split(".").filter(Boolean)) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Dict)[segment];
  }
  return current;
}

function manifests(): InputManifest[] {
  const node = document.getElementById("pop-party-runtime-config");
  try {
    return (JSON.parse(node?.textContent || "{}")?.gamePlugin?.inputs || []) as InputManifest[];
  } catch {
    return [];
  }
}

function submissionId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createGamePluginInputView(options: {
  applyLayoutForPhase: (
    phase: string,
    prepare?: () => void,
    options?: { preferRequestedState?: boolean }
  ) => void;
  hideViews: () => void;
  renderState: (lobby: Dict) => void;
  showView: (viewId: string) => unknown;
  submit: (actionId: string, visitId: number, payload: Dict, submissionId: string) => Promise<unknown>;
}) {
  const values = new Map<string, unknown>();
  const submitHandlers = new WeakMap<HTMLElement, () => void>();
  let visitKey = "";

  function runtime(): Dict {
    return globalThis as typeof globalThis & Dict;
  }

  function targetFor(layoutElementId: string): { element: Dict; host: HTMLElement } | null {
    const rt = runtime();
    const element = (rt.controllerLayoutElementForId as ((id: string) => Dict | null))?.(layoutElementId);
    if (!element) return null;
    const host = (rt.controllerLayoutTargetElement as ((item: Dict) => HTMLElement | null))?.(element);
    return host ? { element, host } : null;
  }

  function renderText(binding: InputBinding, model: unknown): void {
    const target = targetFor(binding.layoutElementId);
    if (!target || !binding.targetComponentId) return;
    const rt = runtime();
    const key = String(target.host.dataset.controllerLayoutVisibilityKey || binding.layoutElementId);
    (rt.renderControllerArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown))?.(
      target.element,
      target.host,
      key,
      {
        textOverrides: { [binding.targetComponentId]: String(propertyPathValue(model, binding.source || "") ?? "") },
        keepElements: Array.from(target.host.querySelectorAll<HTMLElement>(":scope > [data-game-plugin-input-binding]"))
      }
    );
  }

  function integerInitialValue(binding: InputBinding, definition: Dict | undefined, model: unknown): number {
    const fieldId = String(binding.field || "");
    const fieldModel = propertyPathValue(model, fieldId);
    const candidates = [
      binding.source ? propertyPathValue(model, binding.source) : undefined,
      fieldModel && typeof fieldModel === "object" ? (fieldModel as Dict).initial : undefined,
      fieldModel && typeof fieldModel === "object" ? (fieldModel as Dict).value : undefined,
      typeof fieldModel === "number" || typeof fieldModel === "string" ? fieldModel : undefined,
      definition?.min
    ];
    const min = Number(definition?.min);
    const max = Number(definition?.max);
    const candidate = candidates.map(Number).find(Number.isFinite);
    const integer = Math.round(candidate ?? (Number.isFinite(min) ? min : 0));
    return Math.min(Number.isFinite(max) ? max : integer, Math.max(Number.isFinite(min) ? min : integer, integer));
  }

  function setChoiceSelected(button: HTMLButtonElement, selected: boolean): void {
    const next = selected ? "true" : "false";
    button.setAttribute("aria-pressed", next);
    button.classList.toggle("is-selected", selected);
    button.dataset.gamePluginInputSelected = next;
    const host = button.parentElement as HTMLElement | null;
    if (host) {
      const hostSelected = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-game-plugin-input-option]"))
        .some((control) => control.getAttribute("aria-pressed") === "true");
      const hostState = hostSelected ? "true" : "false";
      const hostChanged = host.dataset.gamePluginInputSelected !== hostState;
      host.classList.toggle("has-game-plugin-selected-input", hostSelected);
      host.dataset.gamePluginInputSelected = hostState;
      if (!hostChanged) return;
      (runtime().setControllerPluginInputChoiceState as ((target: HTMLElement, selected: boolean) => unknown) | undefined)?.(
        host,
        hostSelected
      );
      return;
    }
    (runtime().setControllerPluginInputChoiceState as ((target: HTMLElement, selected: boolean) => unknown) | undefined)?.(
      button,
      selected
    );
  }

  function existingControl(target: HTMLElement, binding: InputBinding, tagName: "button" | "input"): HTMLElement | null {
    const selector = `[data-game-plugin-input-binding="${CSS.escape(binding.id)}"]`;
    const controls = Array.from(target.querySelectorAll<HTMLElement>(selector));
    const matching = controls.find((node) => node.tagName.toLowerCase() === tagName) || null;
    for (const node of controls) {
      if (node !== matching) node.remove();
    }
    if (matching) {
      matching.hidden = false;
      delete matching.dataset.layoutArtLegacyHidden;
    }
    return matching;
  }

  function addControl(binding: InputBinding, input: Dict, model: unknown, submitNow: () => void): void {
    const target = targetFor(binding.layoutElementId);
    if (!target) return;
    if (binding.kind === "text") {
      renderText(binding, model);
      return;
    }
    if (binding.kind === "integer") {
      const definition = (input.manifest as InputManifest).submission.find((field) => field.id === binding.field) as Dict | undefined;
      const fieldId = String(binding.field || "");
      const field = (existingControl(target.host, binding, "input") as HTMLInputElement | null) || document.createElement("input");
      field.type = "number";
      field.className = "game-plugin-input-control game-plugin-integer-input";
      field.dataset.gamePluginInputBinding = binding.id;
      field.dataset.gamePluginInputField = fieldId;
      field.min = String(definition?.min ?? "");
      field.max = String(definition?.max ?? "");
      field.step = "1";
      field.inputMode = "numeric";
      field.disabled = input.submitted === true;
      if (!values.has(fieldId)) values.set(fieldId, integerInitialValue(binding, definition, model));
      const value = values.get(fieldId);
      const visibleValue = value === undefined ? "" : String(value);
      if (field.value !== visibleValue) field.value = visibleValue;
      if (field.dataset.gamePluginInputListenerBound !== "true") {
        field.dataset.gamePluginInputListenerBound = "true";
        field.addEventListener("input", () => {
          values.set(field.dataset.gamePluginInputField || "", field.value === "" ? undefined : Number(field.value));
        });
      }
      if (!field.parentElement) target.host.appendChild(field);
      return;
    }
    const button = (existingControl(target.host, binding, "button") as HTMLButtonElement | null) || document.createElement("button");
    button.type = "button";
    button.className = "game-plugin-input-control game-plugin-action-button";
    button.dataset.gamePluginInputBinding = binding.id;
    button.disabled = input.submitted === true;
    submitHandlers.set(button, submitNow);
    if (binding.kind === "choice") {
      const submission = (input.manifest as InputManifest).submission.find((field) => field.id === binding.field);
      const optionsSource = (submission as Dict | undefined)?.optionsSource;
      const choices = propertyPathValue(model, String(optionsSource || ""));
      const option = Array.isArray(choices) ? choices[Number(binding.optionIndex || 0)] : null;
      const optionId = String(option && typeof option === "object" ? (option as Dict).id ?? binding.optionIndex : option ?? binding.optionIndex);
      const label = binding.labelSource
        ? propertyPathValue(model, binding.labelSource)
        : option && typeof option === "object"
          ? (option as Dict).label ?? (option as Dict).name ?? optionId
          : optionId;
      button.setAttribute("aria-label", String(label || "Choose"));
      button.dataset.gamePluginInputField = String(binding.field || "");
      button.dataset.gamePluginInputOption = optionId;
      button.dataset.gamePluginInputAutoSubmit = binding.autoSubmit === true ? "true" : "false";
      setChoiceSelected(button, values.get(String(binding.field || "")) === optionId);
      if (button.dataset.gamePluginInputListenerBound !== "true") {
        button.dataset.gamePluginInputListenerBound = "true";
        button.addEventListener("click", () => {
          const fieldId = button.dataset.gamePluginInputField || "";
          const selectedOption = button.dataset.gamePluginInputOption || "";
          values.set(fieldId, selectedOption);
          document.querySelectorAll<HTMLButtonElement>(`[data-game-plugin-input-field="${CSS.escape(fieldId)}"][data-game-plugin-input-option]`)
            .forEach((control) => setChoiceSelected(control, control.dataset.gamePluginInputOption === selectedOption));
          if (button.dataset.gamePluginInputAutoSubmit === "true") submitHandlers.get(button)?.();
        });
      }
    } else {
      button.setAttribute("aria-label", String(propertyPathValue(model, binding.labelSource || "") || "Submit"));
      if (button.dataset.gamePluginInputListenerBound !== "true") {
        button.dataset.gamePluginInputListenerBound = "true";
        button.addEventListener("click", () => submitHandlers.get(button)?.());
      }
    }
    if (!button.parentElement) target.host.appendChild(button);
  }

  function render(lobby: Dict): boolean {
    const input = ((lobby.gamePlugin as Dict | undefined)?.input as Dict | undefined) || null;
    if (!input?.actionId || !input.type) return false;
    const manifest = manifests().find((item) => item.id === String(input.type));
    if (!manifest) return false;
    const nextVisitKey = `${input.gameSessionId}:${input.actionId}:${input.visitId}`;
    if (nextVisitKey !== visitKey) {
      values.clear();
      visitKey = nextVisitKey;
    }
    const withManifest = { ...input, manifest };
    const model = input.viewModel;
    options.hideViews();
    const layoutStateId = String(input.layoutStateId || "controller-presentation");
    const viewId = layoutStateId === "controller-multiple-choice" || layoutStateId === "controller-voting"
      ? "choice"
      : layoutStateId === "controller-text-input" || layoutStateId === "controller-voice-input"
        ? "textInput"
        : "globalAction";
    options.showView(viewId);
    options.applyLayoutForPhase(
      layoutStateId,
      () => {},
      { preferRequestedState: true }
    );
    const submitNow = () => {
      const payload = Object.fromEntries(manifest.submission.map((field) => [field.id, values.get(field.id)]));
      void options.submit(String(input.actionId), Number(input.visitId || 0), payload, submissionId())
        .then((result) => {
          const nextLobby = (result as Dict | null)?.lobby;
          if (nextLobby) options.renderState(nextLobby as Dict);
        });
    };
    for (const binding of manifest.controller.bindings) addControl(binding, withManifest, model, submitNow);
    return true;
  }

  function reset(): void {
    values.clear();
    visitKey = "";
    document.querySelectorAll("[data-game-plugin-input-binding]").forEach((node) => node.remove());
  }

  return Object.freeze({ render, reset });
}
