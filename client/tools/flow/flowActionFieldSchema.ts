import {
  choiceInputModeOptions,
  hostAudioPlayModeOptions,
  playerFilterOptions,
  roundOptions,
  transitionTriggerOptions,
  votingCardFilterOptions,
  type FlowOption
} from "./flowActionOptions";

/**
 * Declarative description of the scalar inspector fields for each action type.
 *
 * This mirrors the legacy `appendActionTypeControls` field set (same property
 * keys → byte-compatible saves) for the scalar/enum/target controls. Array-based
 * controls (multiple-choice `options`) and decision branch panels are rendered by
 * dedicated components, not this schema.
 */
export type FlowFieldControl =
  | "text"
  | "textarea"
  | "number"
  | "integer"
  | "animationLabel"
  | "boolean"
  | "componentTarget"
  | "gameObjectTarget"
  | "stateTarget"
  | "select"
  | "textTarget"
  | "actionTarget";

export interface FlowActionFieldDescriptor {
  key: string;
  label: string;
  control: FlowFieldControl;
  options?: FlowOption[];
  min?: number;
  max?: number;
}

const TEXT_FIELDS: FlowActionFieldDescriptor[] = [
  { key: "textTarget", label: "Text Field", control: "textTarget" },
  { key: "text", label: "Text", control: "textarea" },
  { key: "isShown", label: "Text Visible", control: "boolean" }
];

const INPUT_TARGET_FIELDS: FlowActionFieldDescriptor[] = [
  { key: "timerEndTargetActionId", label: "On Timer Ends", control: "actionTarget" },
  { key: "answersSubmittedTargetActionId", label: "On Answers Submitted", control: "actionTarget" }
];

const GAME_OBJECT_TIMELINE_TARGET_FIELDS: FlowActionFieldDescriptor[] = [
  { key: "targetLayoutElementId", label: "Game Object", control: "gameObjectTarget" },
  { key: "targetComponentId", label: "Component", control: "componentTarget" },
  { key: "targetLayoutSurface", label: "Layout Surface", control: "text" },
  { key: "animationName", label: "Animation Label", control: "animationLabel" }
];

const SCHEMA: Record<string, FlowActionFieldDescriptor[]> = {
  presentText: [
    ...TEXT_FIELDS,
    { key: "instant", label: "Instant", control: "boolean" },
    { key: "stageClickTargetActionId", label: "On Stage Click", control: "actionTarget" }
  ],
  displayText: TEXT_FIELDS,
  text: TEXT_FIELDS,
  multipleChoiceInput: [
    { key: "prompt", label: "Prompt", control: "textarea" },
    { key: "inputMode", label: "Input Mode", control: "select", options: choiceInputModeOptions() },
    { key: "locked", label: "Locked", control: "boolean" },
    ...INPUT_TARGET_FIELDS
  ],
  getRandomMultipleChoiceContent: [
    { key: "variableName", label: "Variable Name", control: "text" }
  ],
  triviaInput: [
    { key: "contentVariable", label: "Content Variable", control: "text" },
    { key: "prompt", label: "Prompt", control: "textarea" },
    { key: "inputMode", label: "Input Mode", control: "select", options: choiceInputModeOptions() },
    { key: "locked", label: "Locked", control: "boolean" },
    { key: "randomizeOptions", label: "Randomize Options", control: "boolean" },
    ...INPUT_TARGET_FIELDS
  ],
  textSubmissionInput: [
    { key: "prompt", label: "Prompt", control: "textarea" },
    { key: "placeholder", label: "Placeholder", control: "text" },
    { key: "characterLimit", label: "Character Limit", control: "integer", min: 0 },
    ...INPUT_TARGET_FIELDS
  ],
  voiceSubmissionInput: [
    { key: "prompt", label: "Prompt", control: "textarea" },
    { key: "placeholder", label: "Placeholder", control: "text" },
    { key: "characterLimit", label: "Character Limit", control: "integer", min: 0 },
    ...INPUT_TARGET_FIELDS
  ],
  requestMicrophoneAccessInput: [
    { key: "prompt", label: "Prompt", control: "textarea" },
    { key: "buttonLabel", label: "Button Label", control: "text" },
    {
      key: "microphoneAccessGrantedTargetActionId",
      label: "On Access Granted",
      control: "actionTarget"
    }
  ],
  setVotingCardsShown: [
    { key: "isShown", label: "Cards Visible", control: "boolean" },
    { key: "instant", label: "Instant", control: "boolean" },
    {
      key: "cardFilter",
      label: "Card Filter",
      control: "select",
      options: votingCardFilterOptions()
    }
  ],
  voteOnAnswersInput: [
    { key: "prompt", label: "Prompt", control: "textarea" },
    ...INPUT_TARGET_FIELDS
  ],
  revealVotes: [
    {
      key: "voteRevealStaggerSeconds",
      label: "Vote Stagger Seconds",
      control: "number",
      min: 0,
      max: 60
    }
  ],
  getPlayerAnswers: [
    { key: "inputId", label: "Input Id", control: "text" },
    { key: "round", label: "Round", control: "select", options: roundOptions() },
    { key: "variableName", label: "Variable Name", control: "text" }
  ],
  playAudio: [{ key: "audioUrl", label: "Audio URL", control: "text" }],
  playHostAudio: [
    { key: "hostAudioId", label: "Host Audio Id", control: "text" },
    { key: "playMode", label: "Playback", control: "select", options: hostAudioPlayModeOptions() },
    { key: "lineIndex", label: "Line Index (0 = First)", control: "integer", min: 0 }
  ],
  labelNode: [{ key: "labelText", label: "Label Text", control: "textarea" }],
  codeNode: [{ key: "code", label: "Code", control: "textarea" }],
  logValue: [{ key: "value", label: "Variable / Value", control: "text" }],
  setGameObjectShown: [
    { key: "isShown", label: "Visible", control: "boolean" },
    { key: "targetLayoutElementId", label: "Game Object", control: "gameObjectTarget" },
    { key: "targetLayoutSurface", label: "Layout Surface", control: "text" }
  ],
  setArtAssetShown: [
    { key: "isShown", label: "Visible", control: "boolean" },
    { key: "targetLayoutElementId", label: "Game Object", control: "gameObjectTarget" },
    { key: "targetLayoutSurface", label: "Layout Surface", control: "text" }
  ],
  playGameObjectAnimation: [
    ...GAME_OBJECT_TIMELINE_TARGET_FIELDS,
    { key: "instant", label: "Instant", control: "boolean" }
  ],
  stopGameObjectAnimation: [
    ...GAME_OBJECT_TIMELINE_TARGET_FIELDS,
    { key: "instant", label: "Instant", control: "boolean" }
  ],
  setPlayersShown: [{ key: "isShown", label: "Visible", control: "boolean" }],
  setPlayerAnswersShown: [
    { key: "isShown", label: "Visible", control: "boolean" },
    {
      key: "playerFilter",
      label: "Player Filter",
      control: "select",
      options: playerFilterOptions()
    }
  ],
  showPoints: [
    {
      key: "playerFilter",
      label: "Player Filter",
      control: "select",
      options: playerFilterOptions()
    },
    { key: "points", label: "Points", control: "integer", min: 0 }
  ],
  setTimerShown: [{ key: "isShown", label: "Visible", control: "boolean" }],
  setWipeShown: [
    { key: "isShown", label: "Visible", control: "boolean" },
    { key: "instant", label: "Instant", control: "boolean" }
  ],
  setControllerLayout: [
    { key: "controllerLayoutId", label: "Controller Layout Id", control: "text" }
  ],
  jumpNode: [{ key: "jumpTargetActionId", label: "Jump Target", control: "actionTarget" }],
  decision: [
    { key: "variable", label: "Variable", control: "text" },
    { key: "valueType", label: "Value Type", control: "text" }
  ],
  transition: [{ key: "transition", label: "Transition", control: "text" }],
  transitionState: [
    { key: "targetState", label: "Target State", control: "stateTarget" },
    { key: "trigger", label: "Wait For", control: "select", options: transitionTriggerOptions() },
    { key: "nextTargetActionId", label: "On Countdown Complete", control: "actionTarget" }
  ]
};

export function actionFieldsForType(type: string): FlowActionFieldDescriptor[] {
  return SCHEMA[type] || [];
}
