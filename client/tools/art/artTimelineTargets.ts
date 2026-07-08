import type { ArtComponent } from "../../types/game-data";
import {
  artComponentTargetIdFor,
  artComponentTargetLabel,
  artComponentTargetOptionsFor,
  findArtComponentTarget
} from "../shared/artComponentTargets";

export type TimelineTargetOption = {
  id: string;
  label: string;
  detail: string;
};

export type TimelineTargetOptions = {
  includeRoot?: boolean;
  useScopedIds?: boolean;
};

export function findTimelineTargetComponent(components: ArtComponent[], id: string): ArtComponent | undefined {
  return findArtComponentTarget(components, id);
}

export function timelineTargetIdFor(component: ArtComponent, path: string[], targetOptions: TimelineTargetOptions = {}): string {
  return artComponentTargetIdFor(component, path, targetOptions);
}

export function timelineTargetOptionsFor(component: ArtComponent | undefined, targetOptions: TimelineTargetOptions = {}): TimelineTargetOption[] {
  return artComponentTargetOptionsFor(component, targetOptions).map((option) => ({
    id: option.id,
    label: option.label,
    detail: option.detail
  }));
}

export function timelineTargetLabel(targetId: string, component: ArtComponent | undefined): TimelineTargetOption {
  return artComponentTargetLabel(targetId, component);
}
