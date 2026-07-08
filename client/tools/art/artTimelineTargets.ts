import type { ArtComponent } from "../../types/game-data";

export type TimelineTargetOption = {
  id: string;
  label: string;
  detail: string;
};

export type TimelineTargetOptions = {
  includeRoot?: boolean;
};

function componentLabel(component: ArtComponent): string {
  return String(component.name || component.kind || component.id);
}

function componentDetail(component: ArtComponent): string {
  return [String(component.kind || "component"), component.id].filter(Boolean).join(" / ");
}

export function findTimelineTargetComponent(components: ArtComponent[], id: string): ArtComponent | undefined {
  for (const component of components) {
    if (component.id === id) return component;
    const found = component.children ? findTimelineTargetComponent(component.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

export function timelineTargetOptionsFor(component: ArtComponent | undefined, targetOptions: TimelineTargetOptions = {}): TimelineTargetOption[] {
  if (!component) return [];
  const includeRoot = targetOptions.includeRoot !== false;
  const result: TimelineTargetOption[] = [];
  const visit = (item: ArtComponent, depth: number) => {
    if (includeRoot || depth > 0) {
      result.push({
        id: item.id,
        label: `${"  ".repeat(includeRoot ? depth : depth - 1)}${componentLabel(item)}`,
        detail: componentDetail(item)
      });
    }
    for (const child of item.children || []) visit(child, depth + 1);
  };
  visit(component, 0);
  return result;
}

export function timelineTargetLabel(targetId: string, component: ArtComponent | undefined): TimelineTargetOption {
  const matchedComponent = component ? findTimelineTargetComponent([component], targetId) : undefined;
  if (!matchedComponent) return { id: targetId, label: targetId, detail: "track target" };
  return {
    id: targetId,
    label: componentLabel(matchedComponent),
    detail: componentDetail(matchedComponent)
  };
}
