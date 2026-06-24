const { availableFlowActionTypes } = require("./flow-action-registry");

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
      { id: "stageCodeBadge", name: "Small Room Code Widget", selector: "#stageCodeBadge", x: 108, y: 70, width: 170, height: 82, scale: 1 },
      { id: "presentClickWidget", name: "Cursor Widget", selector: "#presentClickWidget", x: 1780, y: 930, width: 90, height: 90, scale: 1 },
      { id: "playerLobby", name: "Player Avatars", selector: "#playerLobby", x: 960, y: 935, width: 1320, height: 150, scale: 1 }
    ]
  },
  states: [
    {
      id: "lobby",
      name: "Lobby",
      hiddenGlobals: ["stagecodebadge"],
      elements: [
        { id: "startPopup", name: "Countdown Popup", selector: "#startPopup", x: 960, y: 130, width: 700, height: 130, scale: 1 },
        { id: "stageTitle", name: "Header", selector: ".stage-title", x: 960, y: 190, width: 1080, height: 150, scale: 1 },
        { id: "stageCodePanel", name: "Stage Code Panel", selector: ".stage-code-panel", x: 960, y: 390, width: 560, height: 190, scale: 1 },
        { id: "stageJoinQr", name: "Join QR Code", selector: "#stageJoinQr", x: 1510, y: 420, width: 260, height: 300, scale: 1 },
        { id: "waitingStatus", name: "Waiting Status", selector: "#waitingStatus", x: 960, y: 575, width: 700, height: 82, scale: 1 },
        { id: "joinPrompt", name: "Join Prompt", selector: "#joinPrompt", x: 960, y: 650, width: 740, height: 76, scale: 1 }
      ]
    },
    {
      id: "intro",
      name: "Game Intro",
      elements: [
        { id: "stageIntroTitle", name: "Intro Header", selector: "#stageIntroTitle", x: 960, y: 235, width: 1060, height: 130, scale: 1 },
        { id: "stagePresentationText", name: "Presentation Text", selector: "#stagePresentationText", kind: "text", x: 960, y: 460, width: 980, height: 240, scale: 1 },
        { id: "stagePromptText", name: "Prompt Text", selector: "#stagePromptText", kind: "text", x: 960, y: 760, width: 860, height: 120, scale: 1 }
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
      { id: "controllerPlayerBanner", name: "Player Banner", selector: "#controllerPlayerBanner", x: 195, y: 58, width: 338, height: 78, scale: 1 }
    ]
  },
  states: [
    {
      id: "join",
      name: "Join Controller",
      hiddenGlobals: ["controllerplayerbanner"],
      elements: [
        { id: "joinTitle", name: "Join Title", selector: "#joinTitle", kind: "text", x: 195, y: 112, width: 330, height: 86, scale: 1, defaultText: "Join Lobby", fontSize: 54, autoFitText: true, fontColor: "#17131f" },
        { id: "stageCodeField", name: "Stage Code Field", selector: "#stageCodeField", x: 195, y: 255, width: 320, height: 96, scale: 1 },
        { id: "playerNameField", name: "Player Name Field", selector: "#playerNameField", x: 195, y: 375, width: 320, height: 96, scale: 1 },
        { id: "joinButton", name: "Join Button", selector: "#joinButton", x: 195, y: 505, width: 260, height: 78, scale: 1 }
      ]
    },
    {
      id: "lobby",
      name: "Lobby Controller",
      hiddenGlobals: ["controllerplayerbanner"],
      elements: [
        { id: "controllerAvatar", name: "Player Avatar", selector: "#controllerAvatar", x: 195, y: 150, width: 104, height: 104, scale: 1 },
        { id: "controllerPlayerName", name: "Player Name", selector: "#controllerPlayerName", kind: "text", x: 195, y: 290, width: 330, height: 80, scale: 1, defaultText: "Player", fontSize: 66, autoFitText: true, fontColor: "#17131f" },
        { id: "controllerMeta", name: "Controller Status", selector: "#controllerMeta", kind: "text", x: 195, y: 382, width: 330, height: 48, scale: 1, defaultText: "Waiting in lobby", fontSize: 28, autoFitText: true, fontColor: "#6b5a80" },
        { id: "startGameButton", name: "Start Game Button", selector: "#startGameButton", x: 195, y: 508, width: 260, height: 78, scale: 1 }
      ]
    },
    {
      id: "intro",
      name: "Game Intro Controller",
      elements: [
        { id: "controllerIntroMessage", name: "Intro Message", selector: "#controllerIntroMessage", kind: "text", x: 195, y: 250, width: 330, height: 120, scale: 1, defaultText: "Welcome to the Game", fontSize: 44, autoFitText: true, fontColor: "#17131f" },
        { id: "introPresentButton", name: "Present Button", selector: "#introPresentButton", x: 195, y: 450, width: 300, height: 78, scale: 1 }
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
        name: "Dino Image Mask",
        kind: "shape",
        x: 50,
        y: 50,
        width: 70,
        height: 70,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: "rectangle",
        fillColor: "currentColor",
        borderColor: "transparent",
        borderWidth: 0,
        borderRadius: 0,
        imageAssetId: assetId,
        imageObjectFit: "contain",
        imageTint: "currentColor"
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
        shapeStyle: "rectangle",
        fillColor: "transparent",
        borderColor: "transparent",
        borderWidth: 0,
        borderRadius: 0,
        imageAssetId: "avatar-frame",
        imageObjectFit: "contain"
      }
    ]
  };
}

const defaultArtCompositions = [
  defaultPlayerAvatarComposition("rex", "Rex", "avatar-rex"),
  defaultPlayerAvatarComposition("stego", "Stego", "avatar-stego"),
  defaultPlayerAvatarComposition("trike", "Trike", "avatar-trike"),
  defaultPlayerAvatarComposition("raptor", "Raptor", "avatar-raptor"),
  defaultPlayerAvatarComposition("bronto", "Bronto", "avatar-bronto"),
  defaultPlayerAvatarComposition("ankylo", "Ankylo", "avatar-ankylo"),
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
        name: "Cursor Shape",
        kind: "shape",
        x: 46,
        y: 46,
        width: 72,
        height: 72,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: "rectangle",
        fillColor: "currentColor",
        borderColor: "transparent",
        borderWidth: 0,
        borderRadius: 0,
        imageAssetId: "presentation-click-cursor",
        imageObjectFit: "contain",
        imageTint: "currentColor"
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
        id: "panel-card",
        name: "Panel Card",
        kind: "shape",
        x: 280,
        y: 95,
        width: 540,
        height: 170,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: "rounded",
        fillColor: "#fff8d6",
        borderColor: "#17131f",
        borderWidth: 5,
        borderRadius: 18
      },
      {
        id: "panel-label",
        name: "Panel Label",
        kind: "text",
        x: 280,
        y: 52,
        width: 320,
        height: 30,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "STAGE",
        fontSize: 24,
        autoFitText: true,
        fontColor: "#17131f"
      },
      {
        id: "panel-code",
        name: "Panel Code",
        kind: "text",
        x: 280,
        y: 108,
        width: 420,
        height: 78,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "NUZ7",
        fontSize: 72,
        autoFitText: true,
        fontColor: "#17131f"
      }
    ]
  },
  {
    id: "stage-code-widget",
    name: "Small Room Code Widget",
    description: "Editable small global stage-code badge.",
    canvas: { width: 210, height: 112 },
    components: [
      {
        id: "badge-card",
        name: "Badge Card",
        kind: "shape",
        x: 105,
        y: 56,
        width: 190,
        height: 92,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: "rounded",
        fillColor: "#ffe256",
        borderColor: "#17131f",
        borderWidth: 4,
        borderRadius: 14
      },
      {
        id: "badge-label",
        name: "Badge Label",
        kind: "text",
        x: 105,
        y: 30,
        width: 140,
        height: 22,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "STAGE",
        fontSize: 18,
        autoFitText: true,
        fontColor: "#17131f"
      },
      {
        id: "badge-code",
        name: "Badge Code",
        kind: "text",
        x: 105,
        y: 64,
        width: 150,
        height: 42,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "NUZ7",
        fontSize: 42,
        autoFitText: true,
        fontColor: "#17131f"
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
        width: 720,
        height: 58,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "Join the Lobby at bit.ly/popcontroller",
        fontSize: 42,
        autoFitText: true,
        fontColor: "#ffffff"
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
        fillColor: "#ffe256",
        borderColor: "#17131f",
        borderWidth: 5,
        borderRadius: 20
      },
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
      }
    ]
  },
  {
    id: "crafting-timer-widget",
    name: "Crafting Timer",
    description: "Editable timer art used during timed input moments.",
    canvas: { width: 190, height: 190 },
    components: [
      {
        id: "timer-ring",
        name: "Timer Ring",
        kind: "shape",
        x: 95,
        y: 95,
        width: 170,
        height: 170,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: "circle",
        fillColor: "#ffe256",
        borderColor: "#17131f",
        borderWidth: 6,
        borderRadius: 999
      },
      {
        id: "timer-value",
        name: "Timer Value",
        kind: "text",
        x: 95,
        y: 95,
        width: 120,
        height: 82,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "30",
        fontSize: 72,
        autoFitText: true,
        fontColor: "#17131f"
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
        id: "qr-card",
        name: "QR Card",
        kind: "shape",
        x: 130,
        y: 150,
        width: 240,
        height: 280,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: "rounded",
        fillColor: "#fffdf3",
        borderColor: "#17131f",
        borderWidth: 5,
        borderRadius: 18
      },
      {
        id: "qr-placeholder",
        name: "QR Placeholder",
        kind: "shape",
        x: 130,
        y: 118,
        width: 162,
        height: 162,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        shapeStyle: "rectangle",
        fillColor: "#ffffff",
        borderColor: "#17131f",
        borderWidth: 3,
        borderRadius: 8
      },
      {
        id: "qr-label",
        name: "QR Label",
        kind: "text",
        x: 130,
        y: 225,
        width: 180,
        height: 34,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "SCAN TO JOIN",
        fontSize: 24,
        autoFitText: true,
        fontColor: "#17131f"
      },
      {
        id: "qr-url",
        name: "QR URL",
        kind: "text",
        x: 130,
        y: 258,
        width: 190,
        height: 40,
        scale: 1,
        rotation: 0,
        defaultAnimationState: "on",
        defaultText: "controller link",
        fontSize: 14,
        autoFitText: true,
        fontColor: "#17131f"
      }
    ]
  }
];

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
