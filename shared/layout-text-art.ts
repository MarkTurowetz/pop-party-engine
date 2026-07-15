// Server-side (CommonJS require) layout text-art id helpers. Built to
// shared/layout-text-art.js via `npm run build:shared` (committed output). Wrapped in an
// IIFE so its declarations stay local to the shared/*.ts compilation's script scope.

(function (): void {
  "use strict";

  const layoutTextArtCompositionId = "layout-text-field";
  const layoutTextArtComponentId = "text";
  const layoutTextArtTextPrefabId = "prefab-layout-text-field-text";
  const layoutTextArtTextReferenceId = "layout-text-field-text";

  const legacyTextLayoutIds = new Set<string>([
    "stagetitle",
    "stageintrotitle",
    "stagepresentationtext",
    "stageprompttext",
    "roundintrotext",
    "roundintroinfotext",
    "jointitle",
    "controllerplayername",
    "controllermeta",
    "controllerintromessage",
    "controllerglobalactionmessage",
    "controllerchoiceprompt",
    "controllerchoicedone",
    "controllermicaccessprompt",
    "controllermicaccessstatus",
    "controllertextprompt",
    "controllervoicestatus",
    "controllertextdone"
  ]);

  function normalizeLayoutTextArtId(value: unknown): string {
    return String(value || "")
      .trim()
      .replace(/^#/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function isLayoutTextArtElementId(id: unknown): boolean {
    const normalized = normalizeLayoutTextArtId(id);
    return (
      legacyTextLayoutIds.has(normalized) ||
      normalized.endsWith("momenttext") ||
      normalized.endsWith("controllertext")
    );
  }

  function isLayoutTextArtSelector(selector: unknown): boolean {
    return isLayoutTextArtElementId(selector);
  }

  function layoutTextFieldLifecycleTimeline(): Record<string, unknown> {
    return {
      fps: 30,
      frameCount: 33,
      labels: [
        { name: "Off", frame: 0 },
        { name: "Park", frame: 0 },
        { name: "On", frame: 1 },
        { name: "Appear", frame: 2 },
        { name: "Update", frame: 13 },
        { name: "Disappear", frame: 17 }
      ],
      commands: [
        { id: "stop-0", frame: 0, type: "stop" },
        { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
        { id: "stop-1", frame: 1, type: "stop" },
        { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" },
        { id: "setvisible-2-true", frame: 2, type: "setVisible", target: "true" },
        { id: "stop-12", frame: 12, type: "stop" },
        { id: "setvisible-13-true", frame: 13, type: "setVisible", target: "true" },
        { id: "stop-16", frame: 16, type: "stop" },
        { id: "stop-32", frame: 32, type: "stop" },
        { id: "setvisible-32-false", frame: 32, type: "setVisible", target: "false" }
      ],
      tracks: [
        {
          id: `track-${layoutTextArtTextReferenceId}`,
          targetId: layoutTextArtTextReferenceId,
          keyframes: [
            { id: "key-text-field-0", frame: 0, props: { x: 500, y: 120, width: 1000, height: 240, scale: 0, rotation: 0, opacity: 1, brightness: 1, visible: false }, easing: "hold" },
            { id: "key-text-field-1", frame: 1, props: { x: 500, y: 120, width: 1000, height: 240, scale: 1, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "hold" },
            { id: "key-text-field-2", frame: 2, props: { x: 500, y: 120, width: 1000, height: 240, scale: 0, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "easeOut" },
            { id: "key-text-field-8", frame: 8, props: { x: 500, y: 120, width: 1000, height: 240, scale: 1.2, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "easeOut" },
            { id: "key-text-field-12", frame: 12, props: { x: 500, y: 120, width: 1000, height: 240, scale: 1, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "hold" },
            { id: "key-text-field-13", frame: 13, props: { x: 500, y: 120, width: 1000, height: 240, scale: 1.2, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "easeOut" },
            { id: "key-text-field-16", frame: 16, props: { x: 500, y: 120, width: 1000, height: 240, scale: 1, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "hold" },
            { id: "key-text-field-17", frame: 17, props: { x: 500, y: 120, width: 1000, height: 240, scale: 1, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "easeIn" },
            { id: "key-text-field-21", frame: 21, props: { x: 500, y: 120, width: 1000, height: 240, scale: 1.2, rotation: 0, opacity: 1, brightness: 1, visible: true }, easing: "easeIn" },
            { id: "key-text-field-32", frame: 32, props: { x: 500, y: 120, width: 1000, height: 240, scale: 0, rotation: 0, opacity: 1, brightness: 1, visible: false }, easing: "hold" }
          ]
        }
      ]
    };
  }

  function defaultLayoutTextFieldCompositions(): Record<string, unknown>[] {
    return [
      {
        id: layoutTextArtTextPrefabId,
        name: "Layout Text Field Text",
        description: "Reusable text-content prefab for Layout Text Field game objects.",
        surface: "stage",
        compositionKind: "prefab",
        isCustom: false,
        timelineArchitectureVersion: 2,
        canvas: { width: 1000, height: 240 },
        components: [
          {
            id: layoutTextArtComponentId,
            name: "Text",
            instanceLabel: "text",
            kind: "text",
            x: 500,
            y: 120,
            width: 1000,
            height: 240,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "TEXT",
            fontSize: 58,
            autoFitText: false,
            fontColor: "#ffffff"
          }
        ],
        timeline: {
          fps: 30,
          frameCount: 1,
          labels: [{ name: "Default", frame: 0 }, { name: "Park", frame: 0 }],
          commands: [{ id: "stop-0", frame: 0, type: "stop" }],
          tracks: []
        }
      },
      {
        id: layoutTextArtCompositionId,
        name: "Layout Text Field",
        description: "Lifecycle game object that owns a reusable Layout Text Field Text prefab.",
        surface: "stage",
        compositionKind: "gameObject",
        isCustom: false,
        timelineArchitectureVersion: 2,
        canvas: { width: 1000, height: 240 },
        components: [layoutTextFieldReferenceComponent()],
        timeline: layoutTextFieldLifecycleTimeline()
      }
    ];
  }

  function layoutTextFieldReferenceComponent(): Record<string, unknown> {
    return {
      id: layoutTextArtTextReferenceId,
      name: "Layout Text Field Text",
      instanceLabel: "layoutTextFieldText",
      kind: "reference",
      x: 500,
      y: 120,
      width: 1000,
      height: 240,
      scale: 1,
      rotation: 0,
      locked: false,
      defaultAnimationState: "",
      artCompositionId: layoutTextArtTextPrefabId
    };
  }

  function migrateLayoutTextFieldWidgetComponents(compositionId: unknown, components: Record<string, any>[] = []): Record<string, any>[] {
    if (compositionId === layoutTextArtCompositionId) {
      for (let index = components.length - 1; index >= 0; index -= 1) {
        const component = components[index];
        if (component?.id === layoutTextArtComponentId && String(component?.kind || "").toLowerCase() === "text") {
          components.splice(index, 1);
        }
      }
      let reference = components.find((component) => component?.artCompositionId === layoutTextArtTextPrefabId);
      if (!reference) {
        reference = layoutTextFieldReferenceComponent();
        components.unshift(reference);
      }
      reference.name = reference.name || "Layout Text Field Text";
      reference.instanceLabel = reference.instanceLabel || "layoutTextFieldText";
      reference.kind = "reference";
      reference.artCompositionId = layoutTextArtTextPrefabId;
    }
    if (compositionId === layoutTextArtTextPrefabId) {
      const text = components.find((component) => String(component?.kind || "").toLowerCase() === "text");
      if (text) text.instanceLabel = text.instanceLabel || layoutTextArtComponentId;
    }
    return components;
  }

  function migrateLayoutTextFieldWidgetTimeline(compositionId: unknown, timeline: any, fallbackTimeline: any): any {
    if (compositionId !== layoutTextArtCompositionId) return timeline;
    const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
    const hasPrefabReferenceTrack = tracks.some((track: any) => track?.targetId === layoutTextArtTextReferenceId);
    return hasPrefabReferenceTrack ? timeline : fallbackTimeline;
  }

  module.exports = {
    isLayoutTextArtElementId,
    isLayoutTextArtSelector,
    defaultLayoutTextFieldCompositions,
    layoutTextArtComponentId,
    layoutTextArtCompositionId,
    layoutTextArtTextPrefabId,
    layoutTextArtTextReferenceId,
    migrateLayoutTextFieldWidgetComponents,
    migrateLayoutTextFieldWidgetTimeline,
    normalizeLayoutTextArtId
  };
})();
