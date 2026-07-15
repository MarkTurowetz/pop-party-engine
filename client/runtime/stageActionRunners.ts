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

function waitsForActionCallback(action: Action, runtime: Runtime): boolean {
  return runtime.isPrimary === true && (action.timing as Dict)?.mode !== "S+";
}

function completeWhenActionTargetsFinish(action: Action, runtime: Runtime, result: unknown): void {
  if (!waitsForActionCallback(action, runtime)) return;
  if (result && typeof (result as Promise<unknown>).then === "function") {
    (result as Promise<unknown>)
      .then(() => {
        if (runtime.isCurrent()) runtime.complete(action);
      })
      .catch(() => {
        // Fail closed. A rejected target callback must never be replaced by a
        // duration guess that advances the flow.
      });
    return;
  }
  if (runtime.isCurrent()) runtime.complete(action);
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
  { type: "setVotingCardsShown", runner: "votingCardAction" },
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
  { type: "stopGameObjectAnimation", runner: "playGameObjectAnimation" },
  { type: "revealPlayerAnswerCorrectness", runner: "revealPlayerAnswerCorrectness" },
  { type: "showPoints", runner: "showPoints" },
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
      completeWhenActionTargetsFinish(action, runtime, undefined);
    },
    playAudio(action, runtime) {
      (c.playStageAudioAction as (a: Action, p: boolean, k?: string) => void)(action, runtime.isPrimary === true, runtime.actionKey);
    },
    serverEffect(action, runtime) {
      if (runtime.isPrimary) completeWhenActionTargetsFinish(action, runtime, undefined);
      else runtime.applyEffect(action);
    },
    votingCardAction(action, runtime) {
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      const result = c.runVotingCardActionForAction
        ? (c.runVotingCardActionForAction as (a: Action) => Promise<void>)(action)
        : Promise.reject(new Error("Voting card action runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    votingReveal(action, runtime) {
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      const result = c.runVotingCardActionForAction
        ? (c.runVotingCardActionForAction as (a: Action) => Promise<void>)(action)
        : Promise.reject(new Error("Voting card reveal runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    showPoints(action, runtime) {
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      const result = c.showPointPopupsForAction
        ? (c.showPointPopupsForAction as (a: Action) => Promise<void>)(action)
        : Promise.reject(new Error("Point popup runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    revealPlayerAnswerCorrectness(action, runtime) {
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      const result = c.revealPlayerAnswerCorrectnessForAction
        ? (c.revealPlayerAnswerCorrectnessForAction as (a: Action) => Promise<void>)(action)
        : Promise.reject(new Error("Player answer correctness runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    setPlayersShown(action, runtime) {
      const result = c.setPlayersShownForAction
        ? (c.setPlayersShownForAction as (a: Action) => Promise<void>)(action)
        : Promise.reject(new Error("Player roster runtime unavailable"));
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    setPlayerAnswersShown(action, runtime) {
      const result = c.setPlayerAnswerBubblesShownForAction
        ? (c.setPlayerAnswerBubblesShownForAction as (shown: boolean, o: Dict) => Promise<void>)(action.isShown !== false, {
            instant: action.instant === true,
            playerFilter: action.playerFilter || "all"
          })
        : Promise.reject(new Error("Player answer bubble runtime unavailable"));
      if (!runtime.isPrimary) runtime.applyEffect(action);
      if (runtime.isPrimary) completeWhenActionTargetsFinish(action, runtime, result);
    },
    setGameObjectShown(action, runtime) {
      const result = c.setStageLayoutGameObjectShownForAction
        ? (c.setStageLayoutGameObjectShownForAction as (a: Action) => unknown)(action)
        : c.setStageLayoutArtElementShownForAction
          ? (c.setStageLayoutArtElementShownForAction as (a: Action) => unknown)(action)
          : Promise.reject(new Error("Layout game-object visibility runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    playGameObjectAnimation(action, runtime) {
      const result = c.playStageLayoutGameObjectAnimationForAction
        ? (c.playStageLayoutGameObjectAnimationForAction as (a: Action) => unknown)(action)
        : Promise.reject(new Error("Layout game-object animation runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    setTimerShown(action, runtime) {
      const result = c.setCraftingTimerShownForAction
        ? (c.setCraftingTimerShownForAction as (a: Action, o: Dict) => Promise<void>)(action, { actionKey: runtime.actionKey })
        : Promise.reject(new Error("Crafting timer runtime unavailable"));
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    setWipeShown(action, runtime) {
      const result = c.setStageWipeShownForAction
        ? (c.setStageWipeShownForAction as (a: Action, o: Dict) => Promise<void>)(action, { actionKey: runtime.actionKey })
        : Promise.reject(new Error("Stage wipe runtime unavailable"));
      if (!runtime.isPrimary) {
        runtime.applyEffect(action);
        return;
      }
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    displayText(action, runtime) {
      (c.setPresentationClickPromptForAction as ((shown: boolean, spec: Dict) => void) | undefined)?.(
        ["present", "presentText"].includes(String(action.type || "")) && action.isShown !== false,
        { instant: action.instant === true }
      );
      const result = c.setStageTextObjectForAction
        ? (c.setStageTextObjectForAction as (target: string, spec: Dict) => Promise<void>)(
            (action.textTarget as string) || "presentation",
            { text: action.text || "", isShown: action.isShown !== false, instant: action.instant === true }
          )
        : Promise.reject(new Error("Stage text runtime unavailable"));
      if (runtime.isPrimary && action.type === "displayText") completeWhenActionTargetsFinish(action, runtime, result);
    },
    transition(action, runtime) {
      if (!runtime.isPrimary) (c.runStageWipe as (covered: () => void, complete: () => void) => void)(() => {}, () => {});
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
