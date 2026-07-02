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
  compositionById: Map<string, ArtComposition>,
  referencePath: Set<string>
): ArtComposition | null {
  if (component.kind !== "reference") return null;
  const id = String(component.artCompositionId || "");
  if (!id || referencePath.has(id)) return null;
  return compositionById.get(id) || null;
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
  compositionById: Map<string, ArtComposition>,
  referencePath: Set<string>
): ArtBounds | null {
  return components.reduce<ArtBounds | null>(
    (current, component) => expand(current, componentBounds(component, compositionById, referencePath)),
    null
  );
}

function componentBounds(
  component: ArtComponent,
  compositionById: Map<string, ArtComposition>,
  referencePath: Set<string>
): ArtBounds {
  const own = componentBox(component);
  const width = Math.max(1, num(component.width, 1));
  const height = Math.max(1, num(component.height, 1));
  const left = num(component.x, 0) - width / 2;
  const top = num(component.y, 0) - height / 2;
  let output: ArtBounds | null = own;

  const referenced = referencedCompositionFor(component, compositionById, referencePath);
  if (referenced) {
    const canvasWidth = Math.max(1, num(referenced.canvas?.width, width));
    const canvasHeight = Math.max(1, num(referenced.canvas?.height, height));
    const referencedBounds = componentsBounds(
      referenced.components || [],
      compositionById,
      new Set([...referencePath, String(referenced.id || "")])
    );
    if (referencedBounds) {
      output = expand(output, translateBounds(referencedBounds, left, top, width / canvasWidth, height / canvasHeight));
    }
  }

  const childBounds = componentsBounds(component.children || [], compositionById, referencePath);
  if (childBounds) output = expand(output, translateBounds(childBounds, left, top));

  return output || own;
}

export function artCompositionVisualBounds(
  composition: ArtComposition,
  compositionById: Map<string, ArtComposition>,
  options: ArtCompositionBoundsOptions = {}
): ArtBounds {
  const canvasWidth = Math.max(1, num(composition.canvas?.width, 1));
  const canvasHeight = Math.max(1, num(composition.canvas?.height, 1));
  const padding = Math.max(0, num(options.padding, 0));
  let output: ArtBounds | null = bounds(0, 0, canvasWidth, canvasHeight);
  output = expand(output, componentsBounds(composition.components || [], compositionById, new Set([String(composition.id || "")])));
  output = output || bounds(0, 0, canvasWidth, canvasHeight);
  return bounds(output.minX - padding, output.minY - padding, output.maxX + padding, output.maxY + padding);
}
