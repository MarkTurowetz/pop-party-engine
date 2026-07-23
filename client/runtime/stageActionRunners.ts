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
    PartyGameFlowActionRegistry?: {
      isFlowEventBarrierAction?: (action: Action) => boolean;
      stageActionRunnerDefinitions?: RunnerDefinition[];
    };
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

function runnerDefinitions(): RunnerDefinition[] {
  const sharedDefinitions = (globalThis as typeof globalThis & Window).PartyGameFlowActionRegistry?.stageActionRunnerDefinitions;
  if (!Array.isArray(sharedDefinitions) || sharedDefinitions.length === 0) {
    throw new Error(
      "Stage action registry is unavailable. Refusing to execute flow actions with a duplicated legacy runner list."
    );
  }
  return sharedDefinitions;
}

function createBehaviorHandlers(context: runnerContext): Record<string, BehaviorHandler> {
  const c = context as Record<string, (...args: never[]) => unknown>;
  return {
    immediateComplete(action, runtime) {
      completeWhenActionTargetsFinish(action, runtime, undefined);
    },
    startMoment(action, runtime) {
      const result = c.startCurrentMomentForAction
        ? (c.startCurrentMomentForAction as (a: Action, o: Dict) => Promise<void>)(action, { actionKey: runtime.actionKey })
        : Promise.reject(new Error("Moment start runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
    },
    endMoment(action, runtime) {
      const result = c.endCurrentMomentForAction
        ? (c.endCurrentMomentForAction as (a: Action, o: Dict) => Promise<void>)(action, { actionKey: runtime.actionKey })
        : Promise.reject(new Error("Moment end runtime unavailable"));
      completeWhenActionTargetsFinish(action, runtime, result);
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
      if (!c.showPointPopupsForAction) return;
      (c.showPointPopupsForAction as (a: Action) => void)(action);
      // Popup owns only its eventual cleanup callback. Show Points is deliberately
      // fire-and-forget and never joins the flow action's completion barrier.
      completeWhenActionTargetsFinish(action, runtime, undefined);
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
    const flowRegistry = (globalThis as typeof globalThis & Window).PartyGameFlowActionRegistry;
    const isEventBarrier = flowRegistry?.isFlowEventBarrierAction?.(action)
      ?? Boolean(action?.trigger);
    if (isEventBarrier) return;
    const handler = handlers.get(action?.type as string);
    if (!handler) {
      throw new Error(`No stage action runner is registered for authored action type "${String(action?.type || "(missing)")}".`);
    }
    handler(action, runtime);
  }

  return { run };
}

export const PartyGameStageActionRunners = { createRunner };

export function installStageActionRunnersGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageActionRunners = PartyGameStageActionRunners;
}

installStageActionRunnersGlobals(typeof window !== "undefined" ? window : globalThis);
