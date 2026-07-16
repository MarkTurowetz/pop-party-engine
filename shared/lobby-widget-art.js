"use strict";
// Server/browser-shared definitions and migrations for Lobby layout widgets.
// Built to shared/lobby-widget-art.js via `npm run build:shared`.
(function () {
    "use strict";
    const lobbyWidgetConfigs = [
        {
            parentId: "countdown-popup",
            parentName: "Countdown Popup",
            childId: "prefab-countdown-popup-art",
            childName: "Countdown Popup Art",
            referenceId: "countdown-popup-art",
            instanceLabel: "countdownPopupArt",
            componentLabels: { "popup-text": "popupText", "popup-card": "popupCard" }
        },
        {
            parentId: "stage-code-panel",
            parentName: "Stage Code Panel",
            childId: "prefab-stage-code-panel-art",
            childName: "Stage Code Panel Art",
            referenceId: "stage-code-panel-art",
            instanceLabel: "stageCodePanelArt",
            componentLabels: { "panel-code": "panelCode", "panel-label": "panelLabel", "panel-card": "panelCard" }
        },
        {
            parentId: "join-widget",
            parentName: "Join Prompt",
            childId: "prefab-join-prompt-art",
            childName: "Join Prompt Art",
            referenceId: "join-prompt-art",
            instanceLabel: "joinPromptArt",
            componentLabels: { "join-text": "joinText", "join-pill": "joinPill" }
        },
        {
            parentId: "join-qr-code",
            parentName: "Join QR Code",
            childId: "prefab-join-qr-code-art",
            childName: "Join QR Code Art",
            referenceId: "join-qr-code-art",
            instanceLabel: "joinQrCodeArt",
            componentLabels: { "qr-label": "qrLabel", "qr-placeholder": "qrPlaceholder", "qr-card": "qrCard" }
        },
        {
            parentId: "waiting-status-widget",
            parentName: "Waiting Status",
            childId: "prefab-waiting-status-art",
            childName: "Waiting Status Art",
            referenceId: "waiting-status-art",
            instanceLabel: "waitingStatusArt",
            componentLabels: { "status-text": "statusText", "status-pill": "statusPill" }
        }
    ];
    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }
    function configForParent(compositionId) {
        return lobbyWidgetConfigs.find((config) => config.parentId === compositionId) || null;
    }
    function configForChild(compositionId) {
        return lobbyWidgetConfigs.find((config) => config.childId === compositionId) || null;
    }
    function lifecycleTimeline(referenceId) {
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
                    id: `track-${referenceId}`,
                    targetId: referenceId,
                    keyframes: [
                        { id: `${referenceId}-0`, frame: 0, props: { scale: 0.92, opacity: 0, visible: false }, easing: "hold" },
                        { id: `${referenceId}-1`, frame: 1, props: { scale: 1, opacity: 1, visible: true }, easing: "hold" },
                        { id: `${referenceId}-2`, frame: 2, props: { scale: 0.92, opacity: 0, visible: true }, easing: "easeOut" },
                        { id: `${referenceId}-8`, frame: 8, props: { scale: 1.04, opacity: 1, visible: true }, easing: "easeOut" },
                        { id: `${referenceId}-12`, frame: 12, props: { scale: 1, opacity: 1, visible: true }, easing: "hold" },
                        { id: `${referenceId}-13`, frame: 13, props: { scale: 1.03, opacity: 1, visible: true }, easing: "easeOut" },
                        { id: `${referenceId}-16`, frame: 16, props: { scale: 1, opacity: 1, visible: true }, easing: "hold" },
                        { id: `${referenceId}-17`, frame: 17, props: { scale: 1, opacity: 1, visible: true }, easing: "easeIn" },
                        { id: `${referenceId}-21`, frame: 21, props: { scale: 1.04, opacity: 1, visible: true }, easing: "easeIn" },
                        { id: `${referenceId}-32`, frame: 32, props: { scale: 0.92, opacity: 0, visible: false }, easing: "hold" }
                    ]
                }
            ]
        };
    }
    function baseTimeline() {
        return {
            fps: 30,
            frameCount: 1,
            labels: [{ name: "Default", frame: 0 }, { name: "Park", frame: 0 }],
            commands: [{ id: "stop-0", frame: 0, type: "stop" }],
            tracks: []
        };
    }
    function referenceComponent(config, canvas) {
        const width = Math.max(1, Number(canvas?.width || 1));
        const height = Math.max(1, Number(canvas?.height || 1));
        return {
            id: config.referenceId,
            name: config.childName,
            instanceLabel: config.instanceLabel,
            kind: "reference",
            x: width / 2,
            y: height / 2,
            width,
            height,
            scale: 1,
            rotation: 0,
            locked: false,
            defaultAnimationState: "",
            artCompositionId: config.childId
        };
    }
    function applyComponentLabels(config, components) {
        for (const component of components) {
            if (config.componentLabels[component?.id])
                component.instanceLabel = config.componentLabels[component.id];
        }
    }
    function installDefaultLobbyWidgetCompositions(compositions) {
        for (const config of lobbyWidgetConfigs) {
            const parent = compositions.find((composition) => composition?.id === config.parentId);
            if (!parent)
                continue;
            const canvas = clone(parent.canvas || { width: 1, height: 1 });
            const visualComponents = clone(parent.components || []);
            applyComponentLabels(config, visualComponents);
            if (!compositions.some((composition) => composition?.id === config.childId)) {
                compositions.push({
                    id: config.childId,
                    name: config.childName,
                    description: `Base visual prefab used by ${config.parentName}.`,
                    surface: parent.surface || "stage",
                    compositionKind: "prefab",
                    isCustom: false,
                    timelineArchitectureVersion: 2,
                    canvas,
                    components: visualComponents,
                    timeline: baseTimeline()
                });
            }
            parent.name = config.parentName;
            parent.description = `Reusable lifecycle prefab referenced by the Lobby ${config.parentName} layout object.`;
            parent.surface = parent.surface || "stage";
            parent.compositionKind = "prefab";
            parent.isCustom = false;
            parent.timelineArchitectureVersion = 2;
            parent.components = [referenceComponent(config, canvas)];
            parent.timeline = lifecycleTimeline(config.referenceId);
        }
        return compositions;
    }
    function migrateLobbyWidgetComponents(compositionId, components = []) {
        const parentConfig = configForParent(compositionId);
        if (parentConfig) {
            const existing = components.find((component) => component?.artCompositionId === parentConfig.childId);
            const next = existing || referenceComponent(parentConfig, { width: 1, height: 1 });
            next.id = parentConfig.referenceId;
            next.name = parentConfig.childName;
            next.instanceLabel = parentConfig.instanceLabel;
            next.kind = "reference";
            next.artCompositionId = parentConfig.childId;
            components.splice(0, components.length, next);
            return components;
        }
        const childConfig = configForChild(compositionId);
        if (childConfig)
            applyComponentLabels(childConfig, components);
        return components;
    }
    function migrateLobbyWidgetReferenceBounds(compositionId, components = [], canvas = {}) {
        const config = configForParent(compositionId);
        if (!config)
            return components;
        const reference = components.find((component) => component?.artCompositionId === config.childId);
        if (!reference)
            return components;
        const width = Math.max(1, Number(canvas?.width || 1));
        const height = Math.max(1, Number(canvas?.height || 1));
        reference.x = width / 2;
        reference.y = height / 2;
        reference.width = width;
        reference.height = height;
        return components;
    }
    function migrateLobbyWidgetKind(compositionId, compositionKind) {
        return configForParent(compositionId) || configForChild(compositionId)
            ? "prefab"
            : String(compositionKind || "gameObject");
    }
    function migrateLobbyWidgetName(compositionId, name) {
        const parentConfig = configForParent(compositionId);
        if (parentConfig && (!String(name || "").trim() || (parentConfig.parentId === "join-widget" && name === "Join Widget"))) {
            return parentConfig.parentName;
        }
        const childConfig = configForChild(compositionId);
        if (childConfig && !String(name || "").trim())
            return childConfig.childName;
        return String(name || "");
    }
    function migrateLobbyWidgetTimeline(compositionId, timeline, fallbackTimeline) {
        const config = configForParent(compositionId);
        if (!config)
            return timeline;
        const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
        const hasReferenceTrack = tracks.some((track) => track?.targetId === config.referenceId);
        return hasReferenceTrack ? timeline : fallbackTimeline;
    }
    function legacyLobbyWidgetChildOverride(childCompositionId, manifestCompositions = {}) {
        const config = configForChild(childCompositionId);
        if (!config || manifestCompositions?.[config.childId])
            return null;
        const parent = manifestCompositions?.[config.parentId];
        const legacyComponents = (Array.isArray(parent?.components) ? parent.components : [])
            .filter((component) => !(component?.kind === "reference" && component?.artCompositionId === config.childId));
        if (!legacyComponents.length)
            return null;
        return {
            name: config.childName,
            description: `Migrated visual prefab used by ${config.parentName}.`,
            surface: parent?.surface || "stage",
            compositionKind: "prefab",
            isCustom: false,
            timelineArchitectureVersion: 2,
            canvas: clone(parent?.canvas || { width: 1, height: 1 }),
            components: clone(legacyComponents),
            updatedAt: parent?.updatedAt || null
        };
    }
    function lobbyWidgetChildIdForParent(parentCompositionId) {
        return configForParent(parentCompositionId)?.childId || "";
    }
    module.exports = {
        installDefaultLobbyWidgetCompositions,
        legacyLobbyWidgetChildOverride,
        lobbyWidgetChildIdForParent,
        lobbyWidgetConfigs,
        migrateLobbyWidgetComponents,
        migrateLobbyWidgetKind,
        migrateLobbyWidgetName,
        migrateLobbyWidgetReferenceBounds,
        migrateLobbyWidgetTimeline
    };
})();
