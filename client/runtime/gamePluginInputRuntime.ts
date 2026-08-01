type Dict = Record<string, unknown>;
type SubmitValues = Record<string, string | number>;

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
  submitValues?: SubmitValues;
  holdSubmit?: { seconds: number; submitValues: SubmitValues };
};

type InputManifest = {
  id: string;
  submission: Array<{ id: string; type: "choice" | "integer"; min?: number; max?: number; optionsSource?: string }>;
  controller: {
    bindings: InputBinding[];
    submitted?: { layoutStateId: string; bindings: InputBinding[] };
  };
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
  const submitHandlers = new WeakMap<HTMLElement, (overrides?: SubmitValues) => void>();
  const controlBindings = new WeakMap<HTMLElement, InputBinding>();
  const activeHolds = new Map<HTMLButtonElement, { pointerId: number; timer: ReturnType<typeof setTimeout> }>();
  const suppressedHosts = new Set<HTMLElement>();
  let visitKey = "";
  let renderModeKey = "";
  let submitting = false;

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

  function renderTextBindings(bindings: InputBinding[], model: unknown): void {
    const grouped = new Map<HTMLElement, { element: Dict; key: string; textOverrides: Record<string, string> }>();
    for (const binding of bindings) {
      const target = targetFor(binding.layoutElementId);
      if (!target || !binding.targetComponentId) continue;
      const current = grouped.get(target.host) || {
        element: target.element,
        key: String(target.host.dataset.controllerLayoutVisibilityKey || binding.layoutElementId),
        textOverrides: {}
      };
      current.textOverrides[binding.targetComponentId] = String(propertyPathValue(model, binding.source || "") ?? "");
      grouped.set(target.host, current);
    }
    for (const [host, group] of grouped) {
      (runtime().renderControllerArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown))?.(
        group.element,
        host,
        group.key,
        {
          textOverrides: group.textOverrides,
          keepElements: Array.from(host.querySelectorAll<HTMLElement>(":scope > [data-game-plugin-input-binding]"))
        }
      );
    }
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
      if (host.dataset.gamePluginInputHolding === "true") {
        (runtime().setControllerPluginInputHoldingState as ((target: HTMLElement, holding: boolean, selected: boolean) => unknown) | undefined)?.(
          host,
          true,
          hostSelected
        );
        return;
      }
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

  function setHolding(button: HTMLButtonElement, holding: boolean): void {
    const state = holding ? "true" : "false";
    button.dataset.gamePluginInputHolding = state;
    button.classList.toggle("is-holding", holding);
    button.setAttribute("aria-busy", state);
    const host = button.parentElement as HTMLElement | null;
    if (!host) return;
    const hostHolding = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-game-plugin-input-holding]"))
      .some((control) => control.dataset.gamePluginInputHolding === "true");
    host.dataset.gamePluginInputHolding = hostHolding ? "true" : "false";
    host.classList.toggle("has-game-plugin-holding-input", hostHolding);
    const hostSelected = host.dataset.gamePluginInputSelected === "true";
    (runtime().setControllerPluginInputHoldingState as ((target: HTMLElement, holding: boolean, selected: boolean) => unknown) | undefined)?.(
      host,
      hostHolding,
      hostSelected
    );
  }

  function cancelHold(button: HTMLButtonElement): void {
    const hold = activeHolds.get(button);
    if (hold) clearTimeout(hold.timer);
    activeHolds.delete(button);
    setHolding(button, false);
  }

  function cancelAllHolds(): void {
    for (const button of Array.from(activeHolds.keys())) cancelHold(button);
  }

  function choiceOption(binding: InputBinding, input: Dict, model: unknown): { id: string; label: string } | null {
    const submission = (input.manifest as InputManifest).submission.find((field) => field.id === binding.field);
    const optionsSource = (submission as Dict | undefined)?.optionsSource;
    const choices = propertyPathValue(model, String(optionsSource || ""));
    const optionIndex = Number(binding.optionIndex);
    if (!Array.isArray(choices) || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= choices.length) return null;
    const option = choices[optionIndex];
    const rawId = option && typeof option === "object" ? (option as Dict).id : option;
    if (rawId === undefined || rawId === null) return null;
    const id = String(rawId);
    const rawLabel = binding.labelSource
      ? propertyPathValue(model, binding.labelSource)
      : option && typeof option === "object"
        ? (option as Dict).label ?? (option as Dict).name ?? id
        : id;
    return { id, label: String(rawLabel || "Choose") };
  }

  function selectChoice(button: HTMLButtonElement, submitValues: SubmitValues = {}): void {
    const fieldId = button.dataset.gamePluginInputField || "";
    const selectedOption = button.dataset.gamePluginInputOption || "";
    values.set(fieldId, selectedOption);
    for (const [key, value] of Object.entries(submitValues)) values.set(key, value);
    document.querySelectorAll<HTMLButtonElement>(`[data-game-plugin-input-field="${CSS.escape(fieldId)}"][data-game-plugin-input-option]`)
      .forEach((control) => setChoiceSelected(control, control.dataset.gamePluginInputOption === selectedOption));
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

  function addControl(binding: InputBinding, input: Dict, model: unknown, submitNow: (overrides?: SubmitValues) => void): void {
    const target = targetFor(binding.layoutElementId);
    if (!target) return;
    if (binding.kind === "text") return;
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
      field.disabled = input.submitted === true || submitting;
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
    button.classList.add("game-plugin-input-control", "game-plugin-action-button");
    button.dataset.gamePluginInputBinding = binding.id;
    button.disabled = input.submitted === true || submitting;
    submitHandlers.set(button, submitNow);
    controlBindings.set(button, binding);
    if (binding.kind === "choice") {
      const option = choiceOption(binding, input, model);
      if (!option) {
        cancelHold(button);
        button.remove();
        return;
      }
      button.setAttribute("aria-label", option.label);
      button.dataset.gamePluginInputField = String(binding.field || "");
      button.dataset.gamePluginInputOption = option.id;
      button.dataset.gamePluginInputAutoSubmit = binding.autoSubmit === true ? "true" : "false";
      setChoiceSelected(button, values.get(String(binding.field || "")) === option.id);
      if (button.dataset.gamePluginInputListenerBound !== "true") {
        button.dataset.gamePluginInputListenerBound = "true";
        button.addEventListener("pointerdown", (event) => {
          const current = controlBindings.get(button);
          if (!current?.holdSubmit || button.disabled || activeHolds.has(button)) return;
          const holdSubmit = current.holdSubmit;
          button.dataset.gamePluginInputSuppressClick = "false";
          try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers may not be capturable. */ }
          setHolding(button, true);
          const timer = setTimeout(() => {
            if (!button.isConnected || button.disabled || controlBindings.get(button)?.id !== current.id) {
              cancelHold(button);
              return;
            }
            activeHolds.delete(button);
            setHolding(button, false);
            button.dataset.gamePluginInputSuppressClick = "true";
            const overrides = { ...(current.submitValues || {}), ...holdSubmit.submitValues };
            selectChoice(button, overrides);
            submitHandlers.get(button)?.(overrides);
          }, holdSubmit.seconds * 1000);
          activeHolds.set(button, { pointerId: event.pointerId, timer });
        });
        button.addEventListener("pointerup", () => cancelHold(button));
        button.addEventListener("pointercancel", () => cancelHold(button));
        button.addEventListener("lostpointercapture", () => cancelHold(button));
        button.addEventListener("click", () => {
          if (button.dataset.gamePluginInputSuppressClick === "true") {
            button.dataset.gamePluginInputSuppressClick = "false";
            return;
          }
          const current = controlBindings.get(button);
          const overrides = current?.submitValues || {};
          selectChoice(button, overrides);
          if (button.dataset.gamePluginInputAutoSubmit === "true") submitHandlers.get(button)?.(overrides);
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

  function restoreSuppressedHosts(): void {
    for (const host of suppressedHosts) {
      host.classList.remove("controller-layout-plugin-input-unavailable");
      delete host.dataset.gamePluginInputUnavailable;
    }
    suppressedHosts.clear();
  }

  function render(lobby: Dict): boolean {
    const input = ((lobby.gamePlugin as Dict | undefined)?.input as Dict | undefined) || null;
    if (!input?.actionId || !input.type) return false;
    const manifest = manifests().find((item) => item.id === String(input.type));
    if (!manifest) return false;
    const nextVisitKey = `${input.gameSessionId}:${input.actionId}:${input.visitId}`;
    if (nextVisitKey !== visitKey) {
      cancelAllHolds();
      values.clear();
      submitting = false;
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
    const activeBindings = input.submitted === true && manifest.controller.submitted
      ? manifest.controller.submitted.bindings
      : manifest.controller.bindings;
    const nextRenderModeKey = `${nextVisitKey}:${layoutStateId}:${input.submitted === true}`;
    if (renderModeKey && renderModeKey !== nextRenderModeKey) cancelAllHolds();
    renderModeKey = nextRenderModeKey;
    restoreSuppressedHosts();
    const availableBindings = activeBindings.filter((binding) => binding.kind !== "choice" || choiceOption(binding, withManifest, model));
    const availableBindingIds = new Set(availableBindings.map((binding) => binding.id));
    const bindingsByHost = new Map<HTMLElement, InputBinding[]>();
    for (const binding of activeBindings) {
      const target = targetFor(binding.layoutElementId);
      if (!target) continue;
      const grouped = bindingsByHost.get(target.host) || [];
      grouped.push(binding);
      bindingsByHost.set(target.host, grouped);
    }
    for (const [host, bindings] of bindingsByHost) {
      if (bindings.some((binding) => binding.kind !== "choice" || availableBindingIds.has(binding.id))) continue;
      host.classList.remove("has-game-plugin-selected-input", "has-game-plugin-holding-input");
      host.dataset.gamePluginInputSelected = "false";
      host.dataset.gamePluginInputHolding = "false";
      (runtime().setControllerPluginInputChoiceState as ((target: HTMLElement, selected: boolean) => unknown) | undefined)?.(host, false);
      host.classList.add("controller-layout-plugin-input-unavailable");
      host.dataset.gamePluginInputUnavailable = "true";
      suppressedHosts.add(host);
    }
    const validChoiceIdsByField = new Map<string, Set<string>>();
    for (const field of manifest.submission.filter((candidate) => candidate.type === "choice")) {
      const choices = propertyPathValue(model, String(field.optionsSource || ""));
      const ids = new Set((Array.isArray(choices) ? choices : []).flatMap((choice) => {
        const id = choice && typeof choice === "object" ? (choice as Dict).id : choice;
        return id === undefined || id === null ? [] : [String(id)];
      }));
      validChoiceIdsByField.set(field.id, ids);
      if (values.has(field.id) && !ids.has(String(values.get(field.id)))) values.delete(field.id);
    }
    document.querySelectorAll<HTMLElement>("[data-game-plugin-input-binding]").forEach((control) => {
      if (!availableBindingIds.has(control.dataset.gamePluginInputBinding || "")) {
        if (control instanceof HTMLButtonElement) cancelHold(control);
        control.remove();
      }
    });
    const submitNow = (overrides: SubmitValues = {}) => {
      if (input.submitted === true || submitting) return;
      submitting = true;
      cancelAllHolds();
      document.querySelectorAll<HTMLInputElement | HTMLButtonElement>("[data-game-plugin-input-binding]")
        .forEach((control) => { control.disabled = true; });
      const payload = Object.fromEntries(manifest.submission.map((field) => [field.id, overrides[field.id] ?? values.get(field.id)]));
      void options.submit(String(input.actionId), Number(input.visitId || 0), payload, submissionId())
        .then((result) => {
          const nextLobby = (result as Dict | null)?.lobby;
          if (nextLobby) options.renderState(nextLobby as Dict);
          else submitting = false;
        })
        .catch(() => {
          submitting = false;
        });
    };
    for (const binding of availableBindings) addControl(binding, withManifest, model, submitNow);
    renderTextBindings(availableBindings.filter((binding) => binding.kind === "text"), model);
    return true;
  }

  function reset(): void {
    cancelAllHolds();
    restoreSuppressedHosts();
    values.clear();
    visitKey = "";
    renderModeKey = "";
    submitting = false;
    document.querySelectorAll("[data-game-plugin-input-binding]").forEach((node) => node.remove());
  }

  return Object.freeze({ render, reset });
}
