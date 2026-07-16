"use strict";
// Server-shared controller button hierarchy definitions and legacy-flat migration.
// Built to shared/controller-button-art.js via `npm run build:shared`.
(function () {
    "use strict";
    const controllerButtonConfigs = [
        buttonConfig("controller-primary-button", "Controller Primary Button"),
        buttonConfig("controller-choice-option", "Controller Choice Option"),
        buttonConfig("controller-avatar-button", "Controller Avatar Button")
    ];
    function buttonConfig(parentId, parentName) {
        const interactionId = `${parentId}-interaction`;
        const stateId = `${parentId}-state`;
        const artId = `${parentId}-art`;
        return {
            parentId,
            parentName,
            interactionId,
            interactionName: `${parentName} Interaction MC`,
            interactionReferenceId: `${parentId}-interaction-ref`,
            interactionInstanceLabel: "interaction",
            stateId,
            stateName: `${parentName} State MC`,
            stateReferenceId: `${parentId}-state-ref`,
            stateInstanceLabel: "state",
            artId,
            artName: `${parentName} Art`,
            artReferenceId: `${parentId}-art-ref`,
            artInstanceLabel: "art"
        };
    }
    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }
    function applyBaseInstanceLabels(components) {
        for (const component of components) {
            if (!component?.instanceLabel) {
                component.instanceLabel = String(component?.id || "component").replace(/-([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
            }
        }
        return components;
    }
    function configForParent(compositionId) {
        return controllerButtonConfigs.find((config) => config.parentId === compositionId) || null;
    }
    function configForArt(compositionId) {
        return controllerButtonConfigs.find((config) => config.artId === compositionId) || null;
    }
    function referenceComponent(id, name, instanceLabel, artCompositionId, canvas) {
        const width = Math.max(1, Number(canvas?.width || 1));
        const height = Math.max(1, Number(canvas?.height || 1));
        return {
            id,
            name,
            instanceLabel,
            kind: "reference",
            x: width / 2,
            y: height / 2,
            width,
            height,
            scale: 1,
            rotation: 0,
            locked: false,
            defaultAnimationState: "",
            artCompositionId
        };
    }
    function baseTimeline() {
        return {
            fps: 30,
            frameCount: 1,
            labels: [{ name: "Default", frame: 0 }],
            commands: [{ id: "stop-0", frame: 0, type: "stop" }],
            tracks: []
        };
    }
    function stateTimeline(artReferenceId) {
        return {
            fps: 30,
            frameCount: 2,
            labels: [{ name: "Default", frame: 0 }, { name: "Disabled", frame: 1 }],
            commands: [
                { id: "stop-default", frame: 0, type: "stop" },
                { id: "stop-disabled", frame: 1, type: "stop" }
            ],
            tracks: [{
                    id: `track-${artReferenceId}`,
                    targetId: artReferenceId,
                    keyframes: [
                        { id: `${artReferenceId}-default`, frame: 0, props: { opacity: 1, brightness: 1 }, easing: "hold" },
                        { id: `${artReferenceId}-disabled`, frame: 1, props: { opacity: 0.68, brightness: 0.72 }, easing: "hold" }
                    ]
                }]
        };
    }
    function interactionTimeline(stateReferenceId, canvas) {
        const centerX = Math.max(1, Number(canvas?.width || 1)) / 2;
        const centerY = Math.max(1, Number(canvas?.height || 1)) / 2;
        return {
            fps: 30,
            frameCount: 13,
            labels: [
                { name: "Default", frame: 0 },
                { name: "Down", frame: 1 },
                { name: "Up", frame: 4 },
                { name: "HoverIn", frame: 7 },
                { name: "HoverOut", frame: 10 }
            ],
            commands: [
                { id: "stop-default", frame: 0, type: "stop" },
                { id: "stop-down", frame: 3, type: "stop" },
                { id: "stop-up", frame: 6, type: "stop" },
                { id: "stop-hover-in", frame: 9, type: "stop" },
                { id: "stop-hover-out", frame: 12, type: "stop" }
            ],
            tracks: [{
                    id: `track-${stateReferenceId}`,
                    targetId: stateReferenceId,
                    keyframes: [
                        { id: `${stateReferenceId}-default`, frame: 0, props: { x: centerX, y: centerY, scale: 1 }, easing: "hold" },
                        { id: `${stateReferenceId}-down-start`, frame: 1, props: { x: centerX, y: centerY, scale: 1 }, easing: "easeOut" },
                        { id: `${stateReferenceId}-down-end`, frame: 3, props: { x: centerX + 2, y: centerY + 2, scale: 0.94 }, easing: "hold" },
                        { id: `${stateReferenceId}-up-start`, frame: 4, props: { x: centerX + 2, y: centerY + 2, scale: 0.94 }, easing: "easeOut" },
                        { id: `${stateReferenceId}-up-end`, frame: 6, props: { x: centerX, y: centerY, scale: 1 }, easing: "hold" },
                        { id: `${stateReferenceId}-hover-in-start`, frame: 7, props: { x: centerX, y: centerY, scale: 1 }, easing: "easeOut" },
                        { id: `${stateReferenceId}-hover-in-end`, frame: 9, props: { x: centerX - 2, y: centerY - 2, scale: 1.02 }, easing: "hold" },
                        { id: `${stateReferenceId}-hover-out-start`, frame: 10, props: { x: centerX - 2, y: centerY - 2, scale: 1.02 }, easing: "easeOut" },
                        { id: `${stateReferenceId}-hover-out-end`, frame: 12, props: { x: centerX, y: centerY, scale: 1 }, easing: "hold" }
                    ]
                }]
        };
    }
    function lifecycleTimeline(interactionReferenceId) {
        return {
            fps: 30,
            frameCount: 19,
            labels: [
                { name: "Off", frame: 0 },
                { name: "On", frame: 1 },
                { name: "Appear", frame: 2 },
                { name: "Update", frame: 9 },
                { name: "Disappear", frame: 12 }
            ],
            commands: [
                { id: "hide-off", frame: 0, type: "setVisible", target: "false" },
                { id: "stop-off", frame: 0, type: "stop" },
                { id: "show-on", frame: 1, type: "setVisible", target: "true" },
                { id: "default-on", frame: 1, type: "stopComponent", target: interactionReferenceId, event: "Default" },
                { id: "stop-on", frame: 1, type: "stop" },
                { id: "show-appear", frame: 2, type: "setVisible", target: "true" },
                { id: "default-appear", frame: 2, type: "stopComponent", target: interactionReferenceId, event: "Default" },
                { id: "stop-appear", frame: 8, type: "stop" },
                { id: "stop-update", frame: 11, type: "stop" },
                { id: "hide-disappear", frame: 18, type: "setVisible", target: "false" },
                { id: "stop-disappear", frame: 18, type: "stop" }
            ],
            tracks: [{
                    id: `track-${interactionReferenceId}`,
                    targetId: interactionReferenceId,
                    keyframes: [
                        { id: `${interactionReferenceId}-off`, frame: 0, props: { scale: 1, opacity: 1 }, easing: "hold" },
                        { id: `${interactionReferenceId}-on`, frame: 1, props: { scale: 1, opacity: 1 }, easing: "hold" },
                        { id: `${interactionReferenceId}-appear-start`, frame: 2, props: { scale: 0.92, opacity: 0 }, easing: "easeOut" },
                        { id: `${interactionReferenceId}-appear-end`, frame: 8, props: { scale: 1, opacity: 1 }, easing: "hold" },
                        { id: `${interactionReferenceId}-update-start`, frame: 9, props: { scale: 1.03, opacity: 1 }, easing: "easeOut" },
                        { id: `${interactionReferenceId}-update-end`, frame: 11, props: { scale: 1, opacity: 1 }, easing: "hold" },
                        { id: `${interactionReferenceId}-disappear-start`, frame: 12, props: { scale: 1, opacity: 1 }, easing: "easeIn" },
                        { id: `${interactionReferenceId}-disappear-end`, frame: 18, props: { scale: 0.92, opacity: 0 }, easing: "hold" }
                    ]
                }]
        };
    }
    function installDefaultControllerButtonCompositions(compositions) {
        for (const config of controllerButtonConfigs) {
            const parent = compositions.find((composition) => composition?.id === config.parentId);
            if (!parent)
                continue;
            const canvas = clone(parent.canvas || { width: 1, height: 1 });
            const originalComponents = applyBaseInstanceLabels(clone(parent.components || []));
            if (!compositions.some((composition) => composition?.id === config.artId)) {
                compositions.push({
                    id: config.artId,
                    name: config.artName,
                    description: `Base art used by ${config.parentName}.`,
                    surface: "controller",
                    compositionKind: "prefab",
                    isCustom: false,
                    timelineArchitectureVersion: 2,
                    canvas,
                    components: originalComponents,
                    timeline: baseTimeline()
                });
            }
            if (!compositions.some((composition) => composition?.id === config.stateId)) {
                compositions.push({
                    id: config.stateId,
                    name: config.stateName,
                    description: `Default and Disabled visual states for ${config.parentName}.`,
                    surface: "controller",
                    compositionKind: "prefab",
                    isCustom: false,
                    timelineArchitectureVersion: 2,
                    canvas,
                    components: [referenceComponent(config.artReferenceId, config.artName, config.artInstanceLabel, config.artId, canvas)],
                    timeline: stateTimeline(config.artReferenceId)
                });
            }
            if (!compositions.some((composition) => composition?.id === config.interactionId)) {
                compositions.push({
                    id: config.interactionId,
                    name: config.interactionName,
                    description: `Default, Down, Up, HoverIn, and HoverOut interactions for ${config.parentName}.`,
                    surface: "controller",
                    compositionKind: "prefab",
                    isCustom: false,
                    timelineArchitectureVersion: 2,
                    canvas,
                    components: [referenceComponent(config.stateReferenceId, config.stateName, config.stateInstanceLabel, config.stateId, canvas)],
                    timeline: interactionTimeline(config.stateReferenceId, canvas)
                });
            }
            parent.name = config.parentName;
            parent.description = `Lifecycle wrapper for ${config.parentName}.`;
            parent.surface = "controller";
            parent.compositionKind = "prefab";
            parent.isCustom = false;
            parent.timelineArchitectureVersion = 2;
            parent.components = [referenceComponent(config.interactionReferenceId, config.interactionName, config.interactionInstanceLabel, config.interactionId, canvas)];
            parent.timeline = lifecycleTimeline(config.interactionReferenceId);
        }
        return compositions;
    }
    function isNestedParentOverride(config, override) {
        return Boolean((Array.isArray(override?.components) ? override.components : []).some((component) => component?.kind === "reference" && component?.artCompositionId === config.interactionId));
    }
    function controllerButtonOverride(composition, manifestCompositions = {}) {
        const explicit = manifestCompositions?.[composition.id] || null;
        const parentConfig = configForParent(composition.id);
        if (parentConfig && explicit && !isNestedParentOverride(parentConfig, explicit)) {
            return {
                ...clone(explicit),
                compositionKind: "prefab",
                timelineArchitectureVersion: 2,
                components: clone(composition.components || []),
                timeline: clone(composition.timeline || null)
            };
        }
        const artConfig = configForArt(composition.id);
        if (artConfig && !explicit) {
            const legacyParent = manifestCompositions?.[artConfig.parentId];
            if (legacyParent && !isNestedParentOverride(artConfig, legacyParent)) {
                const legacyComponents = applyBaseInstanceLabels(clone(Array.isArray(legacyParent.components) ? legacyParent.components : []));
                if (legacyComponents.length) {
                    return {
                        name: artConfig.artName,
                        description: `Migrated base art used by ${artConfig.parentName}.`,
                        surface: "controller",
                        compositionKind: "prefab",
                        isCustom: false,
                        timelineArchitectureVersion: 2,
                        canvas: clone(legacyParent.canvas || composition.canvas || { width: 1, height: 1 }),
                        components: legacyComponents,
                        timeline: clone(composition.timeline || baseTimeline()),
                        updatedAt: legacyParent.updatedAt || null
                    };
                }
            }
        }
        return explicit;
    }
    function controllerButtonInteractionReferenceId(parentCompositionId) {
        return configForParent(parentCompositionId)?.interactionReferenceId || "";
    }
    function controllerButtonStateReferenceId(parentCompositionId) {
        return configForParent(parentCompositionId)?.stateReferenceId || "";
    }
    module.exports = {
        controllerButtonConfigs,
        controllerButtonInteractionReferenceId,
        controllerButtonOverride,
        controllerButtonStateReferenceId,
        installDefaultControllerButtonCompositions
    };
})();
