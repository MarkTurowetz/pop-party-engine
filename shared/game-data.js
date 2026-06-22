const availableFlowTransitions = [
  { id: "horizontalWipe", name: "Horizontal Wipe" }
];

const availableFlowActionTypes = [
  { id: "presentText", name: "Present Text", category: "input" },
  { id: "multipleChoiceInput", name: "Multiple Choice Input", category: "input" },
  { id: "triviaInput", name: "Trivia Input", category: "input" },
  { id: "textSubmissionInput", name: "Text Submission Input", category: "input" },
  { id: "doNothing", name: "Do Nothing", category: "standard" },
  { id: "playAudio", name: "Play Audio", category: "standard" },
  { id: "getRandomMultipleChoiceContent", name: "Get Random Multiple Choice Content", category: "standard" },
  { id: "prepareVotingCards", name: "Prepare Voting Cards", category: "standard" },
  { id: "setVotingCardsShown", name: "Set Voting Cards Shown", category: "standard" },
  { id: "voteOnAnswersInput", name: "Vote On Answers Input", category: "input" },
  { id: "revealVotingResults", name: "Reveal Voting Results", category: "standard" },
  { id: "revealAuthors", name: "Reveal Authors", category: "standard" },
  { id: "revealVotes", name: "Reveal Votes", category: "standard" },
  { id: "revealWinningAnswer", name: "Reveal Winning Answer", category: "standard" },
  { id: "setupGame", name: "Setup Game", category: "standard" },
  { id: "storePlayerAnswers", name: "Store Player Answers", category: "standard" },
  { id: "getPlayerAnswers", name: "Get Player Answers", category: "standard" },
  { id: "setupVotingMoment", name: "Setup Voting Moment", category: "standard" },
  { id: "displayText", name: "Display Text", category: "standard" },
  { id: "setPlayersShown", name: "Set Players Shown", category: "standard" },
  { id: "setPlayerAnswersShown", name: "Set Player Answers Shown", category: "standard" },
  { id: "revealPlayerAnswerCorrectness", name: "Reveal Player Answer Correctness", category: "standard" },
  { id: "showPoints", name: "Show Points", category: "standard" },
  { id: "givePendingPoints", name: "Give Pending Points", category: "standard" },
  { id: "setTimerShown", name: "Set Timer Shown", category: "standard" },
  { id: "startCraftingTimer", name: "Start Crafting Timer", category: "standard" },
  { id: "decision", name: "Decision", category: "standard" },
  { id: "transition", name: "Do Transition", category: "standard" },
  { id: "transitionState", name: "Transition To State", category: "standard" }
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
          name: "Do Horizontal Wipe",
          type: "transition",
          timing: { mode: "E+", seconds: 0 },
          transition: "horizontalWipe"
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
  overrideFirstGameOfSession: false
};

const defaultStageLayouts = {
  canvas: { width: 1920, height: 1080 },
  global: {
    id: "global",
    name: "Global Layout",
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
  { id: "presentation-click-prompt", name: "Presentation Click Prompt", description: "Standalone cursor art; it does not use the avatar frame." }
];

module.exports = {
  acceptedArtTypes,
  artAssets,
  artGroups,
  availableFlowActionTypes,
  availableFlowTransitions,
  avatarShapes,
  defaultControllerLayouts,
  defaultGameConstants,
  defaultGameFlow,
  defaultPlayerColors,
  defaultStageLayouts,
  multipleChoicePrompts
};
