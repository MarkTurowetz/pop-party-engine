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
  applyLayoutForPhase: (phase: string, prepare?: () => void) => void;
  hideViews: () => void;
  renderState: (lobby: Dict) => void;
  showView: (viewId: string) => unknown;
  submit: (actionId: string, visitId: number, payload: Dict, submissionId: string) => Promise<unknown>;
}) {
  const values = new Map<string, unknown>();
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
      { textOverrides: { [binding.targetComponentId]: String(propertyPathValue(model, binding.source || "") ?? "") } }
    );
  }

  function addControl(binding: InputBinding, input: Dict, model: unknown, submitNow: () => void): void {
    const target = targetFor(binding.layoutElementId);
    if (!target) return;
    target.host.querySelectorAll(`[data-game-plugin-input-binding="${CSS.escape(binding.id)}"]`).forEach((node) => node.remove());
    if (binding.kind === "text") {
      renderText(binding, model);
      return;
    }
    if (binding.kind === "integer") {
      const definition = (input.manifest as InputManifest).submission.find((field) => field.id === binding.field);
      const field = document.createElement("input");
      field.type = "number";
      field.className = "game-plugin-input-control game-plugin-integer-input";
      field.dataset.gamePluginInputBinding = binding.id;
      field.min = String(definition?.min ?? "");
      field.max = String(definition?.max ?? "");
      field.step = "1";
      field.inputMode = "numeric";
      field.disabled = input.submitted === true;
      field.addEventListener("input", () => values.set(String(binding.field || ""), Number(field.value)));
      target.host.appendChild(field);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "game-plugin-input-control game-plugin-action-button";
    button.dataset.gamePluginInputBinding = binding.id;
    button.disabled = input.submitted === true;
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
      button.addEventListener("click", () => {
        values.set(String(binding.field || ""), optionId);
        if (binding.autoSubmit === true) submitNow();
      });
    } else {
      button.setAttribute("aria-label", String(propertyPathValue(model, binding.labelSource || "") || "Submit"));
      button.addEventListener("click", submitNow);
    }
    target.host.appendChild(button);
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
    options.applyLayoutForPhase(layoutStateId, () => {});
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
