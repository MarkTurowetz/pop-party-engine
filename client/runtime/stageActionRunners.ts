// Typed port of the legacy client/stage/action-runners.js IIFE. Installs
// window.PartyGameStageActionRunners for the legacy stage runtime.

type Dict = Record<string, unknown>;
type Action = Dict;

interface Runtime {
  isPrimary?: boolean;
  actionKey?: string;
  applyEffect: (action: Action) => void;
  complete: (action: Action) => void;
  isCurrent: () => boolean;
}

interface RunnerDefinition {
  type: string;
  runner: string;
  delayMs?: number;
}

type BehaviorHandler = (action: Action, runtime: Runtime, definition?: RunnerDefinition) => void;

interface runnerContext {
  [key: string]: ((...args: never[]) => unknown) | undefined;
}

declare global {
  interface Window {
    PartyGameFlowActionRegistry?: { stageActionRunnerDefinitions?: RunnerDefinition[] };
    PartyGameStageActionRunners?: typeof PartyGameStageActionRunners;
  }
}

function completeAfter(action: Action, runtime: Runtime, delayMs: unknown): void {
  setTimeout(() => {
    if (!runtime.isCurrent()) return;
    runtime.complete(action);
  }, Math.max(0, Number(delayMs || 0)));
}

function completeAfterResult(action: Action, runtime: Runtime, result: unknown): void {
  if (!runtime.isPrimary) return;
  if (result && typeof (result as Promise<unknown>).then === "function") {
    (result as Promise<unknown>)
      .then((duration) => completeAfter(action, runtime, duration))
      .catch(() => completeAfter(action, runtime, 0));
    return;
  }
  completeAfter(action, runtime, result);
}

const fallbackRunnerDefinitions: RunnerDefinition[] = [
  { type: "doNothing", runner: "immediateComplete" },
  { type: "labelNode", runner: "immediateComplete" },
  { type: "codeNode", runner: "serverEffect" },
  { type: "subroutine", runner: "immediateComplete" },
  { type: "jumpNode", runner: "immediateComplete" },
  { type: "playAudio", runner: "playAudio" },
  { type: "playHostAudio", runner: "playAudio" },
  { type: "getRandomMultipleChoiceContent", runner: "serverEffect" },
  { type: "prepareVotingCards", runner: "serverEffect" },
  { type: "setVotingCardsShown", runner: "serverEffect" },
  { type: "revealVotingResults", runner: "votingReveal" },
  { type: "revealAuthors", runner: "votingReveal" },
  { type: "revealVotes", runner: "votingReveal" },
  { type: "revealWinningAnswer", runner: "votingReveal" },
  { type: "setupGame", runner: "serverEffect" },
  { type: "getPlayerAnswers", runner: "serverEffect" },
  { type: "present", runner: "displayText" },
  { type: "displayText", runner: "displayText" },
  { type: "setPlayersShown", runner: "setPlayersShown" },
  { type: "setPlayerAnswersShown", runner: "setPlayerAnswersShown" },
  { type: "setGameObjectShown", runner: "setGameObjectShown" },
  { type: "setArtAssetShown", runner: "setGameObjectShown" },
  { type: "playGameObjectAnimation", runner: "playGameObjectAnimation" },
  { type: "revealPlayerAnswerCorrectness", runner: "delayedComplete", delayMs: 250 },
  { type: "showPoints", runner: "delayedComplete", delayMs: 1500 },
  { type: "givePendingPoints", runner: "serverEffect" },
  { type: "setTimerShown", runner: "setTimerShown" },
  { type: "setWipeShown", runner: "setWipeShown" },
  { type: "setControllerLayout", runner: "serverEffect" },
  { type: "startCraftingTimer", runner: "serverEffect" },
  { type: "transition", runner: "transition" },
  { type: "transitionState", runner: "immediateComplete" },
  { type: "text", runner: "immediateComplete" }
];

function runnerDefinitions(): RunnerDefinition[] {
  const sharedDefinitions = (globalThis as typeof globalThis & Window).PartyGameFlowActionRegistry?.stageActionRunnerDefinitions;
  return Array.isArray(sharedDefinitions) && sharedDefinitions.length ? sharedDefinitions : fallbackRunnerDefinitions;
}

function createBehaviorHandlers(context: runnerContext): Record<string, BehaviorHandler> {
  const c = context as Record<string, (...args: never[]) => unknown>;
  return {
    immediateComplete(action, runtime) {
      if (runtime.isPrimary) runtime.complete(action);
    },
    playAudio(action, runtime) {
      (c.playStageAudioAction as (a: Action, p: boolean, k?: string) => void)(action, runtime.isPrimary === true, runtime.actionKey);
    },
    serverEffect(action, runtime) {
      if (runtime.isPrimary) runtime.complete(action);
      else runtime.applyEffect(action);
    },
    votingReveal(action, runtime) {
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeAfter(action, runtime, (c.voteRevealDurationMs as (a: Action) => number)(action));
    },
    delayedComplete(action, runtime, definition) {
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeAfter(action, runtime, definition?.delayMs);
    },
    setPlayersShown(action, runtime) {
      const duration = c.setPlayersShownForAction ? (c.setPlayersShownForAction as (a: Action) => number)(action) : 0;
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeAfter(action, runtime, duration);
    },
    setPlayerAnswersShown(action, runtime) {
      const existingDuration = (c.playerAnswerBubbleAnimationRemaining as () => number)();
      const duration =
        action.playerFilter && action.playerFilter !== "all"
          ? action.instant
            ? 0
            : 500
          : Math.max(
              (c.setPlayerAnswerBubblesShown as (shown: boolean, o: Dict) => number)(action.isShown !== false, {
                instant: action.instant === true
              }),
              existingDuration
            );
      if (!runtime.isPrimary) runtime.applyEffect(action);
      if (runtime.isPrimary) completeAfter(action, runtime, duration);
    },
    setGameObjectShown(action, runtime) {
      const duration = c.setStageLayoutGameObjectShownForAction
        ? (c.setStageLayoutGameObjectShownForAction as (a: Action) => unknown)(action)
        : c.setStageLayoutArtElementShownForAction
          ? (c.setStageLayoutArtElementShownForAction as (a: Action) => unknown)(action)
          : 0;
      completeAfterResult(action, runtime, duration);
    },
    playGameObjectAnimation(action, runtime) {
      const duration = c.playStageLayoutGameObjectAnimationForAction
        ? (c.playStageLayoutGameObjectAnimationForAction as (a: Action) => unknown)(action)
        : 0;
      completeAfterResult(action, runtime, duration);
    },
    setTimerShown(action, runtime) {
      const duration = c.setCraftingTimerShownForAction
        ? (c.setCraftingTimerShownForAction as (a: Action, o: Dict) => number)(action, { actionKey: runtime.actionKey })
        : action.isShown === false && action.instant !== true
          ? 500
          : 0;
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeAfter(action, runtime, duration);
    },
    setWipeShown(action, runtime) {
      const duration = c.setStageWipeShownForAction
        ? (c.setStageWipeShownForAction as (a: Action, o: Dict) => number)(action, { actionKey: runtime.actionKey })
        : 0;
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeAfter(action, runtime, duration);
    },
    displayText(action, runtime) {
      const duration = (c.setStageTextObject as (target: string, spec: Dict) => unknown)(
        (action.textTarget as string) || "presentation",
        { text: action.text || "", isShown: action.isShown !== false, instant: action.instant === true }
      );
      if (runtime.isPrimary && action.type === "displayText") completeAfterResult(action, runtime, duration);
    },
    transition(action, runtime) {
      if (!runtime.isPrimary) (c.runStageWipe as (cb: () => void) => void)(() => {});
    }
  };
}

function createHandlerRegistry(context: runnerContext): Map<string, BehaviorHandler> {
  const behaviorHandlers = createBehaviorHandlers(context);
  const handlers = new Map<string, BehaviorHandler>();
  for (const definition of runnerDefinitions()) {
    const behavior = behaviorHandlers[definition.runner];
    if (!definition.type || !behavior) continue;
    handlers.set(definition.type, (action, runtime) => behavior(action, runtime, definition));
  }
  if (!handlers.has("text")) {
    handlers.set("text", behaviorHandlers.immediateComplete);
  }
  return handlers;
}

function createRunner(context: runnerContext): { run: (action: Action, runtimeOptions: Dict) => void } {
  const handlers = createHandlerRegistry(context);
  const c = context as Record<string, (...args: never[]) => unknown>;

  function run(action: Action, runtimeOptions: Dict): void {
    const runtime: Runtime = {
      ...(runtimeOptions as Partial<Runtime>),
      applyEffect: (targetAction: Action) => (c.applyFlowActionEffect as (id: unknown) => void)(targetAction.id),
      complete: (targetAction: Action) => (c.completeFlowAction as (kind: string, id: unknown) => void)("callback", targetAction.id),
      isCurrent: () => (c.isCurrentActionKey as (k: unknown) => boolean)(runtimeOptions.actionKey)
    };
    const handler = handlers.get(action?.type as string);
    if (handler) handler(action, runtime);
  }

  return { run };
}

export const PartyGameStageActionRunners = { createRunner };

export function installStageActionRunnersGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageActionRunners = PartyGameStageActionRunners;
}

installStageActionRunnersGlobals(typeof window !== "undefined" ? window : globalThis);
