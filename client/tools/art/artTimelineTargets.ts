import type { ArtComponent } from "../../types/game-data";

export type TimelineTargetOption = {
  id: string;
  label: string;
  detail: string;
};

export type TimelineTargetOptions = {
  includeRoot?: boolean;
  useScopedIds?: boolean;
};

function componentLabel(component: ArtComponent): string {
  return String(component.name || component.kind || component.id);
}

function componentDetail(component: ArtComponent): string {
  return [String(component.kind || "component"), component.id].filter(Boolean).join(" / ");
}

function targetPathId(path: string[]): string {
  return path.filter(Boolean).join("/");
}

function cleanTargetParts(id: string): string[] {
  return String(id || "").split("/").map((part) => part.trim()).filter(Boolean);
}

function findTimelineTargetPath(components: ArtComponent[], id: string): { component: ArtComponent; path: string[] } | null {
  const cleanId = String(id || "").trim();
  const parts = cleanTargetParts(cleanId);
  const usesPath = parts.length > 1;
  const visit = (items: ArtComponent[], path: string[]): { component: ArtComponent; path: string[] } | null => {
    for (const component of items) {
      const componentId = String(component.id || "").trim();
      const nextPath = [...path, componentId].filter(Boolean);
      const matches = usesPath ? targetPathId(nextPath) === cleanId : componentId === cleanId;
      if (matches) return { component, path: nextPath };
      const found = component.children ? visit(component.children, nextPath) : null;
      if (found) return found;
    }
    return null;
  };
  return visit(components, []);
}

export function findTimelineTargetComponent(components: ArtComponent[], id: string): ArtComponent | undefined {
  return findTimelineTargetPath(components, id)?.component;
}

export function timelineTargetIdFor(component: ArtComponent, path: string[], targetOptions: TimelineTargetOptions = {}): string {
  const rawId = String(component.id || "").trim();
  return targetOptions.useScopedIds ? targetPathId([...path, rawId]) || rawId : rawId;
}

function timelineTargetDetail(component: ArtComponent, targetId: string): string {
  const detail = componentDetail(component);
  return targetId.includes("/") ? `${detail} / ${targetId}` : detail;
}

export function timelineTargetOptionsFor(component: ArtComponent | undefined, targetOptions: TimelineTargetOptions = {}): TimelineTargetOption[] {
  if (!component) return [];
  const includeRoot = targetOptions.includeRoot !== false;
  const result: TimelineTargetOption[] = [];
  const visit = (item: ArtComponent, depth: number, path: string[]) => {
    const id = timelineTargetIdFor(item, path, targetOptions);
    if (includeRoot || depth > 0) {
      result.push({
        id,
        label: `${"  ".repeat(includeRoot ? depth : depth - 1)}${componentLabel(item)}`,
        detail: timelineTargetDetail(item, id)
      });
    }
    const itemId = String(item.id || "").trim();
    for (const child of item.children || []) {
      visit(child, depth + 1, [...path, itemId].filter(Boolean));
    }
  }
  visit(component, 0, []);
  return result;
}

export function timelineTargetLabel(targetId: string, component: ArtComponent | undefined): TimelineTargetOption {
  const match = component ? findTimelineTargetPath([component], targetId) : null;
  if (!match) return { id: targetId, label: targetId, detail: "track target" };
  const detailTargetId = targetId.includes("/") ? targetId : targetPathId(match.path) || targetId;
  return {
    id: targetId,
    label: componentLabel(match.component),
    detail: timelineTargetDetail(match.component, detailTargetId)
  };
}
