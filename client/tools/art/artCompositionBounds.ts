import type { ArtComponent, ArtComposition } from "../../types/game-data";

export interface ArtBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ArtCompositionBoundsOptions {
  padding?: number;
}

export interface ArtCompositionContentBoundsOptions {
  targetPath?: string[];
  timelineFrameOverrides?: Record<string, Record<string, unknown>> | null;
}

type ArtCompositionResolver = (id: string) => ArtComposition | null;

function num(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function bounds(minX: number, minY: number, maxX: number, maxY: number): ArtBounds {
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function expand(base: ArtBounds | null, next: ArtBounds | null): ArtBounds | null {
  if (!next) return base;
  if (!base) return next;
  return bounds(
    Math.min(base.minX, next.minX),
    Math.min(base.minY, next.minY),
    Math.max(base.maxX, next.maxX),
    Math.max(base.maxY, next.maxY)
  );
}

function componentBox(component: ArtComponent): ArtBounds {
  const width = Math.max(1, num(component.width, 1));
  const height = Math.max(1, num(component.height, 1));
  const scale = Math.max(0.001, num(component.scale, 1));
  const rotation = (num(component.rotation, 0) * Math.PI) / 180;
  const halfW = (width * scale) / 2;
  const halfH = (height * scale) / 2;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const radiusX = cos * halfW + sin * halfH;
  const radiusY = sin * halfW + cos * halfH;
  const x = num(component.x, 0);
  const y = num(component.y, 0);
  return bounds(x - radiusX, y - radiusY, x + radiusX, y + radiusY);
}

function referencedCompositionFor(
  component: ArtComponent,
  resolveComposition: ArtCompositionResolver,
  referencePath: Set<string>
): ArtComposition | null {
  if (component.kind !== "reference") return null;
  const id = String(component.artCompositionId || "");
  if (!id || referencePath.has(id)) return null;
  return resolveComposition(id);
}

function translateBounds(source: ArtBounds, left: number, top: number, scaleX = 1, scaleY = 1): ArtBounds {
  return bounds(
    left + source.minX * scaleX,
    top + source.minY * scaleY,
    left + source.maxX * scaleX,
    top + source.maxY * scaleY
  );
}

function componentsBounds(
  components: ArtComponent[],
  resolveComposition: ArtCompositionResolver,
  referencePath: Set<string>,
  contentOnly = false,
  options: ArtCompositionContentBoundsOptions = {},
  targetPath: string[] = options.targetPath || []
): ArtBounds | null {
  return components.reduce<ArtBounds | null>(
    (current, component) => {
      const componentPath = [...targetPath, String(component.id || "").trim()].filter(Boolean);
      return expand(current, componentBounds(component, resolveComposition, referencePath, contentOnly, options, componentPath));
    },
    null
  );
}

function transformedReferenceBounds(source: ArtBounds, component: ArtComponent, canvas: { width?: number; height?: number } | null | undefined): ArtBounds {
  const canvasWidth = Math.max(1, num(canvas?.width, 1));
  const canvasHeight = Math.max(1, num(canvas?.height, 1));
  const width = Math.max(1, num(component.width, 1));
  const height = Math.max(1, num(component.height, 1));
  const scale = Math.max(0.001, num(component.scale, 1));
  const rotation = (num(component.rotation, 0) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const x = num(component.x, 0);
  const y = num(component.y, 0);
  const corners = [
    [source.minX, source.minY],
    [source.maxX, source.minY],
    [source.maxX, source.maxY],
    [source.minX, source.maxY]
  ].map(([sourceX, sourceY]) => {
    const localX = ((sourceX / canvasWidth) - 0.5) * width * scale;
    const localY = ((sourceY / canvasHeight) - 0.5) * height * scale;
    return { x: x + localX * cos - localY * sin, y: y + localX * sin + localY * cos };
  });
  return bounds(
    Math.min(...corners.map((corner) => corner.x)),
    Math.min(...corners.map((corner) => corner.y)),
    Math.max(...corners.map((corner) => corner.x)),
    Math.max(...corners.map((corner) => corner.y))
  );
}

function componentBounds(
  component: ArtComponent,
  resolveComposition: ArtCompositionResolver,
  referencePath: Set<string>,
  contentOnly = false,
  options: ArtCompositionContentBoundsOptions = {},
  componentPath: string[] = [String(component.id || "").trim()].filter(Boolean)
): ArtBounds {
  const scopedId = componentPath.join("/");
  const unscopedOverride = componentPath.length === 1 ? options.timelineFrameOverrides?.[component.id] : undefined;
  const override = options.timelineFrameOverrides?.[scopedId] || unscopedOverride || {};
  const resolved = { ...component, ...override } as ArtComponent;
  const own = componentBox(resolved);
  const width = Math.max(1, num(resolved.width, 1));
  const height = Math.max(1, num(resolved.height, 1));
  const left = num(resolved.x, 0) - width / 2;
  const top = num(resolved.y, 0) - height / 2;
  const isTransparentGroup = resolved.kind === "container";
  let output: ArtBounds | null = contentOnly && isTransparentGroup ? null : own;

  const referenced = referencedCompositionFor(resolved, resolveComposition, referencePath);
  if (referenced && !contentOnly) {
    const referencedBounds = componentsBounds(
      referenced.components || [],
      resolveComposition,
      new Set([...referencePath, String(referenced.id || "")]),
      true,
      options,
      componentPath
    );
    if (referencedBounds) {
      output = expand(output, transformedReferenceBounds(referencedBounds, resolved, referenced.canvas));
    }
  }

  const childBounds = componentsBounds(resolved.children || [], resolveComposition, referencePath, contentOnly, options, componentPath);
  if (childBounds) output = expand(output, translateBounds(childBounds, left, top));

  return output || own;
}

export function artCompositionVisualBounds(
  composition: ArtComposition,
  compositionById: Map<string, ArtComposition>,
  options: ArtCompositionBoundsOptions = {}
): ArtBounds {
  const resolveComposition = (id: string) => compositionById.get(id) || null;
  const canvasWidth = Math.max(1, num(composition.canvas?.width, 1));
  const canvasHeight = Math.max(1, num(composition.canvas?.height, 1));
  const padding = Math.max(0, num(options.padding, 0));
  let output: ArtBounds | null = bounds(0, 0, canvasWidth, canvasHeight);
  output = expand(output, componentsBounds(composition.components || [], resolveComposition, new Set([String(composition.id || "")])));
  output = output || bounds(0, 0, canvasWidth, canvasHeight);
  return bounds(output.minX - padding, output.minY - padding, output.maxX + padding, output.maxY + padding);
}

export function artCompositionContentBoundsWithResolver(
  composition: ArtComposition,
  resolveComposition: ArtCompositionResolver,
  options: ArtCompositionContentBoundsOptions = {}
): ArtBounds {
  return (
    componentsBounds(
      composition.components || [],
      resolveComposition,
      new Set([String(composition.id || "")]),
      true,
      options,
      options.targetPath || []
    ) ||
    bounds(0, 0, Math.max(1, num(composition.canvas?.width, 1)), Math.max(1, num(composition.canvas?.height, 1)))
  );
}

export function artCompositionContentBounds(
  composition: ArtComposition,
  compositionById: Map<string, ArtComposition>,
  options: ArtCompositionContentBoundsOptions = {}
): ArtBounds {
  return artCompositionContentBoundsWithResolver(composition, (id) => compositionById.get(id) || null, options);
}
