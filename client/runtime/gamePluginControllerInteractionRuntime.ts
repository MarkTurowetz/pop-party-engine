import { createGamePluginInputView } from "./gamePluginInputRuntime";

type Dict = Record<string, unknown>;

type ControllerInteractionManifest = {
  id: string;
  submission: Array<{ id: string; type: "choice" | "integer"; min?: number; max?: number; optionsSource?: string }>;
  controller: {
    layoutScope: "global" | "layer";
    layoutLayerId?: string;
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
  const views = new Map<string, ReturnType<typeof createGamePluginInputView>>();

  function viewFor(manifest: ControllerInteractionManifest) {
    const existing = views.get(manifest.id);
    if (existing) return existing;
    const controlScope = `interaction:${manifest.id}`;
    const layoutScope = manifest.controller.layoutScope === "layer"
      ? `layer:${String(manifest.controller.layoutLayerId || "")}`
      : "global";
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
      retainControlsAcrossVisits: true
    });
    views.set(manifest.id, view);
    return view;
  }

  function render(lobby: Dict): void {
    const available = new Map(payloads(lobby).map((payload) => [String(payload.id || ""), payload]));
    for (const [id, view] of views) {
      if (!available.has(id)) {
        view.reset();
        views.delete(id);
      }
    }
    for (const manifest of manifests()) {
      if (!available.has(manifest.id)) continue;
      viewFor(manifest).render(lobby);
      document.querySelectorAll<HTMLElement>(`[data-game-plugin-input-scope="${CSS.escape(`interaction:${manifest.id}`)}"]`)
        .forEach((control) => {
          control.dataset.gamePluginControllerInteraction = manifest.id;
        });
    }
  }

  function reset(): void {
    for (const view of views.values()) view.reset();
    views.clear();
  }

  return Object.freeze({ render, reset });
}
