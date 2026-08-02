import {
  choiceCollectionItemDimensions,
  choiceCollectionLayoutStyle
} from "./controllerChoiceCollectionLayout";

type Dict = Record<string, unknown>;
type RendererBinding = {
  id: string;
  kind: "collection" | "component" | "state" | "text";
  source: string;
  targetComponentId?: string;
  property?: string;
  playback?: "play" | "stop";
  fallback?: unknown;
  item?: {
    keySource: string;
    artCompositionId: string;
    bindings: RendererBinding[];
  };
};
type PluginRendererManifest = {
  id: string;
  surface: "stage" | "controller";
  target: {
    kind?: "layout";
    layoutElementId: string;
    layoutScope: "moment" | "global" | "layer";
    layoutLayerId?: string;
  } | {
    kind: "rosterItem";
    semanticRole: "engine.stage.playerIdentityWidget";
    source: string;
    playerIdSource: string;
  };
  bindings: RendererBinding[];
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
const collectionStateByRoot = new WeakMap<HTMLElement, { manifestId: string; surface: "stage" | "controller" }>();
const lifecycleStateByItem = new WeakMap<HTMLElement, Map<string, string>>();
const rosterManifestSignaturesByTile = new WeakMap<HTMLElement, Map<string, string>>();

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

function compositionForSurface(surface: "stage" | "controller", compositionId: string, runtime: Dict): Dict | null {
  const composition = (((runtime.artCompositions as Dict[]) || [])).find((candidate) => String(candidate.id || "") === compositionId) || null;
  if (!composition) return null;
  return String(composition.surface || "").toLowerCase() === surface
    && String(composition.compositionKind || "gameObject").toLowerCase() === "gameobject"
    ? composition
    : null;
}

function componentInComposition(composition: Dict | null, componentId: string, runtime: Dict, visited = new Set<string>()): Dict | null {
  if (!composition || !componentId) return null;
  const compositionId = String(composition.id || "");
  if (compositionId && visited.has(compositionId)) return null;
  const nextVisited = new Set(visited);
  if (compositionId) nextVisited.add(compositionId);
  const visit = (components: Dict[]): Dict | null => {
    for (const component of components) {
      if ([component.id, component.instanceLabel, component.name].some((value) => String(value || "") === componentId)) return component;
      const nested = visit((component.children as Dict[]) || []);
      if (nested) return nested;
      if (String(component.kind || "").toLowerCase() === "reference") {
        const referenced = (((runtime.artCompositions as Dict[]) || [])).find((candidate) => String(candidate.id || "") === String(component.artCompositionId || "")) || null;
        const match = componentInComposition(referenced, componentId, runtime, nextVisited);
        if (match) return match;
      }
    }
    return null;
  };
  return visit((composition.components as Dict[]) || []);
}

function collectionLayoutFromArtContainer(component: Dict): Dict {
  return {
    width: Number(component.width || 1),
    height: Number(component.height || 1),
    collectionDirection: String(component.childDistribution || "horizontal").toLowerCase() === "vertical" ? "vertical" : "horizontal",
    collectionDistribution: "start",
    collectionAlignment: "center",
    collectionGap: 0,
    collectionPadding: 0,
    collectionOverflow: "visible"
  };
}

function rendererForSurface(surface: "stage" | "controller", runtime: Dict) {
  return surface === "stage"
    ? runtime.renderStageArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown)
    : runtime.renderControllerArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown);
}

function clearRendererItem(surface: "stage" | "controller", item: HTMLElement, runtime: Dict): void {
  const nodes = [item, ...Array.from(item.querySelectorAll<HTMLElement>("[data-game-plugin-renderer-key]"))];
  for (const node of nodes.reverse()) {
    const key = node.dataset.gamePluginRendererKey || "";
    if (!key) continue;
    const clear = surface === "stage"
      ? runtime.clearStageArtInstanceRenderer as ((id: string, host: HTMLElement) => void)
      : runtime.clearControllerArtInstanceRenderer as ((id: string, host: HTMLElement) => void);
    clear?.(key, node);
  }
  item.remove();
}

export function clearGamePluginRendererCollectionHost(
  surface: "stage" | "controller",
  host: HTMLElement
): void {
  const runtime = globalThis as typeof globalThis & Dict;
  for (const child of Array.from(host.querySelectorAll<HTMLElement>(":scope > [data-game-plugin-renderer-collection-item='true']"))) {
    clearRendererItem(surface, child, runtime);
  }
  collectionStateByRoot.delete(host);
}

function bindingOverrides(bindings: RendererBinding[], model: unknown): { textOverrides: Dict; componentOverrides: Dict } {
  const textOverrides: Dict = {};
  const componentOverrides: Dict = {};
  for (const binding of bindings) {
    if (binding.kind !== "text" && binding.kind !== "component") continue;
    const selected = propertyPathValue(model, binding.source);
    const value = selected === undefined ? binding.fallback : selected;
    if (binding.kind === "text" && binding.targetComponentId) {
      textOverrides[binding.targetComponentId] = String(value ?? "");
    } else if (binding.targetComponentId && binding.property && SAFE_COMPONENT_PROPERTIES.has(binding.property)) {
      const existing = (componentOverrides[binding.targetComponentId] as Dict | undefined) || {};
      componentOverrides[binding.targetComponentId] = { ...existing, [binding.property]: value };
    }
  }
  return { textOverrides, componentOverrides };
}

function applyLifecycleBindings(bindings: RendererBinding[], model: unknown, itemHost: HTMLElement, renderer: unknown, namespace = ""): void {
  const player = renderer as {
    playAll?: (state: string, options?: Dict) => number;
    stopAtAll?: (state: string, options?: Dict) => number;
    playComponent?: (id: string, state: string, options?: Dict) => number;
    stopAtComponent?: (id: string, state: string, options?: Dict) => number;
  } | null;
  if (!player) return;
  const previous = lifecycleStateByItem.get(itemHost) || new Map<string, string>();
  for (const binding of bindings.filter((candidate) => candidate.kind === "state")) {
    const selected = propertyPathValue(model, binding.source);
    const state = String(selected === undefined ? binding.fallback ?? "" : selected).trim();
    const stateKey = namespace ? `${namespace}:${binding.id}` : binding.id;
    if (!state) {
      previous.delete(stateKey);
      continue;
    }
    if (previous.get(stateKey) === state) continue;
    previous.set(stateKey, state);
    itemHost.dataset.gamePluginRendererState = state;
    const stop = binding.playback === "stop";
    if (binding.targetComponentId) {
      (stop ? player.stopAtComponent : player.playComponent)?.call(player, binding.targetComponentId, state, { instant: stop });
    } else {
      (stop ? player.stopAtAll : player.playAll)?.call(player, state, { instant: stop });
    }
  }
  lifecycleStateByItem.set(itemHost, previous);
}

function reconcileRendererCollection(options: {
  surface: "stage" | "controller";
  manifestId: string;
  binding: RendererBinding;
  model: unknown;
  host: HTMLElement;
  layout: Dict;
  runtime: Dict;
  path: string;
}): void {
  const { surface, manifestId, binding, model, host, layout, runtime, path } = options;
  const definition = binding.item;
  if (!definition) return;
  Object.assign(host.style, choiceCollectionLayoutStyle(layout));
  host.classList.add("game-plugin-renderer-collection", `${surface}-renderer-collection`);
  const selected = propertyPathValue(model, binding.source);
  const items = (selected === undefined ? binding.fallback : selected) as unknown;
  const models = Array.isArray(items) ? items.filter((item): item is Dict => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  const keys = models.map((item) => String(propertyPathValue(item, definition.keySource) ?? ""));
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
    for (const child of Array.from(host.querySelectorAll<HTMLElement>(":scope > [data-game-plugin-renderer-collection-item='true']"))) clearRendererItem(surface, child, runtime);
    host.dataset.gamePluginRendererCollectionInvalid = "true";
    return;
  }
  delete host.dataset.gamePluginRendererCollectionInvalid;
  const existing = new Map(Array.from(host.querySelectorAll<HTMLElement>(":scope > [data-game-plugin-renderer-collection-item='true']"))
    .map((node) => [node.dataset.gamePluginRendererItemKey || "", node]));
  const composition = compositionForSurface(surface, definition.artCompositionId, runtime);
  if (!composition) return;
  const dimensions = choiceCollectionItemDimensions(layout, composition, models.length);
  const active = new Set(keys);
  for (const [key, node] of existing) if (!active.has(key)) clearRendererItem(surface, node, runtime);
  const render = rendererForSurface(surface, runtime);
  for (let index = 0; index < models.length; index += 1) {
    const itemModel = models[index];
    const itemKey = keys[index];
    let itemHost = existing.get(itemKey);
    if (!itemHost || !itemHost.isConnected) {
      itemHost = document.createElement("div");
      itemHost.className = `game-plugin-renderer-collection-item ${surface}-widget-art-host`;
      itemHost.dataset.gamePluginRendererCollectionItem = "true";
      itemHost.dataset.gamePluginRendererItemKey = itemKey;
    }
    itemHost.style.position = "relative";
    itemHost.style.width = `${dimensions.width}px`;
    itemHost.style.height = `${dimensions.height}px`;
    itemHost.style.flex = "0 0 auto";
    itemHost.style.minWidth = "0";
    host.appendChild(itemHost);
    const rendererKey = `plugin-renderer:${surface}:${manifestId}:${path}:${itemKey}`;
    itemHost.dataset.gamePluginRendererKey = rendererKey;
    const overrides = bindingOverrides(definition.bindings, itemModel);
    const renderer = render?.({
      id: rendererKey,
      kind: "art",
      artCompositionId: definition.artCompositionId,
      width: dimensions.width,
      height: dimensions.height,
      scale: 1,
      defaultAnimationState: ""
    }, itemHost, rendererKey, overrides);
    applyLifecycleBindings(definition.bindings, itemModel, itemHost, renderer);
    for (const nested of definition.bindings.filter((candidate) => candidate.kind === "collection" && candidate.targetComponentId)) {
      const component = componentInComposition(composition, String(nested.targetComponentId), runtime);
      const target = itemHost.querySelector<HTMLElement>(`[data-art-component-id="${CSS.escape(String(component?.id || nested.targetComponentId))}"]`);
      if (!component || String(component.kind || "").toLowerCase() !== "container" || !target) continue;
      let nestedHost = target.querySelector<HTMLElement>(`:scope > [data-game-plugin-renderer-nested-collection="${CSS.escape(nested.id)}"]`);
      if (!nestedHost) {
        nestedHost = document.createElement("div");
        nestedHost.dataset.gamePluginRendererNestedCollection = nested.id;
        nestedHost.style.position = "absolute";
        nestedHost.style.inset = "0";
        nestedHost.style.width = "100%";
        nestedHost.style.height = "100%";
        nestedHost.style.zIndex = "1";
        target.appendChild(nestedHost);
      }
      reconcileRendererCollection({
        surface,
        manifestId,
        binding: nested,
        model: itemModel,
        host: nestedHost,
        layout: collectionLayoutFromArtContainer(component),
        runtime,
        path: `${path}:${itemKey}:${nested.id}`
      });
    }
  }
}

function surfaceElement(
  surface: "stage" | "controller",
  manifest: PluginRendererManifest,
  runtime: Dict
): Dict | null {
  if (manifest.target.kind === "rosterItem") return null;
  const layoutTarget = manifest.target as Extract<PluginRendererManifest["target"], { kind?: "layout" }>;
  const id = layoutTarget.layoutElementId;
  const scope = layoutTarget.layoutScope || "moment";
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
    : scope === "layer"
      ? ((((runtime.controllerLayouts as Dict | undefined)?.layers as Dict[]) || [])
          .find((layer) => String(layer.id || "") === String(layoutTarget.layoutLayerId || ""))?.elements as Dict[]) || []
      : ((runtime.controllerLayoutState as ((id: string) => Dict))?.(String(runtime.currentControllerLayoutStateId || ""))?.elements as Dict[]) || [];
  return source.find((element) => String(element.id || "") === id)
    || (runtime.controllerLayoutElementForId as ((elementId: string) => Dict | null))?.(id)
    || null;
}

type RosterRenderer = {
  applyRendererExtension?: (
    manifestId: string,
    playerId: string,
    overrides: { textOverrides: Dict; componentOverrides: Dict }
  ) => { tile: HTMLElement; host: HTMLElement; renderer: unknown; composition: Dict; player: Dict } | null;
};

function renderRosterItemManifest(
  manifest: PluginRendererManifest,
  model: unknown,
  lobby: Dict,
  runtime: Dict,
  rosterRenderer: RosterRenderer | null
): void {
  if (manifest.target.kind !== "rosterItem" || !rosterRenderer?.applyRendererExtension) return;
  const selected = propertyPathValue(model, manifest.target.source);
  const models = Array.isArray(selected)
    ? selected.filter((item): item is Dict => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  const modelsByPlayerId = new Map<string, Dict>();
  let invalid = false;
  for (const item of models) {
    const playerId = String(propertyPathValue(item, manifest.target.playerIdSource) ?? "").trim();
    if (!playerId || modelsByPlayerId.has(playerId)) {
      invalid = true;
      break;
    }
    modelsByPlayerId.set(playerId, item);
  }
  const publicPlayerIds = new Set((((lobby.players as Dict[]) || [])).map((player) => String(player.id || "")));
  if (Array.from(modelsByPlayerId.keys()).some((playerId) => !publicPlayerIds.has(playerId))) invalid = true;
  for (const playerId of publicPlayerIds) {
    const itemModel = invalid ? null : modelsByPlayerId.get(playerId) || null;
    const overrides = bindingOverrides(manifest.bindings, itemModel);
    const item = rosterRenderer.applyRendererExtension(manifest.id, playerId, overrides);
    if (!item) continue;
    let manifestSignatures = rosterManifestSignaturesByTile.get(item.tile);
    if (!manifestSignatures) {
      manifestSignatures = new Map();
      rosterManifestSignaturesByTile.set(item.tile, manifestSignatures);
    }
    const signature = JSON.stringify({ invalid, itemModel });
    if (manifestSignatures.get(manifest.id) === signature) continue;
    manifestSignatures.set(manifest.id, signature);
    item.tile.dataset.gamePluginRosterRenderer = manifest.id;
    item.tile.toggleAttribute("data-game-plugin-roster-renderer-invalid", invalid);
    applyLifecycleBindings(manifest.bindings, itemModel, item.host, item.renderer, manifest.id);
    for (const collection of manifest.bindings.filter((binding) => binding.kind === "collection" && binding.targetComponentId)) {
      const component = componentInComposition(item.composition, String(collection.targetComponentId), runtime);
      const target = item.host.querySelector<HTMLElement>(`[data-art-component-id="${CSS.escape(String(component?.id || collection.targetComponentId))}"]`);
      if (!component || String(component.kind || "").toLowerCase() !== "container" || !target) continue;
      let collectionHost = target.querySelector<HTMLElement>(`:scope > [data-game-plugin-roster-collection="${CSS.escape(`${manifest.id}:${collection.id}`)}"]`);
      if (!collectionHost) {
        collectionHost = document.createElement("div");
        collectionHost.dataset.gamePluginRosterCollection = `${manifest.id}:${collection.id}`;
        collectionHost.style.position = "absolute";
        collectionHost.style.inset = "0";
        collectionHost.style.width = "100%";
        collectionHost.style.height = "100%";
        collectionHost.style.zIndex = "1";
        target.appendChild(collectionHost);
      }
      reconcileRendererCollection({
        surface: "stage",
        manifestId: manifest.id,
        binding: collection,
        model: itemModel,
        host: collectionHost,
        layout: collectionLayoutFromArtContainer(component),
        runtime,
        path: `roster:${playerId}:${collection.id}`
      });
    }
  }
}

export function renderGamePluginSurface(
  surface: "stage" | "controller",
  lobby: Dict,
  documentRef: Document = document,
  options: { playerRosterRenderer?: RosterRenderer | null } = {}
): void {
  const runtime = globalThis as typeof globalThis & Dict;
  const manifests = runtimeConfig(documentRef).gamePlugin?.renderers || [];
  const viewModels = ((lobby.gamePlugin as Dict | undefined)?.viewModels as Dict | undefined) || {};
  for (const manifest of manifests) {
    if (manifest.surface !== surface) continue;
    const model = viewModels[manifest.id];
    if (surface === "stage" && manifest.target.kind === "rosterItem") {
      renderRosterItemManifest(manifest, model, lobby, runtime, options.playerRosterRenderer || null);
      continue;
    }
    if (manifest.target.kind === "rosterItem") continue;
    const layoutTarget = manifest.target as Extract<PluginRendererManifest["target"], { kind?: "layout" }>;
    const element = surfaceElement(surface, manifest, runtime);
    if (!element) continue;
    const targetScope = layoutTarget.layoutScope === "layer"
      ? `layer:${layoutTarget.layoutLayerId || ""}`
      : layoutTarget.layoutScope;
    const target = surface === "stage"
      ? (runtime.stageLayoutTargetElement as ((item: Dict) => HTMLElement | null))?.(element)
      : (runtime.controllerLayoutTargetByElementId as ((id: string, scope?: string) => HTMLElement | null))?.(
          String(element.id || ""),
          targetScope
        ) || (runtime.controllerLayoutTargetElement as ((item: Dict, scope?: string) => HTMLElement | null))?.(element, targetScope);
    if (!target) continue;
    const collectionBinding = manifest.bindings.find((binding) => binding.kind === "collection");
    if (collectionBinding) {
      collectionStateByRoot.set(target, { manifestId: manifest.id, surface });
      reconcileRendererCollection({
        surface,
        manifestId: manifest.id,
        binding: collectionBinding,
        model,
        host: target,
        layout: element,
        runtime,
        path: collectionBinding.id
      });
      continue;
    }
    const { textOverrides, componentOverrides } = bindingOverrides(manifest.bindings, model);
    const render = surface === "stage"
      ? runtime.renderStageArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown)
      : runtime.renderControllerArtInstance as ((item: Dict, host: HTMLElement, key: string, options: Dict) => unknown);
    const key = surface === "stage"
      ? String(target.dataset.stageLayoutVisibilityKey || element.id || manifest.id)
      : String(target.dataset.controllerLayoutVisibilityKey || element.id || manifest.id);
    const renderer = render?.(element, target, key, { textOverrides, componentOverrides });
    applyLifecycleBindings(manifest.bindings, model, target, renderer);
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
