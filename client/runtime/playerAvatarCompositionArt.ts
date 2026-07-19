type Dict = Record<string, unknown>;

export interface PlayerAvatarArtComposition extends Dict {
  id?: string;
  canvas?: { width?: number; height?: number; minX?: number; minY?: number };
  components?: Dict[];
  timeline?: {
    labels?: Array<{ name?: string; frame?: number }>;
    tracks?: Array<{ targetId?: string; keyframes?: Array<{ frame?: number; props?: Dict }> }>;
  };
}

export interface PlayerAvatarCompositionArtOptions {
  shape?: string;
  getComposition(id: string): PlayerAvatarArtComposition | null;
  assetUrl(assetId: string): string;
  normalizeComponentKind?(kind?: string): string;
  normalizeShapeStyle?(style?: string, kind?: string): string;
}

export const PLAYER_AVATAR_MC_COMPOSITION_ID = "prefab-player-avatar-mc";
export const AVATARS_COMPOSITION_ID = "avatars";

function number(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function cssUrl(url?: string): string {
  return `url('${String(url || "").replaceAll("'", "%27")}')`;
}

export function avatarTimelineLabelForSpecies(shape?: unknown): string {
  const species = String(shape || "rex").trim().toLowerCase();
  const labels: Record<string, string> = {
    rex: "Rex",
    stego: "Stego",
    trike: "Trike",
    raptor: "Raptor",
    bronto: "Bronto",
    ankylo: "Cleo"
  };
  return labels[species] || labels.rex;
}

function updateComponentTree(components: Dict[], targetId: string, props: Dict): Dict[] {
  return components.map((component) => ({
    ...component,
    ...(String(component.id || "") === targetId ? props : {}),
    children: Array.isArray(component.children)
      ? updateComponentTree(component.children as Dict[], targetId, props)
      : component.children
  }));
}

export function artCompositionAtLabel(
  composition: PlayerAvatarArtComposition,
  label: string
): PlayerAvatarArtComposition {
  const timeline = composition.timeline;
  if (!timeline) return composition;
  const matchingLabel = (timeline.labels || []).find(
    (entry) => String(entry.name || "").trim().toLowerCase() === String(label || "").trim().toLowerCase()
  );
  const frame = number(matchingLabel?.frame, 0);
  let components = (composition.components || []).map((component) => structuredClone(component));
  for (const track of timeline.tracks || []) {
    const targetId = String(track.targetId || "");
    if (!targetId) continue;
    const keyframe = [...(track.keyframes || [])]
      .filter((entry) => number(entry.frame, 0) <= frame)
      .sort((left, right) => number(right.frame, 0) - number(left.frame, 0))[0];
    if (keyframe?.props) components = updateComponentTree(components, targetId, keyframe.props);
  }
  return { ...composition, components };
}

interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function compositionBounds(composition: PlayerAvatarArtComposition): Bounds {
  return {
    minX: 0,
    minY: 0,
    width: Math.max(1, number(composition.canvas?.width, 1)),
    height: Math.max(1, number(composition.canvas?.height, 1))
  };
}

function componentStyle(component: Dict, bounds: Bounds, layerIndex: number, siblingCount: number): string {
  return [
    `z-index:${Math.max(1, siblingCount - layerIndex)}`,
    `left:${((number(component.x, 0) - bounds.minX) / bounds.width) * 100}%`,
    `top:${((number(component.y, 0) - bounds.minY) / bounds.height) * 100}%`,
    `width:${(number(component.width, 1) / bounds.width) * 100}%`,
    `height:${(number(component.height, 1) / bounds.height) * 100}%`,
    `transform:translate(-50%, -50%) rotate(${number(component.rotation, 0)}deg) scale(${number(component.scale, 1)})`,
    `opacity:${number(component.opacity, 1)}`,
    `filter:brightness(${Math.max(0, number(component.brightness, 1))})`,
    component.visible === false ? "display:none" : "",
    `--avatar-component-fit:${component.imageObjectFit || "contain"}`,
    `--avatar-component-fill:${component.fillCss || component.fillColor || "transparent"}`,
    `--avatar-component-border-color:${component.borderColor || "transparent"}`,
    `--avatar-component-border-width:${number(component.borderWidth, 0)}px`,
    `--avatar-component-border-radius:${number(component.borderRadius, 0)}px`,
    `--avatar-component-tint:${component.imageTint || "currentColor"}`
  ].filter(Boolean).join(";");
}

function renderLeaf(component: Dict, style: string, options: PlayerAvatarCompositionArtOptions): string {
  const kind = options.normalizeComponentKind?.(component.kind as string) || String(component.kind || "shape");
  const shapeStyle = options.normalizeShapeStyle?.(component.shapeStyle as string, kind) || String(component.shapeStyle || "rounded");
  const imageSource = String(component.imageDataUrl || options.assetUrl(String(component.imageAssetId || "")) || "");
  const tinted = kind === "sprite" && component.spriteRenderMode === "tinted" && Boolean(imageSource);
  const classes = `avatar-art-component is-${kind} is-style-${shapeStyle}${imageSource ? " has-sprite-source" : ""}${tinted ? " is-sprite-tinted" : ""}`;
  if (tinted) {
    return `<span class="${classes}" style="${style};--avatar-mask-url:${cssUrl(imageSource)}"><span class="avatar-art-mask-image"></span></span>`;
  }
  if (imageSource) {
    return `<span class="${classes}" style="${style}"><img class="avatar-art-image" alt="" draggable="false" src="${imageSource}"></span>`;
  }
  return `<span class="${classes}" style="${style}"></span>`;
}

function renderCompositionComponents(
  composition: PlayerAvatarArtComposition,
  options: PlayerAvatarCompositionArtOptions,
  visited: Set<string>
): string {
  const components = composition.components || [];
  const bounds = compositionBounds(composition);
  return components.map((component, index) => {
    const kind = options.normalizeComponentKind?.(component.kind as string) || String(component.kind || "shape");
    const referencedId = kind === "reference" ? String(component.artCompositionId || "") : "";
    const referenced = referencedId && !visited.has(referencedId) ? options.getComposition(referencedId) : null;
    const intrinsicComponent = referenced
      ? {
          ...component,
          width: component.width ?? referenced.canvas?.width ?? 1,
          height: component.height ?? referenced.canvas?.height ?? 1
        }
      : component;
    const style = componentStyle(intrinsicComponent, bounds, index, components.length);
    if (!referencedId || visited.has(referencedId) || !referenced) return renderLeaf(component, style, options);
    const label = referencedId === AVATARS_COMPOSITION_ID
      ? avatarTimelineLabelForSpecies(options.shape)
      : String(component.defaultAnimationState || "");
    const resolved = label ? artCompositionAtLabel(referenced, label) : referenced;
    const children = renderCompositionComponents(resolved, options, new Set([...visited, referencedId]));
    return `<span class="avatar-art-component is-reference" style="${style}">${children}</span>`;
  }).join("");
}

export function playerAvatarCompositionArt(options: PlayerAvatarCompositionArtOptions): string | null {
  const composition = options.getComposition(PLAYER_AVATAR_MC_COMPOSITION_ID);
  if (!composition) return null;
  const components = renderCompositionComponents(composition, options, new Set([PLAYER_AVATAR_MC_COMPOSITION_ID]));
  return `<span class="player-avatar-art-composition" data-player-avatar-source="${PLAYER_AVATAR_MC_COMPOSITION_ID}">${components}</span>`;
}
