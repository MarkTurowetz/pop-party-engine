import type { ArtComponent, ArtComposition } from "../../types/game-data";
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
  resolveReference?: (component: ArtComponent) => ArtComposition | null | undefined;
};

export function findTimelineTargetComponent(components: ArtComponent[], id: string, targetOptions: TimelineTargetOptions = {}): ArtComponent | undefined {
  return findArtComponentTarget(components, id, targetOptions);
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

export function timelineTargetLabel(targetId: string, component: ArtComponent | undefined, targetOptions: TimelineTargetOptions = {}): TimelineTargetOption {
  return artComponentTargetLabel(targetId, component, targetOptions);
}
