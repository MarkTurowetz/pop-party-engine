import type { ArtComponent, ArtComposition } from "../../types/game-data";

export interface ArtComponentTargetMatch {
  component: ArtComponent;
  path: string[];
}

export interface ArtComponentTargetOptions {
  includeRoot?: boolean;
  useScopedIds?: boolean;
  scopeRootPath?: boolean;
  resolveReference?: (component: ArtComponent) => ArtComposition | null | undefined;
}

export interface ArtComponentTargetOption {
  id: string;
  label: string;
  detail: string;
  component: ArtComponent;
  path: string[];
  depth: number;
}

export function artComponentTargetPathId(path: string[]): string {
  return path.filter(Boolean).join("/");
}

function cleanTargetParts(id: string): string[] {
  return String(id || "").split("/").map((part) => part.trim()).filter(Boolean);
}

function componentLabel(component: ArtComponent): string {
  return String(component.name || component.kind || component.id);
}

function componentDetail(component: ArtComponent): string {
  return [String(component.kind || "component"), component.id].filter(Boolean).join(" / ");
}

function referencedChildren(component: ArtComponent, options: ArtComponentTargetOptions): ArtComponent[] | null {
  if (String(component.kind || "").toLowerCase() !== "reference") return null;
  return (options.resolveReference?.(component)?.components as ArtComponent[]) || null;
}

export function artComponentTargetIdFor(
  component: ArtComponent,
  parentPath: string[],
  options: ArtComponentTargetOptions = {}
): string {
  const rawId = String(component.id || "").trim();
  return options.useScopedIds ? artComponentTargetPathId([...parentPath, rawId]) || rawId : rawId;
}

export function findArtComponentTargetPath(
  components: ArtComponent[] | null | undefined,
  id: string,
  options: ArtComponentTargetOptions = {}
): ArtComponentTargetMatch | null {
  const cleanId = String(id || "").trim();
  const parts = cleanTargetParts(cleanId);
  const usesPath = parts.length > 1;
  const visit = (items: ArtComponent[] | null | undefined, path: string[]): ArtComponentTargetMatch | null => {
    for (const component of items || []) {
      const componentId = String(component.id || "").trim();
      const nextPath = [...path, componentId].filter(Boolean);
      const matchPath = options.scopeRootPath === false ? nextPath.slice(1) : nextPath;
      const matches = usesPath ? artComponentTargetPathId(matchPath) === cleanId : componentId === cleanId;
      if (matches) return { component, path: nextPath };
      const children = referencedChildren(component, options) || component.children || [];
      const found = visit(children, nextPath);
      if (found) return found;
    }
    return null;
  };
  return visit(components, []);
}

export function findArtComponentTarget(
  components: ArtComponent[] | null | undefined,
  id: string,
  options: ArtComponentTargetOptions = {}
): ArtComponent | undefined {
  return findArtComponentTargetPath(components, id, options)?.component;
}

export function artComponentTargetOptionsFor(
  component: ArtComponent | undefined,
  options: ArtComponentTargetOptions = {}
): ArtComponentTargetOption[] {
  if (!component) return [];
  const includeRoot = options.includeRoot !== false;
  const result: ArtComponentTargetOption[] = [];
  const visit = (item: ArtComponent, depth: number, path: string[]) => {
    const id = artComponentTargetIdFor(item, path, options);
    if (includeRoot || depth > 0) {
      result.push({
        id,
        label: `${"  ".repeat(includeRoot ? depth : depth - 1)}${componentLabel(item)}`,
        detail: id.includes("/") ? `${componentDetail(item)} / ${id}` : componentDetail(item),
        component: item,
        path: [...path, String(item.id || "").trim()].filter(Boolean),
        depth
      });
    }
    const itemId = String(item.id || "").trim();
    const childPath = depth === 0 && includeRoot === false && options.scopeRootPath === false ? [] : [...path, itemId].filter(Boolean);
    const children = referencedChildren(item, options) || item.children || [];
    for (const child of children) {
      visit(child, depth + 1, childPath);
    }
  };
  visit(component, 0, []);
  return result;
}

export function artComponentTargetLabel(targetId: string, component: ArtComponent | undefined, options: ArtComponentTargetOptions = {}) {
  const match = component ? findArtComponentTargetPath([component], targetId, options) : null;
  if (!match) return { id: targetId, label: targetId, detail: "track target" };
  const detailTargetId = targetId.includes("/") ? targetId : artComponentTargetPathId(match.path) || targetId;
  return {
    id: targetId,
    label: componentLabel(match.component),
    detail: `${componentDetail(match.component)} / ${detailTargetId}`
  };
}
