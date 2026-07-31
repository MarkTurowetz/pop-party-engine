export declare const controllerLayoutStateIds: Readonly<{
  readonly join: "join";
  readonly lobby: "lobby";
  readonly presentation: "controller-presentation";
  readonly multipleChoice: "controller-multiple-choice";
  readonly voting: "controller-voting";
  readonly textInput: "controller-text-input";
  readonly voiceInput: "controller-voice-input";
  readonly microphoneAccess: "controller-microphone-access";
  readonly paused: "controller-paused";
}>;
export type ControllerLayoutStateId = (typeof controllerLayoutStateIds)[keyof typeof controllerLayoutStateIds];
export declare const semanticControllerLayoutStateIds: readonly [
  "controller-presentation",
  "controller-multiple-choice",
  "controller-voting",
  "controller-text-input",
  "controller-voice-input",
  "controller-microphone-access",
  "controller-paused"
];
export declare function isSemanticControllerLayoutStateId(value: unknown): value is ControllerLayoutStateId;
export declare function controllerLayoutCandidateIds(phase: unknown, selectedLayoutId: unknown, hasControllerState?: boolean, preferRequestedState?: boolean): string[];
export declare function controllerChoiceLayoutStateId(inputType: unknown): ControllerLayoutStateId;
export declare function controllerTextLayoutStateId(inputType: unknown, inputMode?: unknown): ControllerLayoutStateId;
