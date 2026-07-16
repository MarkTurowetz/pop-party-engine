"use strict";
// TypeScript source for the server-side default game data (flow, layouts, art, constants).
// Built to shared/game-data.js via `npm run build:shared` (committed output). Server-only
// CommonJS (require + module.exports) — no client global. Every other shared/*.ts is
// scope-isolated, so this module's top-level names don't collide in the shared compilation.
const { availableFlowActionTypes } = require("./flow-action-registry");
const { defaultPlayerPointPopupTimeline } = require("./player-point-popup-timeline");
const { defaultLayoutTextFieldCompositions } = require("./layout-text-art");
const { installDefaultLobbyWidgetCompositions } = require("./lobby-widget-art");
const { installDefaultControllerButtonCompositions } = require("./controller-button-art");
const availableFlowTransitions = [
    { id: "horizontalWipe", name: "Horizontal Wipe" }
];
const multipleChoicePrompts = [
    {
        id: "four-letter-word",
        prompt: "Which of these is a 4-letter word?",
        options: ["Hi", "Cat", "Fish", "House"],
        correctAnswerIndex: 3
    },
    {
        id: "animal-that-flies",
        prompt: "Which of these animals can fly?",
        options: ["Dog", "Penguin", "Falcon", "Horse"],
        correctAnswerIndex: 3
    },
    {
        id: "planet-red",
        prompt: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Neptune"],
        correctAnswerIndex: 2
    },
    {
        id: "water-freezes",
        prompt: "At what temperature does water freeze in Celsius?",
        options: ["0", "10", "50", "100"],
        correctAnswerIndex: 1
    },
    {
        id: "largest-ocean",
        prompt: "Which ocean is the largest?",
        options: ["Atlantic", "Pacific", "Indian", "Arctic"],
        correctAnswerIndex: 2
    },
    {
        id: "primary-color",
        prompt: "Which of these is a primary color?",
        options: ["Green", "Purple", "Red", "Orange"],
        correctAnswerIndex: 3
    },
    {
        id: "weekday-after-monday",
        prompt: "Which day comes after Monday?",
        options: ["Sunday", "Tuesday", "Friday", "Saturday"],
        correctAnswerIndex: 2
    },
    {
        id: "shape-three-sides",
        prompt: "Which shape has three sides?",
        options: ["Square", "Circle", "Triangle", "Hexagon"],
        correctAnswerIndex: 3
    },
    {
        id: "five-plus-two",
        prompt: "What is 5 + 2?",
        options: ["6", "7", "8", "9"],
        correctAnswerIndex: 2
    },
    {
        id: "instrument-keys",
        prompt: "Which instrument usually has keys?",
        options: ["Drum", "Piano", "Trumpet", "Violin"],
        correctAnswerIndex: 2
    },
    {
        id: "opposite-hot",
        prompt: "Which word is the opposite of hot?",
        options: ["Warm", "Cold", "Bright", "Fast"],
        correctAnswerIndex: 2
    }
].map((item) => ({
    ...item,
    correctAnswerIndex: Math.max(0, Math.floor(Number(item.correctAnswerIndex || 1)) - 1)
}));
const defaultGameFlow = {
    states: [
        {
            id: "lobby",
            name: "Lobby Game State",
            actions: [
                {
                    id: "lobby-countdown-complete",
                    name: "On Countdown Complete",
                    type: "transitionState",
                    timing: { mode: "E+", seconds: 0 },
                    trigger: "onCountdownComplete",
                    targetState: "intro"
                }
            ]
        },
        {
            id: "intro",
            name: "Game Intro Game State",
            actions: [
                {
                    id: "intro-present-1",
                    name: "Present Intro Text",
                    type: "presentText",
                    timing: { mode: "E+", seconds: 0 },
                    textTarget: "presentation",
                    instant: false,
                    text: "I'm using this tool to dictate game actions"
                },
                {
                    id: "intro-present-2",
                    name: "Present Second Text",
                    type: "presentText",
                    timing: { mode: "E+", seconds: 0 },
                    textTarget: "presentation",
                    instant: false,
                    text: "This is the second action"
                },
                {
                    id: "intro-wipe",
                    name: "Jump To Hide Players",
                    type: "jumpNode",
                    jumpTargetActionId: "intro-hide-players"
                },
                {
                    id: "intro-hide-players",
                    name: "Hide Players",
                    type: "setPlayersShown",
                    timing: { mode: "E+", seconds: 0 },
                    isShown: false,
                    instant: false
                },
                {
                    id: "intro-show-players",
                    name: "Show Players",
                    type: "setPlayersShown",
                    timing: { mode: "E+", seconds: 0 },
                    isShown: true,
                    instant: false
                }
            ]
        }
    ]
};
const defaultPlayerColors = ["#22d3ee", "#60d394", "#ffe156", "#ff9e2c", "#ff4fa3", "#7c3aed", "#2458ff", "#ef4444", "#f97316"];
const avatarShapes = ["rex", "stego", "trike", "raptor", "bronto", "ankylo"];
const defaultGameConstants = {
    playerColors: defaultPlayerColors,
    craftingTimerDuration: 30,
    startGameCountdownDuration: 1,
    pointsForCorrectAnswer: 200,
    gameTitle: "Party Game Template",
    numberOfRounds: 3,
    randomChanceTest: 0.5,
    speechToTextSendInputBuffer: 1,
    overrideFirstGameOfSession: false
};
const defaultHostAudios = {
    hostAudios: []
};
const defaultStageLayouts = {
    canvas: { width: 1920, height: 1080 },
    global: {
        id: "global",
        name: "Global Layout",
        hiddenInStates: false,
        elements: [
            { id: "stageCodeBadge", name: "Small Room Code Widget", selector: "#stageCodeBadge", kind: "art", artCompositionId: "stage-code-widget", x: 108, y: 70, width: 170, height: 82, scale: 1 },
            { id: "presentClickWidget", name: "Cursor Widget", selector: "#presentClickWidget", kind: "art", artCompositionId: "presentation-click-prompt", x: 1780, y: 930, width: 90, height: 90, scale: 1 },
            { id: "playerLobby", name: "Player Avatars", selector: "#playerLobby", x: 960, y: 935, width: 1320, height: 150, scale: 1 }
        ]
    },
    states: [
        {
            id: "lobby",
            name: "Lobby",
            hiddenGlobals: ["stagecodebadge"],
            elements: [
                { id: "startPopup", name: "Countdown Popup", selector: "#startPopup", kind: "art", artCompositionId: "countdown-popup", x: 960, y: 130, width: 700, height: 130, scale: 1, defaultAnimationState: "park" },
                { id: "stageTitle", name: "Header", kind: "art", artCompositionId: "layout-text-field", x: 960, y: 190, width: 1080, height: 150, scale: 1, defaultText: "Party Game Template", fontSize: 92, autoFitText: false, fontColor: "#ffffff" },
                { id: "stageCodePanel", name: "Stage Code Panel", selector: ".stage-code-panel", kind: "art", artCompositionId: "stage-code-panel", x: 960, y: 390, width: 560, height: 190, scale: 1 },
                { id: "stageJoinQr", name: "Join QR Code", selector: "#stageJoinQr", kind: "art", artCompositionId: "join-qr-code", x: 1510, y: 420, width: 260, height: 300, scale: 1 },
                { id: "waitingStatus", name: "Waiting Status", selector: "#waitingStatus", kind: "art", artCompositionId: "waiting-status-widget", x: 960, y: 575, width: 700, height: 82, scale: 1 },
                { id: "joinPrompt", name: "Join Prompt", selector: "#joinPrompt", kind: "art", artCompositionId: "join-widget", x: 960, y: 650, width: 740, height: 76, scale: 1 }
            ]
        },
        {
            id: "intro",
            name: "Game Intro",
            elements: [
                { id: "stageIntroTitle", name: "Intro Header", kind: "art", artCompositionId: "layout-text-field", x: 960, y: 235, width: 1060, height: 130, scale: 1, defaultText: "GAME INTRO", fontSize: 96, autoFitText: false, fontColor: "#ffffff" },
                { id: "stagePresentationText", name: "Presentation Text", kind: "art", artCompositionId: "layout-text-field", x: 960, y: 460, width: 980, height: 240, scale: 1, defaultText: "", fontSize: 58, autoFitText: false, fontColor: "#ffffff" },
                { id: "stagePromptText", name: "Prompt Text", kind: "art", artCompositionId: "layout-text-field", x: 960, y: 760, width: 860, height: 120, scale: 1, defaultText: "Prompt Text", fontSize: 58, autoFitText: false, fontColor: "#ffffff" }
            ]
        }
    ]
};
const defaultControllerLayouts = {
    canvas: { width: 390, height: 844 },
    global: {
        id: "global",
        name: "Global Layout",
        hiddenInStates: false,
        elements: [
            { id: "controllerPlayerBanner", name: "Player Banner", selector: "#controllerPlayerBanner", kind: "art", artCompositionId: "controller-player-banner", x: 195, y: 58, width: 338, height: 78, scale: 1, defaultAnimationState: "on" }
        ]
    },
    states: [
        {
            id: "join",
            name: "Join Controller",
            hiddenGlobals: ["controllerplayerbanner"],
            elements: [
                { id: "joinTitle", name: "Join Title", kind: "art", artCompositionId: "layout-text-field", x: 195, y: 112, width: 330, height: 86, scale: 1, defaultText: "Join Lobby", fontSize: 54, autoFitText: false, fontColor: "#17131f" },
                { id: "stageCodeField", name: "Stage Code Field", selector: "#stageCodeField", kind: "art", artCompositionId: "controller-stage-code-field", x: 195, y: 255, width: 320, height: 96, scale: 1, defaultAnimationState: "on" },
                { id: "playerNameField", name: "Player Name Field", selector: "#playerNameField", kind: "art", artCompositionId: "controller-player-name-field", x: 195, y: 375, width: 320, height: 96, scale: 1, defaultAnimationState: "on" },
                { id: "joinButton", name: "Join Button", selector: "#joinButton", kind: "art", artCompositionId: "controller-primary-button", x: 195, y: 505, width: 260, height: 78, scale: 1, defaultAnimationState: "on" }
            ]
        },
        {
            id: "lobby",
            name: "Lobby Controller",
            hiddenGlobals: ["controllerplayerbanner"],
            elements: [
                { id: "controllerAvatar", name: "Player Avatar", selector: "#controllerAvatar", kind: "art", artCompositionId: "controller-avatar-button", x: 195, y: 150, width: 104, height: 104, scale: 1, defaultAnimationState: "on" },
                { id: "controllerPlayerName", name: "Player Name", kind: "art", artCompositionId: "layout-text-field", x: 195, y: 290, width: 330, height: 80, scale: 1, defaultText: "Player", fontSize: 66, autoFitText: false, fontColor: "#17131f" },
                { id: "controllerMeta", name: "Controller Status", kind: "art", artCompositionId: "layout-text-field", x: 195, y: 382, width: 330, height: 48, scale: 1, defaultText: "Waiting in lobby", fontSize: 28, autoFitText: false, fontColor: "#6b5a80" },
                { id: "startGameButton", name: "Start Game Button", selector: "#startGameButton", kind: "art", artCompositionId: "controller-primary-button", x: 195, y: 508, width: 260, height: 78, scale: 1, defaultAnimationState: "on" }
            ]
        },
        {
            id: "intro",
            name: "Game Intro Controller",
            elements: [
                { id: "controllerIntroMessage", name: "Intro Message", kind: "art", artCompositionId: "layout-text-field", x: 195, y: 250, width: 330, height: 120, scale: 1, defaultText: "Welcome to the Game", fontSize: 44, autoFitText: false, fontColor: "#17131f" },
                { id: "introPresentButton", name: "Present Button", selector: "#introPresentButton", kind: "art", artCompositionId: "controller-primary-button", x: 195, y: 450, width: 300, height: 78, scale: 1, defaultAnimationState: "on" }
            ]
        }
    ]
};
const acceptedArtTypes = {
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
};
const artAssets = [
    { id: "avatar-frame", name: "Shared Avatar Frame", category: "Player Avatar", parent: "player-avatar", defaultFile: "avatar-frame.svg", use: "Shared frame layer used by every player avatar", sharedBy: ["Rex Avatar", "Stego Avatar", "Trike Avatar", "Raptor Avatar", "Bronto Avatar", "Ankylo Avatar"] },
    { id: "avatar-rex", name: "Rex Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-rex.svg", use: "Dinosaur silhouette layer for rex slots" },
    { id: "avatar-stego", name: "Stego Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-stego.svg", use: "Dinosaur silhouette layer for stego slots" },
    { id: "avatar-trike", name: "Trike Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-trike.svg", use: "Dinosaur silhouette layer for trike slots" },
    { id: "avatar-raptor", name: "Raptor Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-raptor.svg", use: "Dinosaur silhouette layer for raptor slots" },
    { id: "avatar-bronto", name: "Bronto Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-bronto.svg", use: "Dinosaur silhouette layer for bronto slots" },
    { id: "avatar-ankylo", name: "Ankylo Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-ankylo.svg", use: "Dinosaur silhouette layer for ankylo slots" },
    { id: "presentation-click-cursor", name: "Presentation Click Cursor", category: "Presentation Click Prompt", parent: "presentation-click-prompt", defaultFile: "cursor-arrow.svg", use: "Cursor art for presented-text click prompt" }
];
const artGroups = [
    { id: "player-avatar", name: "Player Avatar", description: "Composed from the shared avatar frame plus one dinosaur silhouette." },
    { id: "player-object", name: "Player Object", description: "Composed player display object with shared player overlay prefabs." },
    { id: "presentation-click-prompt", name: "Presentation Click Prompt", description: "Standalone cursor art; it does not use the avatar frame." },
    { id: "voting-card", name: "Voting Card", description: "Composed answer card art used by voting moments." }
];
function defaultPlayerAvatarComposition(species, label, assetId) {
    return {
        id: `player-avatar-${species}`,
        name: `${label} Avatar`,
        description: "Editable player avatar art composed from a frame and masked dino image.",
        canvas: { width: 100, height: 100 },
        components: [
            {
                id: "dino-mask",
                name: "Dino Sprite",
                kind: "sprite",
                x: 50,
                y: 50,
                width: 70,
                height: 70,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                imageAssetId: assetId,
                imageObjectFit: "contain",
                imageTint: "currentColor",
                spriteRenderMode: "tinted"
            },
            {
                id: "avatar-frame",
                name: "Avatar Frame",
                kind: "shape",
                x: 50,
                y: 50,
                width: 100,
                height: 100,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rounded",
                fillColor: "#fff6d8",
                borderColor: "#17131f",
                borderWidth: 6,
                borderRadius: 13
            }
        ]
    };
}
function playerAnswerBubbleComponents() {
    return [
        {
            id: "answer-text",
            name: "Answer Text",
            kind: "text",
            x: 150,
            y: 92,
            width: 226,
            height: 78,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "park",
            defaultText: "ANSWER",
            fontSize: 28,
            autoFitText: false,
            fontColor: "#17131f"
        },
        {
            id: "answer-bubble-tail",
            name: "Answer Bubble Tail",
            kind: "shape",
            x: 150,
            y: 165,
            width: 24,
            height: 24,
            scale: 1,
            rotation: 45,
            defaultAnimationState: "park",
            shapeStyle: "rectangle",
            fillColor: "#fffdf4",
            borderColor: "#17131f",
            borderWidth: 3,
            borderRadius: 3
        },
        {
            id: "answer-bubble-card",
            name: "Answer Bubble Card",
            kind: "shape",
            x: 150,
            y: 92,
            width: 270,
            height: 128,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "park",
            shapeStyle: "rounded",
            fillColor: "#fffdf4",
            borderColor: "#17131f",
            borderWidth: 3,
            borderRadius: 18
        }
    ];
}
function playerPointPopupComponents() {
    return [
        {
            id: "point-text",
            name: "Point Text",
            kind: "text",
            x: 75,
            y: 30,
            width: 130,
            height: 52,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "on",
            defaultText: "+200",
            fontSize: 34,
            autoFitText: false,
            fontColor: "#ffe256"
        },
        {
            id: "point-shadow",
            name: "Point Shadow",
            kind: "text",
            x: 79,
            y: 34,
            width: 130,
            height: 52,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "on",
            defaultText: "+200",
            fontSize: 34,
            autoFitText: false,
            fontColor: "#17131f"
        }
    ];
}
function playerNameWidgetComponents() {
    return [
        {
            id: "name-shadow",
            name: "Name Shadow",
            kind: "shape",
            x: 65,
            y: 23,
            width: 118,
            height: 34,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "on",
            shapeStyle: "rounded",
            fillColor: "rgba(23, 19, 31, 0.42)",
            borderColor: "transparent",
            borderWidth: 0,
            borderRadius: 999
        },
        {
            id: "name-card",
            name: "Name Card",
            kind: "shape",
            x: 61,
            y: 19,
            width: 118,
            height: 34,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "on",
            shapeStyle: "rounded",
            fillColor: "#fffdf4",
            borderColor: "#17131f",
            borderWidth: 3,
            borderRadius: 999
        },
        {
            id: "name-text",
            name: "Name Text",
            kind: "text",
            x: 61,
            y: 19,
            width: 96,
            height: 22,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "on",
            defaultText: "Player",
            fontSize: 17,
            autoFitText: true,
            fontColor: "#17131f"
        }
    ];
}
function playerVipWidgetComponents() {
    return [
        {
            id: "vip-card",
            name: "VIP Card",
            kind: "shape",
            x: 22,
            y: 11,
            width: 44,
            height: 22,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "on",
            shapeStyle: "rounded",
            fillColor: "#ffe256",
            borderColor: "#17131f",
            borderWidth: 2,
            borderRadius: 999
        },
        {
            id: "vip-text",
            name: "VIP Text",
            kind: "text",
            x: 22,
            y: 11,
            width: 34,
            height: 12,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "on",
            defaultText: "VIP",
            fontSize: 11,
            autoFitText: false,
            fontColor: "#17131f"
        }
    ];
}
function defaultPlayerObjectComposition(species, label, assetId) {
    return {
        id: `player-object-${species}`,
        name: `${label} Player Object`,
        description: "Editable player object composed from shared answer bubble, avatar, name, and VIP prefabs.",
        canvas: { width: 300, height: 370 },
        components: [
            {
                id: "answer-bubble",
                name: "Answer Bubble Slot",
                kind: "reference",
                x: 150,
                y: 96,
                width: 300,
                height: 180,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "park",
                artCompositionId: "player-answer-bubble"
            },
            {
                id: "avatar",
                name: "Player Avatar",
                kind: "container",
                x: 150,
                y: 234,
                width: 100,
                height: 100,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rectangle",
                fillColor: "transparent",
                borderColor: "transparent",
                borderWidth: 0,
                borderRadius: 0,
                children: [
                    {
                        id: "dino-mask",
                        name: "Dino Sprite",
                        kind: "sprite",
                        x: 50,
                        y: 50,
                        width: 70,
                        height: 70,
                        scale: 1,
                        rotation: 0,
                        defaultAnimationState: "on",
                        imageAssetId: assetId,
                        imageObjectFit: "contain",
                        imageTint: "currentColor",
                        spriteRenderMode: "tinted"
                    },
                    {
                        id: "avatar-frame",
                        name: "Avatar Frame",
                        kind: "shape",
                        x: 50,
                        y: 50,
                        width: 100,
                        height: 100,
                        scale: 1,
                        rotation: 0,
                        defaultAnimationState: "on",
                        shapeStyle: "rounded",
                        fillColor: "#fff6d8",
                        borderColor: "#17131f",
                        borderWidth: 6,
                        borderRadius: 13
                    }
                ]
            },
            {
                id: "player-name",
                name: "Player Name Widget",
                kind: "reference",
                x: 150,
                y: 309,
                width: 126,
                height: 42,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                artCompositionId: "player-name-widget"
            },
            {
                id: "vip-badge",
                name: "VIP Badge Widget",
                kind: "reference",
                x: 150,
                y: 345,
                width: 52,
                height: 28,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "park",
                artCompositionId: "player-vip-widget"
            }
        ]
    };
}
function controllerShapeComponent(id, name, width, height, overrides = {}) {
    return {
        id,
        name,
        kind: "shape",
        x: width / 2,
        y: height / 2,
        width,
        height,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: overrides.shapeStyle || "rounded",
        fillColor: overrides.fillColor || "#fffdf4",
        borderColor: overrides.borderColor || "#17131f",
        borderWidth: overrides.borderWidth ?? 4,
        borderRadius: overrides.borderRadius ?? 18
    };
}
function controllerTextComponent(id, name, text, x, y, width, height, fontSize = 24, fontColor = "#17131f") {
    return {
        id,
        name,
        kind: "text",
        x,
        y,
        width,
        height,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: text,
        fontSize,
        autoFitText: false,
        fontColor
    };
}
function defaultControllerComposition(id, name, description, canvas, components) {
    return {
        id,
        name,
        surface: "controller",
        description,
        canvas,
        components
    };
}
const defaultArtCompositions = [
    ...defaultLayoutTextFieldCompositions(),
    defaultControllerComposition("controller-primary-button", "Controller Primary Button", "Editable controller button art used by join, start, present, next, submit, and microphone buttons.", { width: 300, height: 78 }, [
        controllerTextComponent("button-text", "Button Text", "BUTTON", 150, 39, 250, 44, 24),
        controllerShapeComponent("button-card", "Button Card", 300, 78, {
            fillColor: "#22d3ee",
            borderWidth: 4,
            borderRadius: 18
        })
    ]),
    defaultControllerComposition("controller-text-input-field", "Controller Text Input Field", "Editable controller text-entry field art.", { width: 330, height: 128 }, [
        controllerTextComponent("placeholder-text", "Placeholder Text", "Answer here", 165, 64, 284, 58, 24, "#6b5a80"),
        controllerShapeComponent("input-card", "Input Card", 330, 128, {
            fillColor: "#fffdf4",
            borderWidth: 4,
            borderRadius: 18
        })
    ]),
    defaultControllerComposition("controller-stage-code-field", "Controller Stage Code Field", "Editable controller stage-code entry field art.", { width: 320, height: 96 }, [
        controllerTextComponent("field-label", "Field Label", "STAGE CODE", 160, 18, 260, 22, 16, "#6b5a80"),
        controllerTextComponent("field-value", "Field Value", "ABCD", 160, 56, 260, 42, 34),
        controllerShapeComponent("field-card", "Field Card", 320, 96, {
            fillColor: "#fffdf4",
            borderWidth: 4,
            borderRadius: 18
        })
    ]),
    defaultControllerComposition("controller-player-name-field", "Controller Player Name Field", "Editable controller player-name entry field art.", { width: 320, height: 96 }, [
        controllerTextComponent("field-label", "Field Label", "PLAYER NAME", 160, 18, 260, 22, 16, "#6b5a80"),
        controllerTextComponent("field-value", "Field Value", "Your name", 160, 56, 260, 42, 30),
        controllerShapeComponent("field-card", "Field Card", 320, 96, {
            fillColor: "#fffdf4",
            borderWidth: 4,
            borderRadius: 18
        })
    ]),
    defaultControllerComposition("controller-player-banner", "Controller Player Banner", "Editable controller top player banner art.", { width: 338, height: 78 }, [
        controllerTextComponent("banner-name", "Banner Name", "PLAYER", 190, 39, 220, 42, 30),
        controllerShapeComponent("banner-card", "Banner Card", 338, 78, {
            fillColor: "#fffdf4",
            borderWidth: 4,
            borderRadius: 18
        })
    ]),
    defaultControllerComposition("controller-avatar-button", "Controller Avatar Button", "Editable controller avatar button background art.", { width: 104, height: 104 }, [
        controllerShapeComponent("avatar-card", "Avatar Card", 104, 104, {
            fillColor: "#fffdf4",
            borderWidth: 4,
            borderRadius: 18
        })
    ]),
    defaultControllerComposition("controller-choice-option", "Controller Choice Option", "Editable controller multiple-choice option button art.", { width: 320, height: 72 }, [
        controllerTextComponent("option-text", "Option Text", "Option", 160, 36, 280, 40, 24),
        controllerShapeComponent("option-card", "Option Card", 320, 72, {
            fillColor: "#fffdf4",
            borderWidth: 4,
            borderRadius: 18
        })
    ]),
    defaultControllerComposition("controller-invalid-banner", "Controller Invalid Banner", "Editable controller invalid submission banner art.", { width: 330, height: 64 }, [
        controllerTextComponent("invalid-text", "Invalid Text", "Your submission was invalid", 165, 32, 290, 34, 20, "#17131f"),
        controllerShapeComponent("invalid-card", "Invalid Card", 330, 64, {
            fillColor: "#ff9e2c",
            borderWidth: 4,
            borderRadius: 16
        })
    ]),
    defaultPlayerAvatarComposition("rex", "Rex", "avatar-rex"),
    defaultPlayerAvatarComposition("stego", "Stego", "avatar-stego"),
    defaultPlayerAvatarComposition("trike", "Trike", "avatar-trike"),
    defaultPlayerAvatarComposition("raptor", "Raptor", "avatar-raptor"),
    defaultPlayerAvatarComposition("bronto", "Bronto", "avatar-bronto"),
    defaultPlayerAvatarComposition("ankylo", "Ankylo", "avatar-ankylo"),
    {
        id: "player-answer-bubble",
        name: "Player Answer Bubble",
        description: "Shared editable answer bubble art used by every player object.",
        canvas: { width: 300, height: 180 },
        components: playerAnswerBubbleComponents()
    },
    {
        id: "player-point-popup",
        name: "Player Point Popup",
        description: "Shared editable scoring popup art spawned when points are shown.",
        canvas: { width: 150, height: 60 },
        timeline: defaultPlayerPointPopupTimeline(),
        components: playerPointPopupComponents()
    },
    {
        id: "player-name-widget",
        name: "Player Name Widget",
        description: "Shared editable player name pill nested inside every player object.",
        canvas: { width: 126, height: 42 },
        components: playerNameWidgetComponents()
    },
    {
        id: "player-vip-widget",
        name: "Player VIP Widget",
        description: "Shared editable VIP badge nested inside every player object.",
        canvas: { width: 52, height: 28 },
        components: playerVipWidgetComponents()
    },
    defaultPlayerObjectComposition("rex", "Rex", "avatar-rex"),
    defaultPlayerObjectComposition("stego", "Stego", "avatar-stego"),
    defaultPlayerObjectComposition("trike", "Trike", "avatar-trike"),
    defaultPlayerObjectComposition("raptor", "Raptor", "avatar-raptor"),
    defaultPlayerObjectComposition("bronto", "Bronto", "avatar-bronto"),
    defaultPlayerObjectComposition("ankylo", "Ankylo", "avatar-ankylo"),
    {
        id: "voting-card",
        name: "Voting Card",
        description: "Composed from a current card, answer text, author heading, voter container, vote count, and voter widgets.",
        canvas: { width: 560, height: 230 },
        components: [
            {
                id: "current-card",
                name: "Current Card",
                kind: "shape",
                x: 280,
                y: 96,
                width: 520,
                height: 118,
                scale: 1,
                fillColor: "#fff8d6",
                borderColor: "#17131f",
                borderWidth: 5,
                borderRadius: 16
            },
            {
                id: "answer-text",
                name: "Answer Text",
                kind: "text",
                x: 280,
                y: 96,
                width: 420,
                height: 78,
                scale: 1,
                defaultText: "ANSWER TEXT",
                fontSize: 32,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "author-heading",
                name: "Author Heading Widget",
                kind: "text",
                x: 280,
                y: 22,
                width: 340,
                height: 28,
                scale: 1,
                defaultText: "AUTHOR NAME",
                fontSize: 15,
                autoFitText: true,
                fontColor: "#6b5a80"
            },
            {
                id: "voter-container",
                name: "Player Vote Widget Container",
                kind: "container",
                x: 278,
                y: 188,
                width: 500,
                height: 48,
                scale: 1,
                childDistribution: "horizontal",
                fillColor: "transparent",
                borderColor: "transparent",
                borderWidth: 0,
                borderRadius: 0
            },
            {
                id: "vote-count",
                name: "Vote Count Widget",
                kind: "badge",
                x: 72,
                y: 188,
                width: 112,
                height: 32,
                scale: 1,
                fillColor: "#fff8d6",
                borderColor: "#17131f",
                borderWidth: 2,
                borderRadius: 999,
                fontSize: 15,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "vote-widget",
                name: "Player Vote Widget",
                kind: "badge",
                x: 280,
                y: 188,
                width: 112,
                height: 32,
                scale: 1,
                fillColor: "#fff8d6",
                borderColor: "#17131f",
                borderWidth: 2,
                borderRadius: 999,
                fontSize: 15,
                autoFitText: true,
                fontColor: "#17131f"
            }
        ]
    },
    {
        id: "presentation-click-prompt",
        name: "Presentation Click Prompt",
        description: "Editable prompt art shown when the VIP can advance presented text.",
        canvas: { width: 92, height: 92 },
        components: [
            {
                id: "cursor-shape",
                name: "Cursor Sprite",
                kind: "sprite",
                x: 46,
                y: 46,
                width: 72,
                height: 72,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                imageAssetId: "presentation-click-cursor",
                imageObjectFit: "contain",
                imageTint: "currentColor",
                spriteRenderMode: "tinted"
            }
        ]
    },
    {
        id: "stage-code-panel",
        name: "Stage Code Panel",
        description: "Editable lobby card that displays the current stage code.",
        canvas: { width: 560, height: 190 },
        components: [
            {
                id: "panel-code",
                name: "Panel Code",
                kind: "text",
                x: 280,
                y: 120,
                width: 500,
                height: 105,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "NUZ7",
                fontSize: 112,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "panel-label",
                name: "Panel Label",
                kind: "text",
                x: 280,
                y: 54,
                width: 420,
                height: 34,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "STAGE CODE",
                fontSize: 22,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "panel-card",
                name: "Panel Card",
                kind: "shape",
                x: 280,
                y: 95,
                width: 560,
                height: 190,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rounded",
                fillColor: "#ffe256",
                borderColor: "#17131f",
                borderWidth: 5,
                borderRadius: 24
            }
        ]
    },
    {
        id: "stage-code-widget",
        name: "Small Room Code Widget",
        description: "Editable small global stage-code badge.",
        canvas: { width: 170, height: 82 },
        components: [
            {
                id: "badge-code",
                name: "Badge Code",
                kind: "text",
                x: 85,
                y: 50,
                width: 140,
                height: 32,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "NUZ7",
                fontSize: 32,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "badge-label",
                name: "Badge Label",
                kind: "text",
                x: 85,
                y: 22,
                width: 130,
                height: 14,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "STAGE",
                fontSize: 10,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "badge-card",
                name: "Badge Card",
                kind: "shape",
                x: 85,
                y: 41,
                width: 170,
                height: 82,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rounded",
                fillColor: "#ffe256",
                borderColor: "#17131f",
                borderWidth: 4,
                borderRadius: 14
            }
        ]
    },
    {
        id: "join-widget",
        name: "Join Widget",
        description: "Editable lobby instruction text.",
        canvas: { width: 740, height: 76 },
        components: [
            {
                id: "join-text",
                name: "Join Text",
                kind: "text",
                x: 370,
                y: 38,
                width: 704,
                height: 52,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "Join the Lobby at bit.ly/popcontroller",
                fontSize: 28,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "join-pill",
                name: "Join Pill",
                kind: "shape",
                x: 370,
                y: 38,
                width: 740,
                height: 76,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "pill",
                fillColor: "#fff6d8",
                borderColor: "#17131f",
                borderWidth: 4,
                borderRadius: 999
            }
        ]
    },
    {
        id: "waiting-status-widget",
        name: "Waiting Status",
        description: "Editable lobby status pill.",
        canvas: { width: 700, height: 82 },
        components: [
            {
                id: "status-text",
                name: "Status Text",
                kind: "text",
                x: 350,
                y: 41,
                width: 640,
                height: 48,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "Waiting for Ava to start the game",
                fontSize: 30,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "status-pill",
                name: "Status Pill",
                kind: "shape",
                x: 350,
                y: 41,
                width: 700,
                height: 76,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "pill",
                fillColor: "#fffdf4",
                borderColor: "#17131f",
                borderWidth: 4,
                borderRadius: 999
            }
        ]
    },
    {
        id: "countdown-popup",
        name: "Countdown Popup",
        description: "Editable popup shown while the lobby countdown is running.",
        canvas: { width: 700, height: 130 },
        components: [
            {
                id: "popup-text",
                name: "Popup Text",
                kind: "text",
                x: 350,
                y: 65,
                width: 600,
                height: 78,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "Starting Game",
                fontSize: 54,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "popup-card",
                name: "Popup Card",
                kind: "shape",
                x: 350,
                y: 65,
                width: 660,
                height: 104,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rounded",
                fillColor: "#60d394",
                borderColor: "#17131f",
                borderWidth: 5,
                borderRadius: 20
            }
        ]
    },
    {
        id: "crafting-timer-widget",
        name: "Crafting Timer",
        description: "Editable timer art used during timed input moments.",
        canvas: { width: 180, height: 180 },
        components: [
            {
                id: "timer-value",
                name: "Timer Value",
                instanceLabel: "timerValue",
                kind: "text",
                x: 90,
                y: 92,
                width: 130,
                height: 82,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "30",
                fontSize: 74,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "timer-ring",
                name: "Timer Ring",
                instanceLabel: "timerRing",
                kind: "shape",
                x: 90,
                y: 90,
                width: 180,
                height: 180,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rounded",
                fillColor: "#fffdf4",
                fillCss: "radial-gradient(circle at center, #fffdf4 0 54%, transparent 55%), conic-gradient(#2458ff calc(var(--timer-progress, 1) * 1turn), rgba(23, 19, 31, 0.16) 0)",
                borderColor: "#17131f",
                borderWidth: 5,
                borderRadius: 36
            }
        ]
    },
    {
        id: "join-qr-code",
        name: "Join QR Code",
        description: "Editable QR join card art used by the lobby layout.",
        canvas: { width: 260, height: 300 },
        components: [
            {
                id: "qr-label",
                name: "QR Label",
                kind: "text",
                x: 130,
                y: 248,
                width: 220,
                height: 24,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                defaultText: "SCAN TO JOIN",
                fontSize: 20,
                autoFitText: true,
                fontColor: "#17131f"
            },
            {
                id: "qr-placeholder",
                name: "QR Placeholder",
                kind: "shape",
                x: 130,
                y: 124,
                width: 212,
                height: 212,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rectangle",
                fillColor: "#fffdf4",
                borderColor: "#17131f",
                borderWidth: 3,
                borderRadius: 8
            },
            {
                id: "qr-card",
                name: "QR Card",
                kind: "shape",
                x: 130,
                y: 150,
                width: 260,
                height: 300,
                scale: 1,
                rotation: 0,
                defaultAnimationState: "on",
                shapeStyle: "rounded",
                fillColor: "#fffdf4",
                borderColor: "#17131f",
                borderWidth: 5,
                borderRadius: 18
            }
        ]
    }
];
installDefaultLobbyWidgetCompositions(defaultArtCompositions);
installDefaultControllerButtonCompositions(defaultArtCompositions);
module.exports = {
    acceptedArtTypes,
    defaultArtCompositions,
    artAssets,
    artGroups,
    availableFlowActionTypes,
    availableFlowTransitions,
    avatarShapes,
    defaultControllerLayouts,
    defaultGameConstants,
    defaultGameFlow,
    defaultHostAudios,
    defaultPlayerColors,
    defaultStageLayouts,
    multipleChoicePrompts
};
