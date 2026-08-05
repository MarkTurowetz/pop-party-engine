import {
  choiceCollectionItemDimensions,
  choiceCollectionLayoutStyle
} from "./controllerChoiceCollectionLayout";

type Dict = Record<string, unknown>;
type SubmitValues = Record<string, string | number>;

type HoldProgressBinding = {
  delaySeconds: number;
  targetComponentId: string;
  startLabel: string;
  completeLabel: string;
  resetLabel: string;
};

type HoldSubmitBinding = {
  seconds: number;
  submitValues: SubmitValues;
  progress?: HoldProgressBinding;
};

function cssEscape(value: string): string {
  return globalThis.CSS?.escape?.(value) || value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

type InputBinding = {
  id: string;
  kind: "choice" | "choiceCollection" | "integer" | "submit" | "text";
  layoutElementId: string;
  field?: string;
  optionIndex?: number;
  source?: string;
  labelSource?: string;
  targetComponentId?: string;
  interactionTargetComponentId?: string;
  autoSubmit?: boolean;
  submitValues?: SubmitValues;
  holdSubmit?: HoldSubmitBinding;
  item?: {
    artCompositionId: string;
    targetComponentId: string;
    labelSource?: string;
    disabledSource?: string;
  };
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

function defaultManifests(): InputManifest[] {
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
  manifestSource?: () => InputManifest[];
  payloadForLobby?: (lobby: Dict) => Dict | null;
  controlScope?: string;
  layoutScope?: string;
  prepareLayout?: boolean;
  retainControlsAcrossVisits?: boolean;
  persistentSubmissions?: boolean;
  onSubmitted?: () => void;
}) {
  const controlScope = String(options.controlScope || "flow");
  const controlScopeSelector = `[data-game-plugin-input-scope="${cssEscape(controlScope)}"]`;
  const values = new Map<string, unknown>();
  const submitHandlers = new WeakMap<HTMLElement, (overrides?: SubmitValues) => void>();
  const controlBindings = new WeakMap<HTMLElement, InputBinding>();
  const collectionControlAuthority = new WeakMap<HTMLButtonElement, { bindingId: string; optionId: string; visitKey: string }>();
  const activeCollectionOptionIds = new Map<string, Set<string>>();
  type ActiveHold = {
    pointerId: number;
    bindingId: string;
    startedAt: number;
    thresholdMs: number;
    progress?: HoldProgressBinding;
    delayTimer: ReturnType<typeof setTimeout> | null;
    completionTimer: ReturnType<typeof setTimeout>;
    animationFrame: number | null;
  };
  const activeHolds = new Map<HTMLButtonElement, ActiveHold>();
  type ChoiceInteractionState = {
    hovered: boolean;
    pressed: boolean;
    pointerId: number | null;
    identity: string;
    commandToken: number;
  };
  const choiceInteractionStates = new WeakMap<HTMLButtonElement, ChoiceInteractionState>();
  const suppressedHosts = new Set<HTMLElement>();
  let visitKey = "";
  let renderModeKey = "";
  let submitting = false;

  function runtime(): Dict {
    return globalThis as typeof globalThis & Dict;
  }

  function now(): number {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  function requestProgressFrame(callback: (timestamp: number) => void): number {
    if (typeof globalThis.requestAnimationFrame === "function") return globalThis.requestAnimationFrame(callback);
    return Number(globalThis.setTimeout(() => callback(now()), 16));
  }

  function cancelProgressFrame(id: number | null): void {
    if (id === null) return;
    if (typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(id);
    else globalThis.clearTimeout(id);
  }

  function targetFor(layoutElementId: string): { element: Dict; host: HTMLElement } | null {
    const rt = runtime();
    const element = (rt.controllerLayoutElementForId as ((id: string, scope?: string) => Dict | null))?.(layoutElementId, options.layoutScope || "");
    if (!element) return null;
    const host = (rt.controllerLayoutTargetElement as ((item: Dict, scope?: string) => HTMLElement | null))?.(element, options.layoutScope || "");
    return host ? { element, host } : null;
  }

  function controllerComposition(compositionId: string): Dict | null {
    const compositions = (runtime().artCompositions as Dict[] | undefined) || [];
    const composition = compositions.find((item) => String(item.id || "") === compositionId) || null;
    if (!composition) return null;
    const surface = String(composition.surface || "").trim().toLowerCase();
    const kind = String(composition.compositionKind || "gameObject").trim().toLowerCase();
    return surface === "controller" && kind === "gameobject" ? composition : null;
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
    if (button.dataset.gamePluginChoiceCollectionItem === "true") {
      applyCollectionVisualState(button);
      return;
    }
    const host = button.parentElement as HTMLElement | null;
    if (host) {
      const hostSelected = Array.from(host.querySelectorAll<HTMLButtonElement>(`[data-game-plugin-input-option]${controlScopeSelector}`))
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
      if (hostChanged) (runtime().setControllerPluginInputChoiceState as ((target: HTMLElement, selected: boolean) => unknown) | undefined)?.(
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
    if (button.dataset.gamePluginChoiceCollectionItem === "true") {
      applyCollectionVisualState(button);
      return;
    }
    const host = button.parentElement as HTMLElement | null;
    if (!host) return;
    const hostHolding = Array.from(host.querySelectorAll<HTMLButtonElement>(`[data-game-plugin-input-holding]${controlScopeSelector}`))
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

  function holdVisualHost(button: HTMLButtonElement): HTMLElement | null {
    return button.dataset.gamePluginChoiceCollectionItem === "true"
      ? button
      : button.parentElement as HTMLElement | null;
  }

  function interactionVisualHost(button: HTMLButtonElement): HTMLElement | null {
    return button.dataset.gamePluginChoiceCollectionItem === "true"
      ? button
      : button.parentElement as HTMLElement | null;
  }

  function interactionState(button: HTMLButtonElement): ChoiceInteractionState {
    const existing = choiceInteractionStates.get(button);
    if (existing) return existing;
    const created: ChoiceInteractionState = {
      hovered: false,
      pressed: false,
      pointerId: null,
      identity: "",
      commandToken: 0
    };
    choiceInteractionStates.set(button, created);
    return created;
  }

  function dispatchChoiceInteraction(
    button: HTMLButtonElement,
    animation: "Default" | "HoverIn" | "HoverOut" | "Down" | "Up",
    dispatchOptions: { instant?: boolean; settle?: boolean } = {}
  ): void {
    const binding = controlBindings.get(button);
    const targetComponentId = String(binding?.interactionTargetComponentId || "").trim();
    const host = interactionVisualHost(button);
    if (!targetComponentId || !host) return;
    const state = interactionState(button);
    const token = ++state.commandToken;
    button.dataset.gamePluginInputInteractionState = animation;
    host.dataset.gamePluginInputInteractionState = animation;
    const complete = dispatchOptions.settle
      ? () => {
          if (state.commandToken !== token) return;
          const settled = state.hovered
            && !button.disabled
            && collectionControlIsAuthoritative(button)
            ? "HoverIn"
            : "Default";
          dispatchChoiceInteraction(button, settled, { instant: settled === "Default" });
        }
      : undefined;
    (runtime().playControllerPluginInputInteraction as ((
      target: HTMLElement,
      componentId: string,
      state: string,
      options?: Dict
    ) => unknown) | undefined)?.(
      host,
      targetComponentId,
      animation,
      { instant: dispatchOptions.instant === true, complete }
    );
  }

  function initializeChoiceInteraction(button: HTMLButtonElement): void {
    const binding = controlBindings.get(button);
    const targetComponentId = String(binding?.interactionTargetComponentId || "").trim();
    if (!targetComponentId) return;
    const host = interactionVisualHost(button);
    if (!host) return;
    const rendererIdentity = button.dataset.gamePluginChoiceRendererKey
      || host.dataset.layoutRendererKey
      || host.dataset.controllerLayoutVisibilityKey
      || binding?.layoutElementId
      || "";
    const identity = `${visitKey}:${binding?.id || ""}:${rendererIdentity}:${targetComponentId}`;
    const state = interactionState(button);
    if (state.identity === identity) return;
    state.identity = identity;
    state.hovered = false;
    state.pressed = false;
    state.pointerId = null;
    dispatchChoiceInteraction(button, "Default", { instant: true });
  }

  function resetChoiceInteraction(button: HTMLButtonElement): void {
    const state = interactionState(button);
    state.hovered = false;
    state.pressed = false;
    state.pointerId = null;
    dispatchChoiceInteraction(button, "Default", { instant: true });
  }

  function applyHoldProgress(
    button: HTMLButtonElement,
    progress: HoldProgressBinding,
    normalizedProgress: number | null,
    phase: "idle" | "delay" | "progress" | "complete"
  ): void {
    const value = normalizedProgress === null ? 0 : Math.max(0, Math.min(1, Number(normalizedProgress) || 0));
    const serialized = value.toFixed(3).replace(/\.000$/, "");
    button.dataset.gamePluginInputHoldProgress = serialized;
    button.dataset.gamePluginInputHoldPhase = phase;
    button.dataset.gamePluginInputHoldDelaySeconds = String(progress.delaySeconds);
    const host = holdVisualHost(button);
    if (!host) return;
    host.dataset.gamePluginInputHoldProgress = serialized;
    host.dataset.gamePluginInputHoldPhase = phase;
    (runtime().setControllerPluginInputHoldProgress as ((
      target: HTMLElement,
      spec: HoldProgressBinding,
      value: number | null
    ) => unknown) | undefined)?.(host, progress, normalizedProgress);
  }

  function holdIsAuthoritative(button: HTMLButtonElement, hold: ActiveHold): boolean {
    return button.isConnected
      && !button.disabled
      && controlBindings.get(button)?.id === hold.bindingId
      && collectionControlIsAuthoritative(button);
  }

  function clearHoldSchedules(hold: ActiveHold): void {
    if (hold.delayTimer !== null) clearTimeout(hold.delayTimer);
    clearTimeout(hold.completionTimer);
    cancelProgressFrame(hold.animationFrame);
    hold.delayTimer = null;
    hold.animationFrame = null;
  }

  function cancelHold(button: HTMLButtonElement, suppressClick = false): void {
    const hold = activeHolds.get(button);
    if (!hold) return;
    clearHoldSchedules(hold);
    activeHolds.delete(button);
    if (suppressClick) button.dataset.gamePluginInputSuppressClick = "true";
    setHolding(button, false);
    if (hold.progress) applyHoldProgress(button, hold.progress, null, "idle");
  }

  function cancelAllHolds(): void {
    for (const button of Array.from(activeHolds.keys())) cancelHold(button, true);
  }

  function holdProgressValue(hold: ActiveHold, timestamp = now()): number {
    if (!hold.progress) return 0;
    const delayMs = hold.progress.delaySeconds * 1000;
    const progressDurationMs = Math.max(1, hold.thresholdMs - delayMs);
    return Math.max(0, Math.min(1, (timestamp - hold.startedAt - delayMs) / progressDurationMs));
  }

  function updateHoldProgress(button: HTMLButtonElement, hold: ActiveHold, reinitialize = false): void {
    if (!hold.progress) return;
    if (!holdIsAuthoritative(button, hold)) {
      cancelHold(button, true);
      return;
    }
    const elapsedMs = now() - hold.startedAt;
    const delayMs = hold.progress.delaySeconds * 1000;
    if (elapsedMs < delayMs) {
      applyHoldProgress(button, hold.progress, null, "delay");
      return;
    }
    const value = holdProgressValue(hold);
    if (reinitialize) applyHoldProgress(button, hold.progress, 0, "progress");
    applyHoldProgress(button, hold.progress, value, value >= 1 ? "complete" : "progress");
  }

  function startHoldProgressAnimation(button: HTMLButtonElement, hold: ActiveHold): void {
    if (!hold.progress || activeHolds.get(button) !== hold) return;
    updateHoldProgress(button, hold, true);
    const tick = () => {
      if (activeHolds.get(button) !== hold) return;
      updateHoldProgress(button, hold);
      if (activeHolds.get(button) === hold && holdProgressValue(hold) < 1) {
        hold.animationFrame = requestProgressFrame(tick);
      }
    };
    hold.animationFrame = requestProgressFrame(tick);
  }

  function completeHold(button: HTMLButtonElement, hold: ActiveHold, current: InputBinding): void {
    if (activeHolds.get(button) !== hold || !holdIsAuthoritative(button, hold)) {
      cancelHold(button, true);
      return;
    }
    clearHoldSchedules(hold);
    activeHolds.delete(button);
    if (hold.progress) applyHoldProgress(button, hold.progress, 1, "complete");
    setHolding(button, false);
    if (hold.progress) applyHoldProgress(button, hold.progress, 1, "complete");
    button.dataset.gamePluginInputSuppressClick = "true";
    const overrides = { ...(current.submitValues || {}), ...(current.holdSubmit?.submitValues || {}) };
    selectChoice(button, overrides);
    submitHandlers.get(button)?.(overrides);
  }

  function resetCompletedHoldProgress(): void {
    document.querySelectorAll<HTMLButtonElement>(`[data-game-plugin-input-hold-phase="complete"]${controlScopeSelector}`)
      .forEach((button) => {
        const progress = controlBindings.get(button)?.holdSubmit?.progress;
        if (progress) applyHoldProgress(button, progress, null, "idle");
      });
  }

  function setSubmissionPending(pending: boolean, input: Dict): void {
    submitting = pending;
    document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(`[data-game-plugin-input-binding]${controlScopeSelector}`)
      .forEach((control) => {
        const unavailable = control.dataset.gamePluginInputDisabled === "true"
          || control.dataset.gamePluginInputStale === "true";
        control.disabled = pending || input.submitted === true || unavailable;
        if (control instanceof HTMLButtonElement && control.disabled) resetChoiceInteraction(control);
        if (control instanceof HTMLButtonElement && control.dataset.gamePluginChoiceCollectionItem === "true") {
          control.dataset.gamePluginInputSubmitted = pending || input.submitted === true ? "true" : "false";
          control.setAttribute("aria-disabled", control.disabled ? "true" : "false");
          applyCollectionVisualState(control);
        }
      });
  }

  function collectionVisualState(button: HTMLButtonElement): string {
    if (button.dataset.gamePluginInputStale === "true") return "Stale";
    if (button.dataset.gamePluginInputSubmitted === "true") return "Submitted";
    if (button.disabled || button.dataset.gamePluginInputDisabled === "true") return "Disabled";
    if (button.dataset.gamePluginInputHolding === "true") return "Holding";
    return button.dataset.gamePluginInputSelected === "true" ? "Selected" : "Default";
  }

  function applyCollectionVisualState(button: HTMLButtonElement): void {
    const state = collectionVisualState(button);
    if (button.dataset.gamePluginInputArtState === state) return;
    button.dataset.gamePluginInputArtState = state;
    (runtime().setControllerPluginInputCollectionState as ((target: HTMLElement, state: string) => unknown) | undefined)?.(
      button,
      state
    );
  }

  function collectionControlIsAuthoritative(button: HTMLButtonElement): boolean {
    const authority = collectionControlAuthority.get(button);
    if (!authority) return button.dataset.gamePluginChoiceCollectionItem !== "true";
    return authority.visitKey === visitKey
      && activeCollectionOptionIds.get(authority.bindingId)?.has(authority.optionId) === true
      && button.dataset.gamePluginInputStale !== "true"
      && button.isConnected;
  }

  function clearCollectionControl(button: HTMLButtonElement, remove = true): void {
    cancelHold(button, true);
    resetChoiceInteraction(button);
    button.disabled = true;
    button.dataset.gamePluginInputStale = "true";
    button.setAttribute("aria-disabled", "true");
    applyCollectionVisualState(button);
    collectionControlAuthority.delete(button);
    const rendererKey = button.dataset.gamePluginChoiceRendererKey || "";
    if (rendererKey) {
      (runtime().clearControllerArtInstanceRenderer as ((key: string, host: HTMLElement) => void) | undefined)?.(
        rendererKey,
        button
      );
    }
    if (remove) button.remove();
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
    document.querySelectorAll<HTMLButtonElement>(`[data-game-plugin-input-field="${CSS.escape(fieldId)}"][data-game-plugin-input-option]${controlScopeSelector}`)
      .forEach((control) => setChoiceSelected(control, control.dataset.gamePluginInputOption === selectedOption));
  }

  function existingControl(target: HTMLElement, binding: InputBinding, tagName: "button" | "input"): HTMLElement | null {
    const selector = `[data-game-plugin-input-binding="${CSS.escape(binding.id)}"]${controlScopeSelector}`;
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

  function bindChoiceControlListeners(button: HTMLButtonElement): void {
    if (button.dataset.gamePluginInputListenerBound === "true") return;
    button.dataset.gamePluginInputListenerBound = "true";
    button.addEventListener("pointerenter", () => {
      const state = interactionState(button);
      state.hovered = true;
      if (!button.disabled && collectionControlIsAuthoritative(button) && !state.pressed) {
        dispatchChoiceInteraction(button, "HoverIn");
      }
    });
    button.addEventListener("pointerleave", () => {
      const state = interactionState(button);
      state.hovered = false;
      if (!button.disabled && collectionControlIsAuthoritative(button)) {
        dispatchChoiceInteraction(button, "HoverOut", { settle: true });
      }
    });
    button.addEventListener("pointerdown", (event) => {
      const current = controlBindings.get(button);
      if (
        !current
        || button.disabled
        || !collectionControlIsAuthoritative(button)
        || event.isPrimary === false
        || (event.pointerType !== "touch" && event.button !== 0)
      ) return;
      if (current.holdSubmit && !activeHolds.has(button)) {
        const holdSubmit = current.holdSubmit;
        button.dataset.gamePluginInputSuppressClick = "false";
        try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers may not be capturable. */ }
        setHolding(button, true);
        if (holdSubmit.progress) applyHoldProgress(button, holdSubmit.progress, null, "delay");
        const thresholdMs = holdSubmit.seconds * 1000;
        const hold: ActiveHold = {
          pointerId: event.pointerId,
          bindingId: current.id,
          startedAt: now(),
          thresholdMs,
          progress: holdSubmit.progress,
          delayTimer: null,
          completionTimer: 0 as unknown as ReturnType<typeof setTimeout>,
          animationFrame: null
        };
        activeHolds.set(button, hold);
        if (hold.progress) {
          const delayMs = hold.progress.delaySeconds * 1000;
          if (delayMs <= 0) startHoldProgressAnimation(button, hold);
          else hold.delayTimer = setTimeout(() => startHoldProgressAnimation(button, hold), delayMs);
        }
        hold.completionTimer = setTimeout(() => completeHold(button, hold, current), thresholdMs);
      }
      const state = interactionState(button);
      state.pressed = true;
      state.pointerId = event.pointerId;
      dispatchChoiceInteraction(button, "Down");
    });
    button.addEventListener("pointerup", (event) => {
      cancelHold(button);
      const state = interactionState(button);
      if (state.pointerId !== null && state.pointerId !== event.pointerId) return;
      state.pressed = false;
      state.pointerId = null;
      if (!button.disabled && collectionControlIsAuthoritative(button)) {
        dispatchChoiceInteraction(button, "Up", { settle: true });
      }
    });
    const cancelPointerInteraction = () => {
      cancelHold(button, true);
      const state = interactionState(button);
      if (!state.pressed) return;
      state.pressed = false;
      state.pointerId = null;
      state.hovered = false;
      dispatchChoiceInteraction(button, "HoverOut", { settle: true });
    };
    button.addEventListener("pointercancel", cancelPointerInteraction);
    button.addEventListener("lostpointercapture", cancelPointerInteraction);
    button.addEventListener("blur", () => {
      cancelHold(button, true);
      const state = interactionState(button);
      const wasActive = state.pressed || state.hovered;
      state.pressed = false;
      state.pointerId = null;
      state.hovered = false;
      if (wasActive) dispatchChoiceInteraction(button, "HoverOut", { settle: true });
      else dispatchChoiceInteraction(button, "Default", { instant: true });
    });
    button.addEventListener("click", () => {
      if (!collectionControlIsAuthoritative(button) || button.disabled) return;
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

  function addControl(binding: InputBinding, input: Dict, model: unknown, submitNow: (overrides?: SubmitValues) => void): void {
    const target = targetFor(binding.layoutElementId);
    if (!target) return;
    if (binding.kind === "text" || binding.kind === "choiceCollection") return;
    if (binding.kind === "integer") {
      const definition = (input.manifest as InputManifest).submission.find((field) => field.id === binding.field) as Dict | undefined;
      const fieldId = String(binding.field || "");
      const field = (existingControl(target.host, binding, "input") as HTMLInputElement | null) || document.createElement("input");
      field.type = "number";
      field.className = "game-plugin-input-control game-plugin-integer-input";
      field.dataset.gamePluginInputBinding = binding.id;
      field.dataset.gamePluginInputScope = controlScope;
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
    button.dataset.gamePluginInputScope = controlScope;
    button.disabled = input.submitted === true || submitting;
    submitHandlers.set(button, submitNow);
    controlBindings.set(button, binding);
    if (button.disabled && activeHolds.has(button)) cancelHold(button, true);
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
      bindChoiceControlListeners(button);
    } else {
      button.setAttribute("aria-label", String(propertyPathValue(model, binding.labelSource || "") || "Submit"));
      if (button.dataset.gamePluginInputListenerBound !== "true") {
        button.dataset.gamePluginInputListenerBound = "true";
        button.addEventListener("click", () => submitHandlers.get(button)?.());
      }
    }
    if (!button.parentElement) target.host.appendChild(button);
    if (binding.kind === "choice") {
      setChoiceSelected(button, values.get(String(binding.field || "")) === button.dataset.gamePluginInputOption);
      initializeChoiceInteraction(button);
    }
  }

  function collectionOptions(binding: InputBinding, input: Dict, model: unknown): Array<{ id: string; label: string; disabled: boolean }> {
    const submission = (input.manifest as InputManifest).submission.find((field) => field.id === binding.field);
    const choices = propertyPathValue(model, String((submission as Dict | undefined)?.optionsSource || ""));
    const item = binding.item;
    if (!Array.isArray(choices) || !item) return [];
    const result: Array<{ id: string; label: string; disabled: boolean }> = [];
    const seen = new Set<string>();
    for (const option of choices) {
      const rawId = option && typeof option === "object" ? (option as Dict).id : option;
      if (rawId === undefined || rawId === null) continue;
      const id = String(rawId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const labelValue = option && typeof option === "object"
        ? propertyPathValue(option, item.labelSource || "label")
          ?? (option as Dict).label
          ?? (option as Dict).name
          ?? id
        : option;
      const disabledValue = option && typeof option === "object"
        ? propertyPathValue(option, item.disabledSource || "disabled")
        : false;
      result.push({ id, label: String(labelValue ?? id), disabled: disabledValue === true });
    }
    return result;
  }

  function addChoiceCollection(
    binding: InputBinding,
    input: Dict,
    model: unknown,
    submitNow: (overrides?: SubmitValues) => void
  ): void {
    const target = targetFor(binding.layoutElementId);
    const item = binding.item;
    if (!target || target.element.kind !== "collection" || !item) return;
    const composition = controllerComposition(String(item.artCompositionId || ""));
    if (!composition) {
      target.host.classList.add("controller-layout-plugin-input-unavailable");
      target.host.dataset.gamePluginInputUnavailable = "true";
      suppressedHosts.add(target.host);
      return;
    }
    Object.assign(target.host.style, choiceCollectionLayoutStyle(target.element));
    target.host.classList.add("controller-choice-collection");
    target.host.dataset.gamePluginChoiceCollectionBinding = binding.id;
    const focusedControl = document.activeElement instanceof HTMLButtonElement
      && target.host.contains(document.activeElement)
      ? document.activeElement
      : null;
    const optionsForViewer = collectionOptions(binding, input, model);
    const activeIds = new Set(optionsForViewer.map((option) => option.id));
    activeCollectionOptionIds.set(binding.id, activeIds);
    const existing = Array.from(
      target.host.querySelectorAll<HTMLButtonElement>(`:scope > button[data-game-plugin-input-binding="${CSS.escape(binding.id)}"][data-game-plugin-choice-collection-item="true"]${controlScopeSelector}`)
    );
    const byOptionId = new Map<string, HTMLButtonElement>();
    for (const button of existing) {
      const sameVisit = button.dataset.gamePluginInputVisitKey === visitKey;
      const optionId = button.dataset.gamePluginInputOption || "";
      if ((sameVisit || options.retainControlsAcrossVisits === true) && activeIds.has(optionId) && !byOptionId.has(optionId)) {
        byOptionId.set(optionId, button);
      }
      else clearCollectionControl(button);
    }
    const dimensions = choiceCollectionItemDimensions(target.element, composition, optionsForViewer.length);
    for (const option of optionsForViewer) {
      let button = byOptionId.get(option.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "game-plugin-input-control game-plugin-action-button controller-choice-collection-item controller-widget-art-host has-controller-widget-art";
        button.dataset.gamePluginChoiceCollectionItem = "true";
        button.dataset.gamePluginInputListenerBound = "false";
      }
      button.hidden = false;
      button.dataset.gamePluginInputBinding = binding.id;
      button.dataset.gamePluginInputScope = controlScope;
      button.dataset.gamePluginInputVisitKey = visitKey;
      button.dataset.gamePluginInputField = String(binding.field || "");
      button.dataset.gamePluginInputOption = option.id;
      button.dataset.controllerOption = option.id;
      button.dataset.gamePluginInputAutoSubmit = binding.autoSubmit === true ? "true" : "false";
      button.dataset.gamePluginInputDisabled = option.disabled ? "true" : "false";
      button.dataset.gamePluginInputSubmitted = input.submitted === true ? "true" : "false";
      button.dataset.gamePluginInputStale = "false";
      button.setAttribute("aria-label", option.label);
      button.setAttribute("aria-disabled", option.disabled || input.submitted === true || submitting ? "true" : "false");
      button.disabled = option.disabled || input.submitted === true || submitting;
      if (button.disabled && activeHolds.has(button)) cancelHold(button, true);
      button.style.width = `${dimensions.width}px`;
      button.style.height = `${dimensions.height}px`;
      button.style.flex = "0 0 auto";
      button.style.minWidth = "0";
      submitHandlers.set(button, submitNow);
      controlBindings.set(button, binding);
      collectionControlAuthority.set(button, { bindingId: binding.id, optionId: option.id, visitKey });
      bindChoiceControlListeners(button);
      target.host.appendChild(button);
      const rendererKey = options.retainControlsAcrossVisits === true
        ? `plugin-input:${controlScope}:${binding.id}:${option.id}`
        : `plugin-input:${controlScope}:${visitKey}:${binding.id}:${option.id}`;
      button.dataset.gamePluginChoiceRendererKey = rendererKey;
      (runtime().renderControllerArtInstance as ((element: Dict, host: HTMLElement, key: string, options: Dict) => unknown) | undefined)?.(
        {
          id: rendererKey,
          kind: "art",
          artCompositionId: item.artCompositionId,
          width: dimensions.width,
          height: dimensions.height,
          scale: 1,
          defaultAnimationState: "On"
        },
        button,
        rendererKey,
        { textOverrides: { [item.targetComponentId]: option.label }, keepElements: [] }
      );
      setChoiceSelected(button, values.get(String(binding.field || "")) === option.id);
      applyCollectionVisualState(button);
      initializeChoiceInteraction(button);
    }
    if (focusedControl && collectionControlIsAuthoritative(focusedControl) && !focusedControl.disabled) {
      focusedControl.focus({ preventScroll: true });
    }
  }

  function restoreSuppressedHosts(): void {
    for (const host of suppressedHosts) {
      host.classList.remove("controller-layout-plugin-input-unavailable");
      delete host.dataset.gamePluginInputUnavailable;
    }
    suppressedHosts.clear();
  }

  function render(lobby: Dict): boolean {
    const input = options.payloadForLobby
      ? options.payloadForLobby(lobby)
      : (((lobby.gamePlugin as Dict | undefined)?.input as Dict | undefined) || null);
    if (!input?.actionId || !input.type) return false;
    const manifest = (options.manifestSource?.() || defaultManifests()).find((item) => item.id === String(input.type));
    if (!manifest) return false;
    const nextVisitKey = `${input.gameSessionId}:${input.actionId}:${input.visitId}`;
    if (nextVisitKey !== visitKey) {
      cancelAllHolds();
      activeCollectionOptionIds.clear();
      values.clear();
      submitting = false;
      visitKey = nextVisitKey;
    }
    const withManifest = { ...input, manifest };
    const model = input.viewModel;
    const layoutStateId = String(input.layoutStateId || "controller-presentation");
    const viewId = layoutStateId === "controller-multiple-choice" || layoutStateId === "controller-voting"
      ? "choice"
      : layoutStateId === "controller-text-input" || layoutStateId === "controller-voice-input"
        ? "textInput"
        : "globalAction";
    if (options.prepareLayout !== false) {
      options.hideViews();
      options.showView(viewId);
      options.applyLayoutForPhase(
        layoutStateId,
        () => {},
        { preferRequestedState: true }
      );
    }
    const activeBindings = input.submitted === true && manifest.controller.submitted
      ? manifest.controller.submitted.bindings
      : manifest.controller.bindings;
    const nextRenderModeKey = `${nextVisitKey}:${layoutStateId}:${input.submitted === true}`;
    if (renderModeKey && renderModeKey !== nextRenderModeKey) cancelAllHolds();
    renderModeKey = nextRenderModeKey;
    restoreSuppressedHosts();
    activeCollectionOptionIds.clear();
    for (const field of manifest.submission) {
      if (values.has(field.id)) continue;
      const initial = propertyPathValue(model, field.id);
      if (typeof initial === "string" || typeof initial === "number") values.set(field.id, initial);
    }
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
    document.querySelectorAll<HTMLElement>(`[data-game-plugin-input-binding]${controlScopeSelector}`).forEach((control) => {
      if (!availableBindingIds.has(control.dataset.gamePluginInputBinding || "")) {
        if (control instanceof HTMLButtonElement && control.dataset.gamePluginChoiceCollectionItem === "true") {
          clearCollectionControl(control);
        } else {
          if (control instanceof HTMLButtonElement) {
            cancelHold(control);
            resetChoiceInteraction(control);
          }
          control.remove();
        }
      }
    });
    const submitNow = (overrides: SubmitValues = {}) => {
      if (input.submitted === true || submitting) return;
      cancelAllHolds();
      setSubmissionPending(true, input);
      const payload = Object.fromEntries(manifest.submission.map((field) => [field.id, overrides[field.id] ?? values.get(field.id)]));
      void options.submit(String(input.actionId), Number(input.visitId || 0), payload, submissionId())
        .then((result) => {
          if (options.persistentSubmissions === true) {
            setSubmissionPending(false, input);
            resetCompletedHoldProgress();
          }
          const nextLobby = (result as Dict | null)?.lobby;
          if (nextLobby) options.renderState(nextLobby as Dict);
          else {
            setSubmissionPending(false, input);
            resetCompletedHoldProgress();
          }
          options.onSubmitted?.();
        })
        .catch(() => {
          setSubmissionPending(false, input);
          resetCompletedHoldProgress();
        });
    };
    for (const binding of availableBindings.filter((candidate) => candidate.kind === "choiceCollection")) {
      addChoiceCollection(binding, withManifest, model, submitNow);
    }
    for (const binding of availableBindings) addControl(binding, withManifest, model, submitNow);
    renderTextBindings(availableBindings.filter((binding) => binding.kind === "text"), model);
    document.querySelectorAll<HTMLButtonElement>(`button[data-game-plugin-input-binding]${controlScopeSelector}`)
      .forEach((button) => {
        const hold = activeHolds.get(button);
        if (hold) {
          updateHoldProgress(button, hold, true);
          return;
        }
        const progress = controlBindings.get(button)?.holdSubmit?.progress;
        if (progress && button.dataset.gamePluginInputHoldPhase !== "complete") {
          applyHoldProgress(button, progress, null, "idle");
        }
      });
    return true;
  }

  function reset(): void {
    cancelAllHolds();
    restoreSuppressedHosts();
    values.clear();
    visitKey = "";
    renderModeKey = "";
    submitting = false;
    activeCollectionOptionIds.clear();
    document.querySelectorAll<HTMLElement>(`[data-game-plugin-input-binding]${controlScopeSelector}`).forEach((node) => {
      if (node instanceof HTMLButtonElement && node.dataset.gamePluginChoiceCollectionItem === "true") {
        clearCollectionControl(node);
      } else {
        if (node instanceof HTMLButtonElement) resetChoiceInteraction(node);
        node.remove();
      }
    });
  }

  return Object.freeze({ render, reset });
}
