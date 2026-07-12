import { canonicalLifecycleLabel, normalizeLifecycleLabel } from "./lifecycle-labels";
import { normalizeTimeline, type TimelineCommand, type TimelineDocument } from "./timeline-model";

export const ART_TIMELINE_ARCHITECTURE_VERSION = 2;

export interface ArtArchitectureComponent {
  id: string;
  name?: string;
  instanceLabel?: string;
  kind?: string;
  artCompositionId?: string;
  timeline?: unknown;
  children?: ArtArchitectureComponent[];
  [key: string]: unknown;
}

export interface ArtArchitectureComposition {
  id: string;
  name?: string;
  timelineArchitectureVersion?: number;
  timeline?: unknown;
  components?: ArtArchitectureComponent[];
  [key: string]: unknown;
}

export interface ArtArchitectureIssue {
  compositionId: string;
  code: string;
  message: string;
}

export interface ArtArchitectureMigrationResult<T> {
  compositions: T[];
  migratedCompositionIds: string[];
  issues: ArtArchitectureIssue[];
  removedTrackCount: number;
  removedKeyframeCount: number;
  removedComponentTimelineCount: number;
}

const reservedLabels = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else",
  "enum", "export", "extends", "false", "finally", "for", "function", "if", "implements", "import", "in", "instanceof",
  "interface", "let", "new", "null", "package", "private", "protected", "public", "return", "static", "super", "switch",
  "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield", "constructor", "prototype", "__proto__"
]);

export function validArtInstanceLabel(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return /^[a-z][A-Za-z0-9]*$/.test(text) && !reservedLabels.has(text);
}

export function suggestedArtInstanceLabel(value: unknown, fallback = "component"): string {
  const words = String(value ?? "").trim().match(/[A-Za-z0-9]+/g) || [];
  const base = words.length
    ? words.map((word, index) => index === 0
      ? `${word.charAt(0).toLowerCase()}${word.slice(1)}`
      : `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join("")
    : fallback;
  const safe = /^[a-z]/.test(base) ? base : `component${base}`;
  return validArtInstanceLabel(safe) ? safe : `${safe}Object`;
}

function allComponents(components: ArtArchitectureComponent[] | undefined): ArtArchitectureComponent[] {
  const output: ArtArchitectureComponent[] = [];
  const visit = (items: ArtArchitectureComponent[] | undefined) => {
    for (const component of items || []) {
      output.push(component);
      visit(component.children);
    }
  };
  visit(components);
  return output;
}

export function assignUniqueArtInstanceLabels(components: ArtArchitectureComponent[] | undefined): void {
  const used = new Set<string>();
  for (const component of allComponents(components)) {
    const requested = validArtInstanceLabel(component.instanceLabel)
      ? String(component.instanceLabel)
      : suggestedArtInstanceLabel(component.name || component.id);
    let label = requested;
    for (let suffix = 2; used.has(label); suffix += 1) label = `${requested}${suffix}`;
    component.instanceLabel = label;
    used.add(label);
  }
}

function canonicalizeTimeline(timeline: TimelineDocument): TimelineDocument {
  return {
    ...timeline,
    labels: timeline.labels.map((label) => ({ ...label, name: normalizeLifecycleLabel(label.name) })),
    commands: timeline.commands.map((command) => {
      const next: TimelineCommand = { ...command };
      if ((command.type === "gotoAndPlay" || command.type === "gotoAndStop") && command.target) {
        next.target = normalizeLifecycleLabel(command.target);
      }
      if ((command.type === "playComponent" || command.type === "stopComponent") && command.event) {
        next.event = normalizeLifecycleLabel(command.event);
      }
      return next;
    }),
    tracks: []
  };
}

function lifecycleCollision(timeline: TimelineDocument): string | null {
  const byCanonical = new Map<string, Set<string>>();
  for (const label of timeline.labels) {
    const canonical = canonicalLifecycleLabel(label.name);
    if (!canonical) continue;
    const spellings = byCanonical.get(canonical) || new Set<string>();
    spellings.add(label.name);
    byCanonical.set(canonical, spellings);
  }
  for (const [canonical, spellings] of byCanonical) {
    const count = timeline.labels.filter((label) => canonicalLifecycleLabel(label.name) === canonical).length;
    if (spellings.size > 1 || count > 1) return `${[...spellings].join(" and ")} resolve ${count} times to ${canonical}`;
  }
  const customCounts = new Map<string, number>();
  for (const label of timeline.labels.filter((item) => !canonicalLifecycleLabel(item.name))) {
    customCounts.set(label.name, (customCounts.get(label.name) || 0) + 1);
  }
  for (const [name, count] of customCounts) if (count > 1) return `${name} is defined ${count} times`;
  return null;
}

export function collectArtArchitectureIssues(compositions: ArtArchitectureComposition[]): ArtArchitectureIssue[] {
  const issues: ArtArchitectureIssue[] = [];
  const byId = new Map(compositions.map((composition) => [composition.id, composition]));
  for (const composition of compositions) {
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();
    for (const component of allComponents(composition.components)) {
      if (!component.id || seenIds.has(component.id)) {
        issues.push({ compositionId: composition.id, code: "duplicate-component-id", message: `Duplicate component id: ${component.id || "(empty)"}` });
      }
      seenIds.add(component.id);
      if (Number(composition.timelineArchitectureVersion) >= ART_TIMELINE_ARCHITECTURE_VERSION && !component.instanceLabel) {
        issues.push({ compositionId: composition.id, code: "missing-instance-label", message: `Missing instance label: ${component.id}` });
      } else if (component.instanceLabel && (!validArtInstanceLabel(component.instanceLabel) || seenLabels.has(component.instanceLabel))) {
        issues.push({ compositionId: composition.id, code: "invalid-instance-label", message: `Invalid or duplicate instance label: ${component.instanceLabel}` });
      }
      if (component.instanceLabel) seenLabels.add(component.instanceLabel);
      if (component.kind === "reference" && component.artCompositionId && !byId.has(component.artCompositionId)) {
        issues.push({ compositionId: composition.id, code: "missing-reference", message: `Missing referenced prefab: ${component.artCompositionId}` });
      }
    }
    const timeline = normalizeTimeline(composition.timeline);
    const collision = timeline && lifecycleCollision(timeline);
    if (collision) issues.push({ compositionId: composition.id, code: "lifecycle-label-collision", message: collision });
    if (timeline && Number(composition.timelineArchitectureVersion) >= ART_TIMELINE_ARCHITECTURE_VERSION) {
      const components = allComponents(composition.components);
      const componentIds = new Set(components.map((component) => component.id));
      const trackTargets = new Set<string>();
      for (const track of timeline.tracks) {
        if (!componentIds.has(track.targetId) || trackTargets.has(track.targetId)) {
          issues.push({ compositionId: composition.id, code: "invalid-track-target", message: `Track target must be one unique local component id: ${track.targetId}` });
        }
        trackTargets.add(track.targetId);
      }
    }
    for (const command of timeline?.commands || []) {
      if (command.type === "gotoAndPlay" || command.type === "gotoAndStop") {
        const requestedLifecycle = canonicalLifecycleLabel(command.target);
        const matches = (timeline?.labels || []).filter((label) => requestedLifecycle
          ? canonicalLifecycleLabel(label.name) === requestedLifecycle
          : label.name === command.target);
        if (matches.length !== 1) {
          issues.push({ compositionId: composition.id, code: "invalid-command-label", message: `Timeline command label must resolve exactly once: ${command.target || "(empty)"}` });
        }
      }
      if (command.type !== "playComponent" && command.type !== "stopComponent") continue;
      const targets = allComponents(composition.components).filter((component) =>
        component.id === command.target || component.instanceLabel === command.target || component.name === command.target
      );
      if (targets.length !== 1 || targets[0].kind !== "reference") {
        issues.push({
          compositionId: composition.id,
          code: "invalid-command-target",
          message: `Nested playback target must resolve to one prefab instance: ${command.target || "(empty)"}`
        });
        continue;
      }
      const referenced = byId.get(String(targets[0].artCompositionId || ""));
      const referencedTimeline = normalizeTimeline(referenced?.timeline);
      const labelMatches = (referencedTimeline?.labels || []).filter((label) => {
        const requestedLifecycle = canonicalLifecycleLabel(command.event);
        const storedLifecycle = canonicalLifecycleLabel(label.name);
        return requestedLifecycle ? requestedLifecycle === storedLifecycle : label.name === command.event;
      });
      if (labelMatches.length !== 1) {
        issues.push({
          compositionId: composition.id,
          code: "invalid-command-animation",
          message: `Animation must resolve to one label on ${targets[0].instanceLabel || targets[0].id}: ${command.event || "(empty)"}`
        });
      }
      if (Number(composition.timelineArchitectureVersion) >= ART_TIMELINE_ARCHITECTURE_VERSION && command.target !== targets[0].id) {
        issues.push({ compositionId: composition.id, code: "noncanonical-command-target", message: `Nested playback target must be stored by stable id: ${command.target}` });
      }
    }
  }
  const visit = (rootId: string, currentId: string, path: string[], visiting: Set<string>) => {
    const composition = byId.get(currentId);
    if (!composition) return;
    for (const component of allComponents(composition.components).filter((item) => item.kind === "reference" && item.artCompositionId)) {
      const nextId = String(component.artCompositionId);
      if (visiting.has(nextId)) {
        issues.push({ compositionId: rootId, code: "reference-cycle", message: `Prefab reference cycle: ${[...path, nextId].join(" -> ")}` });
        continue;
      }
      visit(rootId, nextId, [...path, nextId], new Set([...visiting, nextId]));
    }
  };
  for (const composition of compositions) visit(composition.id, composition.id, [composition.id], new Set([composition.id]));
  return issues;
}

export function migrateArtTimelineArchitecture<T extends ArtArchitectureComposition>(source: T[]): ArtArchitectureMigrationResult<T> {
  const cloned = JSON.parse(JSON.stringify(source || [])) as T[];
  const preIssues = collectArtArchitectureIssues(cloned);
  const blockedIds = new Set(preIssues.map((issue) => issue.compositionId));
  const migratedCompositionIds: string[] = [];
  let removedTrackCount = 0;
  let removedKeyframeCount = 0;
  let removedComponentTimelineCount = 0;
  for (const composition of cloned) {
    if (Number(composition.timelineArchitectureVersion) >= ART_TIMELINE_ARCHITECTURE_VERSION || blockedIds.has(composition.id)) continue;
    const timeline = normalizeTimeline(composition.timeline);
    if (timeline) {
      removedTrackCount += timeline.tracks.length;
      removedKeyframeCount += timeline.tracks.reduce((count, track) => count + track.keyframes.length, 0);
    }
    for (const component of allComponents(composition.components)) {
      if (component.timeline != null) removedComponentTimelineCount += 1;
      delete component.timeline;
    }
    assignUniqueArtInstanceLabels(composition.components);
    if (timeline) {
      const components = allComponents(composition.components);
      const canonical = canonicalizeTimeline(timeline);
      canonical.commands = canonical.commands.map((command) => {
        if (command.type !== "playComponent" && command.type !== "stopComponent") return command;
        const matches = components.filter((component) =>
          component.id === command.target || component.instanceLabel === command.target || component.name === command.target
        );
        return matches.length === 1 ? { ...command, target: matches[0].id } : command;
      });
      composition.timeline = canonical;
    }
    composition.timelineArchitectureVersion = ART_TIMELINE_ARCHITECTURE_VERSION;
    migratedCompositionIds.push(composition.id);
  }
  return { compositions: cloned, migratedCompositionIds, issues: preIssues, removedTrackCount, removedKeyframeCount, removedComponentTimelineCount };
}
