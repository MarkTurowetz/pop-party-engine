type Dict = Record<string, unknown>;
type PluginRendererManifest = {
  id: string;
  surface: "stage" | "controller";
  target: { layoutElementId: string; layoutScope: "moment" | "global" };
  bindings: Array<{
    id: string;
    kind: "text" | "component";
    source: string;
    targetComponentId: string;
    property?: string;
    fallback?: unknown;
  }>;
};

interface RuntimeConfig {
  gamePlugin?: {
    actionRunners?: Array<{ actionId: string; type: string; runner: string }>;
    renderers?: PluginRendererManifest[];
  };
}

const SAFE_COMPONENT_PROPERTIES = new Set([
  "defaultText",
  "fill",
  "imageTint",
  "isShown",
  "opacity",
  "rotation",
  "scale"
]);

function runtimeConfig(documentRef: Document | undefined): RuntimeConfig {
  const node = documentRef?.getElementById("pop-party-runtime-config");
  if (!node?.textContent) return {};
  try {
    return JSON.parse(node.textContent) as RuntimeConfig;
  } catch {
    return {};
  }
}

function propertyPathValue(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of String(path || "").split(".").filter(Boolean)) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Dict)[segment];
  }
  return current;
}

function surfaceElement(
  surface: "stage" | "controller",
  manifest: PluginRendererManifest,
  runtime: Dict
): Dict | null {
  const id = manifest.target.layoutElementId;
  const scope = manifest.target.layoutScope || "moment";
  if (surface === "stage") {
    const source = scope === "global"
      ? ((runtime.globalStageLayout as (() => Dict))?.()?.elements as Dict[]) || []
      : ((runtime.stageLayoutState as ((id: string) => Dict))?.(String(runtime.currentStageLayoutStateId || ""))?.elements as Dict[]) || [];
    return source.find((element) => String(element.id || "") === id)
      || (runtime.stageLayoutElementForId as ((elementId: string) => Dict | null))?.(id)
      || null;
  }
  const source = scope === "global"
    ? ((runtime.globalControllerLayout as (() => Dict))?.()?.elements as Dict[]) || []
    : ((runtime.controllerLayoutState as ((id: string) => Dict))?.(String(runtime.currentControllerLayoutStateId || ""))?.elements as Dict[]) || [];
  return source.find((element) => String(element.id || "") === id)
    || (runtime.controllerLayoutElementForId as ((elementId: string) => Dict | null))?.(id)
    || null;
}

export function renderGamePluginSurface(
  surface: "stage" | "controller",
  lobby: Dict,
  documentRef: Document = document
): void {
  const runtime = globalThis as typeof globalThis & Dict;
  const manifests = runtimeConfig(documentRef).gamePlugin?.renderers || [];
  const viewModels = ((lobby.gamePlugin as Dict | undefined)?.viewModels as Dict | undefined) || {};
  for (const manifest of manifests) {
    if (manifest.surface !== surface) continue;
    const element = surfaceElement(surface, manifest, runtime);
    if (!element) continue;
    const target = surface === "stage"
      ? (runtime.stageLayoutTargetElement as ((item: Dict) => HTMLElement | null))?.(element)
      : (runtime.controllerLayoutTargetElement as ((item: Dict) => HTMLElement | null))?.(element);
    if (!target) continue;
    const model = viewModels[manifest.id];
    const textOverrides: Dict = {};
    const componentOverrides: Dict = {};
    for (const binding of manifest.bindings) {
      const selected = propertyPathValue(model, binding.source);
      const value = selected === undefined ? binding.fallback : selected;
      if (binding.kind === "text") {
        textOverrides[binding.targetComponentId] = String(value ?? "");
        continue;
      }
      if (!binding.property || !SAFE_COMPONENT_PROPERTIES.has(binding.property)) continue;
      const existing = (componentOverrides[binding.targetComponentId] as Dict | undefined) || {};
      componentOverrides[binding.targetComponentId] = { ...existing, [binding.property]: value };
    }
    const render = surface === "stage"
      ? runtime.renderStageArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown)
      : runtime.renderControllerArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown);
    const key = surface === "stage"
      ? String(target.dataset.stageLayoutVisibilityKey || element.id || manifest.id)
      : String(target.dataset.controllerLayoutVisibilityKey || element.id || manifest.id);
    render?.(element, target, key, { textOverrides, componentOverrides });
  }
}

export function gamePluginActionRunnerDefinitions(
  documentRef: Document | undefined = typeof document !== "undefined" ? document : undefined
): Array<{
  actionId: string;
  type: string;
  runner: string;
}> {
  return runtimeConfig(documentRef).gamePlugin?.actionRunners || [];
}
