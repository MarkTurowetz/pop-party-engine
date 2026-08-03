import { createGamePluginInputView } from "./gamePluginInputRuntime";

type Dict = Record<string, unknown>;

type ControllerInteractionManifest = {
  id: string;
  submission: Array<{ id: string; type: "choice" | "integer"; min?: number; max?: number; optionsSource?: string }>;
  controller: {
    layoutScope: "global" | "layer";
    layoutLayerId?: string;
    disclosure?: {
      triggerLayoutElementId: string;
      triggerLayoutScope?: "global" | "layer";
      triggerLayoutLayerId?: string;
      ariaLabel?: string;
    };
    bindings: Array<Dict>;
  };
};

function manifests(): ControllerInteractionManifest[] {
  const node = document.getElementById("pop-party-runtime-config");
  try {
    return (JSON.parse(node?.textContent || "{}")?.gamePlugin?.controllerInteractions || []) as ControllerInteractionManifest[];
  } catch {
    return [];
  }
}

function payloads(lobby: Dict): Dict[] {
  const gamePlugin = lobby.gamePlugin as Dict | undefined;
  return Array.isArray(gamePlugin?.controllerInteractions)
    ? gamePlugin.controllerInteractions as Dict[]
    : [];
}

export function createGamePluginControllerInteractionView(options: {
  applyLayoutForPhase: (phase: string, prepare?: () => void, options?: { preferRequestedState?: boolean }) => void;
  renderState: (lobby: Dict) => void;
  submit: (interactionId: string, visitId: number, payload: Dict, submissionId: string) => Promise<unknown>;
}) {
  type ViewRecord = {
    view: ReturnType<typeof createGamePluginInputView>;
    manifest: ControllerInteractionManifest;
    open: boolean;
    trigger: HTMLButtonElement | null;
    backdrop: HTMLButtonElement | null;
  };
  const views = new Map<string, ViewRecord>();

  function runtime(): Dict {
    return globalThis as typeof globalThis & Dict;
  }

  function layoutTarget(elementId: string, scope: string): HTMLElement | null {
    const rt = runtime();
    const element = (rt.controllerLayoutElementForId as ((id: string, requestedScope?: string) => Dict | null) | undefined)?.(elementId, scope);
    return element
      ? (rt.controllerLayoutTargetElement as ((element: Dict, scope?: string) => HTMLElement | null) | undefined)?.(element, scope) || null
      : null;
  }

  function layerTargets(manifest: ControllerInteractionManifest): HTMLElement[] {
    const layerId = String(manifest.controller.layoutLayerId || "");
    const layers = (runtime().controllerLayoutLayers as (() => Dict[]) | undefined)?.() || [];
    const layer = layers.find((candidate) => String(candidate.id || "") === layerId);
    return ((layer?.elements as Dict[]) || []).flatMap((element) => {
      const target = layoutTarget(String(element.id || ""), `layer:${layerId}`);
      return target ? [target] : [];
    });
  }

  function applyDisclosure(record: ViewRecord): void {
    const disclosure = record.manifest.controller.disclosure;
    if (!disclosure) return;
    const interactiveIds = new Set(record.manifest.controller.bindings.map((binding) => String(binding.layoutElementId || "")));
    for (const target of layerTargets(record.manifest)) {
      target.classList.toggle("controller-persistent-layout-hidden", !record.open);
      target.classList.toggle(
        "game-plugin-controller-interaction-decoration",
        !interactiveIds.has(String(target.dataset.controllerLayoutElementId || ""))
      );
      target.setAttribute("aria-hidden", record.open ? "false" : "true");
    }
    record.trigger?.setAttribute("aria-expanded", record.open ? "true" : "false");
    if (record.backdrop) record.backdrop.hidden = !record.open;
  }

  function closeDisclosure(record: ViewRecord): void {
    record.open = false;
    applyDisclosure(record);
  }

  function installDisclosure(record: ViewRecord): void {
    const disclosure = record.manifest.controller.disclosure;
    if (!disclosure) return;
    const triggerScope = disclosure.triggerLayoutScope === "layer"
      ? `layer:${String(disclosure.triggerLayoutLayerId || "")}`
      : "global";
    const host = layoutTarget(disclosure.triggerLayoutElementId, triggerScope);
    if (!host) return;
    if (!record.trigger || record.trigger.parentElement !== host) {
      record.trigger?.remove();
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "game-plugin-input-control game-plugin-action-button game-plugin-controller-interaction-trigger";
      trigger.dataset.gamePluginControllerInteractionTrigger = record.manifest.id;
      trigger.setAttribute("aria-label", String(disclosure.ariaLabel || "Open options"));
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.addEventListener("click", () => {
        record.open = !record.open;
        applyDisclosure(record);
      });
      host.appendChild(trigger);
      record.trigger = trigger;
    }
    record.trigger.hidden = false;
    delete record.trigger.dataset.layoutArtLegacyHidden;
    if (!record.backdrop) {
      const backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "game-plugin-controller-interaction-backdrop";
      backdrop.dataset.gamePluginControllerInteractionBackdrop = record.manifest.id;
      backdrop.setAttribute("aria-label", "Close options");
      backdrop.addEventListener("click", () => closeDisclosure(record));
      (document.querySelector<HTMLElement>(".controller-panel") || document.body).appendChild(backdrop);
      record.backdrop = backdrop;
    }
    const layerId = String(record.manifest.controller.layoutLayerId || "");
    const layer = ((runtime().controllerLayoutLayers as (() => Dict[]) | undefined)?.() || [])
      .find((candidate) => String(candidate.id || "") === layerId);
    record.backdrop.style.zIndex = String(Math.max(0, Number(layer?.zIndex || 0) - 1));
    applyDisclosure(record);
  }

  function disposeRecord(record: ViewRecord): void {
    for (const target of layerTargets(record.manifest)) target.classList.remove("game-plugin-controller-interaction-decoration");
    record.view.reset();
    record.trigger?.remove();
    record.backdrop?.remove();
  }

  function viewFor(manifest: ControllerInteractionManifest) {
    const existing = views.get(manifest.id);
    if (existing) return existing;
    const controlScope = `interaction:${manifest.id}`;
    const layoutScope = manifest.controller.layoutScope === "layer"
      ? `layer:${String(manifest.controller.layoutLayerId || "")}`
      : "global";
    const record = {
      view: null as unknown as ReturnType<typeof createGamePluginInputView>,
      manifest,
      open: false,
      trigger: null,
      backdrop: null
    } as ViewRecord;
    const view = createGamePluginInputView({
      applyLayoutForPhase: options.applyLayoutForPhase,
      hideViews() {},
      renderState: options.renderState,
      showView() {},
      submit: options.submit,
      manifestSource: () => manifests() as never,
      payloadForLobby: (lobby) => payloads(lobby).find((payload) => String(payload.id || "") === manifest.id) || null,
      controlScope,
      layoutScope,
      prepareLayout: false,
      retainControlsAcrossVisits: true,
      persistentSubmissions: true,
      onSubmitted: () => closeDisclosure(record)
    });
    record.view = view;
    views.set(manifest.id, record);
    return record;
  }

  function render(lobby: Dict): void {
    const available = new Map(payloads(lobby).map((payload) => [String(payload.id || ""), payload]));
    for (const [id, record] of views) {
      if (!available.has(id)) {
        disposeRecord(record);
        views.delete(id);
      }
    }
    for (const manifest of manifests()) {
      if (!available.has(manifest.id)) continue;
      const record = viewFor(manifest);
      record.view.render(lobby);
      installDisclosure(record);
      document.querySelectorAll<HTMLElement>(`[data-game-plugin-input-scope="${CSS.escape(`interaction:${manifest.id}`)}"]`)
        .forEach((control) => {
          control.dataset.gamePluginControllerInteraction = manifest.id;
        });
    }
  }

  function reset(): void {
    for (const record of views.values()) disposeRecord(record);
    views.clear();
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const record of views.values()) closeDisclosure(record);
  });

  return Object.freeze({ render, reset });
}
