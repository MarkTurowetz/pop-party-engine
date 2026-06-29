// Typed port of the legacy client/controller.js orchestrator. Imports the ported
// view/runtime factories directly; reads app-shell DOM refs + mutable state and the
// utils helpers via window (exposed by the app-shell exposure block + utils.ts).
// Installs window.setupController so app-shell.js's role dispatch can call it.

import { createControllerModuleCache } from "./controllerModuleCache";
import { createControllerViewState } from "./controllerViewState";
import { createControllerAvatarView } from "./controllerAvatarView";
import { createControllerVoiceInput } from "./controllerVoiceInput";
import { createControllerMicrophoneAccessView } from "./controllerMicrophoneAccessView";
import { createControllerChoiceInputView } from "./controllerChoiceInputView";
import { createControllerGlobalActionView } from "./controllerGlobalActionView";
import { createControllerStateRuntime } from "./controllerStateRuntime";
import { createControllerHeartbeatRuntime } from "./controllerHeartbeatRuntime";
import { createControllerLobbyView } from "./controllerLobbyView";
import { createControllerTextInputView } from "./controllerTextInputView";
import { createControllerSubmitApi } from "./controllerSubmitApi";
import { createControllerSessionRuntime } from "./controllerSessionRuntime";
import { createControllerActionBindings, type ControllerActionBindingsOptions } from "./controllerActionBindings";
import { createControllerSetupBindings } from "./controllerSetupBindings";

type Dict = Record<string, unknown>;
type TextTarget = HTMLElement | string;

interface LayoutTextApi {
  setControllerText?: (target: TextTarget, value: unknown) => void;
  setControllerTextShown?: (target: string, isShown: boolean, options?: Dict) => void;
}

declare global {
  interface Window {
    PartyGameLayoutText?: LayoutTextApi;
    applyControllerLayoutForPhase?: (phase: string) => void;
    loadControllerLayouts?: () => Promise<unknown>;
    applyControllerRuntimeTestMessage?: (data: unknown) => void;
    setupController?: () => void;
    controllerState?: Dict | null;
    controllerCountdownTimer?: number | null;
    dismissedTextInvalidKey?: string;
    runtimeTestChannel?: { addEventListener: (type: string, cb: (event: MessageEvent) => void) => void } | null;
    // app-shell DOM refs (HTMLElement) + string id consts used by the controller.
    joinButton?: HTMLButtonElement;
    startGameButton?: HTMLButtonElement;
    introPresentButton?: HTMLButtonElement;
    controllerGlobalActionButton?: HTMLButtonElement;
    controllerMicAccessButton?: HTMLButtonElement;
    controllerTextSubmitButton?: HTMLButtonElement;
    controllerVoiceButton?: HTMLButtonElement;
    controllerChoiceState?: HTMLElement;
    controllerGlobalActionState?: HTMLElement;
    controllerIntroState?: HTMLElement;
    joinState?: HTMLElement;
    controllerLobbyState?: HTMLElement;
    controllerMicAccessState?: HTMLElement;
    controllerTextState?: HTMLElement;
    controllerAvatar?: HTMLElement;
    controllerPlayerBanner?: HTMLElement;
    controllerPlayerBannerAvatar?: HTMLElement;
    controllerPlayerBannerName?: HTMLElement;
    avatarPicker?: HTMLElement;
    avatarPickerGrid?: HTMLElement;
    avatarPickerDoneButton?: HTMLElement;
    controllerChoiceGrid?: HTMLElement;
    controllerInvalidBanner?: HTMLElement;
    controllerTextInput?: HTMLInputElement;
    joinForm?: HTMLFormElement;
    stageCodeInput?: HTMLInputElement;
    playerNameInput?: HTMLInputElement;
    controllerIntroMessage?: string;
    controllerMeta?: string;
    controllerChoicePrompt?: string;
    controllerChoiceDone?: string;
    controllerMicAccessPrompt?: string;
    controllerMicAccessStatus?: string;
    controllerGlobalActionMessage?: string;
    controllerVoiceStatus?: string;
    controllerTextPrompt?: string;
    controllerTextDone?: string;
    controllerPlayerName?: string;
  }
}

const w = window;
const controllerModules = createControllerModuleCache();

function setControllerText(target: TextTarget | undefined, value: unknown): void {
  if (!target) return;
  if (typeof w.PartyGameLayoutText?.setControllerText === "function") {
    w.PartyGameLayoutText.setControllerText(target, value);
    return;
  }
  w.PartyGameControllerText?.setText(target as HTMLElement, value);
}

function setControllerTextShown(target: TextTarget | undefined, isShown: boolean, options: Dict = {}): void {
  if (!target) return;
  if (typeof target === "string" && typeof w.PartyGameLayoutText?.setControllerTextShown === "function") {
    w.PartyGameLayoutText.setControllerTextShown(target, isShown, options);
    return;
  }
  (target as HTMLElement).classList?.toggle("hidden", isShown === false);
}

function setControllerButtonText(target: HTMLElement | undefined, value: unknown, spec: Dict = {}): void {
  if (!target) return;
  w.PartyGameControllerText?.setButtonText(target, value, spec);
}

function initializeControllerButtonText(): void {
  setControllerButtonText(w.joinButton, "Join", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(w.startGameButton, "Start Game", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(w.introPresentButton, "Present HI THERE", { width: 300, height: 64, fontSize: 24 });
  setControllerButtonText(w.controllerGlobalActionButton, "Next", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(w.controllerMicAccessButton, "Yes", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(w.controllerTextSubmitButton, "Submit", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(w.controllerVoiceButton, "Hold To Record", { width: 300, height: 64, fontSize: 24 });
}

function el<T = HTMLElement>(value: unknown): T {
  return value as T;
}

function getControllerViewState() {
  return controllerModules.get("viewState", () =>
    createControllerViewState({
      choice: w.controllerChoiceState,
      globalAction: w.controllerGlobalActionState,
      intro: w.controllerIntroState,
      join: w.joinState,
      lobby: w.controllerLobbyState,
      microphoneAccess: w.controllerMicAccessState,
      textInput: w.controllerTextState
    })
  );
}

function getControllerAvatarView() {
  return controllerModules.get("avatarView", () =>
    createControllerAvatarView({
      avatarClass: w.avatarClass!,
      avatarComposites: w.avatarComposites!,
      avatarFrameImage: w.avatarFrameImage!,
      avatarLabel: w.avatarLabel!,
      dinoIcon: w.dinoIcon!,
      elements: {
        avatar: el(w.controllerAvatar),
        banner: el(w.controllerPlayerBanner),
        bannerAvatar: el(w.controllerPlayerBannerAvatar),
        bannerName: el(w.controllerPlayerBannerName),
        picker: el(w.avatarPicker),
        pickerGrid: el(w.avatarPickerGrid)
      },
      getControllerState: () => w.controllerState,
      playerAvatarArt: w.playerAvatarArt,
      renderState: renderControllerState,
      setControllerPlayer: (player) => {
        if (w.controllerState) w.controllerState.player = player;
      },
      setText: setControllerText,
      setMetaText: (value) => {
        setControllerText(w.controllerMeta, value);
      },
      updateAvatar: (shape: string) =>
        getControllerSubmitApi().updateAvatar(shape) as Promise<{ player?: Dict; lobby?: unknown }>
    })
  );
}

function getControllerVoiceInput() {
  return controllerModules.get("voiceInput", () =>
    createControllerVoiceInput({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      button: el<HTMLButtonElement>(w.controllerVoiceButton),
      getReleaseBufferSeconds: () =>
        Number(
          (w.controllerState?.lobby as Dict)?.speechToTextSendInputBuffer ??
            (w.gameConstants as Dict)?.speechToTextSendInputBuffer ??
            1
        ),
      hideViews: hideControllerViews,
      introMessage: el(w.controllerIntroMessage),
      previewText: previewControllerText,
      renderGlobalMessage: renderControllerGlobalMessage,
      setButtonText: setControllerButtonText,
      setText: setControllerText,
      showView: (viewId: string) => getControllerViewState().show(viewId),
      status: el(w.controllerVoiceStatus),
      submitText: submitControllerText
    })
  );
}

function getControllerMicrophoneAccessView() {
  return controllerModules.get("microphoneAccessView", () =>
    createControllerMicrophoneAccessView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      elements: {
        button: el(w.controllerMicAccessButton),
        prompt: el(w.controllerMicAccessPrompt),
        state: el(w.controllerMicAccessState),
        status: el(w.controllerMicAccessStatus)
      },
      grantAccess: grantControllerMicrophoneAccess,
      hideViews: hideControllerViews,
      renderGlobalMessage: renderControllerGlobalMessage,
      setText: setControllerText,
      setButtonText: setControllerButtonText,
      showView: (viewId: string) => getControllerViewState().show(viewId),
      waiting: { message: el(w.controllerIntroMessage) }
    })
  );
}

function getControllerChoiceInputView() {
  return controllerModules.get("choiceInputView", () =>
    createControllerChoiceInputView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      bindPress: w.bindButtonPress!,
      elements: {
        done: el(w.controllerChoiceDone),
        grid: el(w.controllerChoiceGrid),
        prompt: el(w.controllerChoicePrompt),
        state: el(w.controllerChoiceState)
      },
      hideViews: hideControllerViews,
      setButtonText: setControllerButtonText,
      setText: setControllerText,
      setTextShown: setControllerTextShown,
      showView: (viewId: string) => getControllerViewState().show(viewId),
      submitChoice: submitControllerChoice
    })
  );
}

function getControllerGlobalActionView() {
  return controllerModules.get("globalActionView", () =>
    createControllerGlobalActionView({
      advanceStageClick: advanceControllerStageClick,
      applyLayoutForPhase: applyControllerLayoutForPhase,
      elements: {
        button: el(w.controllerGlobalActionButton),
        message: el(w.controllerGlobalActionMessage),
        state: el(w.controllerGlobalActionState)
      },
      hideViews: hideControllerViews,
      setButtonText: setControllerButtonText,
      setText: setControllerText,
      showView: (viewId: string) => getControllerViewState().show(viewId)
    })
  );
}

function renderControllerGlobalMessage(lobby: Dict, message: string, options: Dict = {}): unknown {
  return getControllerGlobalActionView().renderMessage(lobby, message, { ...options, showButton: false });
}

function getControllerStateRuntime() {
  return controllerModules.get("stateRuntime", () =>
    createControllerStateRuntime({
      closeAvatarPicker,
      getChoiceInputView: getControllerChoiceInputView,
      getGlobalActionView: getControllerGlobalActionView,
      getLobbyView: getControllerLobbyView,
      getMicrophoneAccessView: getControllerMicrophoneAccessView,
      getTextInputView: getControllerTextInputView,
      getVoiceInput: getControllerVoiceInput
    })
  );
}

function getControllerHeartbeatRuntime() {
  return controllerModules.get("heartbeatRuntime", () =>
    createControllerHeartbeatRuntime({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      closeAvatarPicker,
      elements: { joinButton: el<HTMLButtonElement>(w.joinButton), joinState: el(w.joinState), meta: el(w.controllerMeta) },
      getControllerState: () => w.controllerState,
      hideViews: hideControllerViews,
      renderState: renderControllerState,
      sendHeartbeat: () => getControllerSubmitApi().heartbeat() as Promise<{ lobby: unknown }>,
      setText: setControllerText,
      setControllerState: (value) => {
        w.controllerState = value as Dict | null;
      },
      showView: (viewId: string) => getControllerViewState().show(viewId)
    })
  );
}

function getControllerLobbyView() {
  return controllerModules.get("lobbyView", () =>
    createControllerLobbyView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      elements: {
        introPresentButton: el(w.introPresentButton),
        introState: el(w.controllerIntroState),
        lobbyState: el(w.controllerLobbyState),
        meta: el(w.controllerMeta),
        playerName: el(w.controllerPlayerName),
        startButton: el(w.startGameButton)
      },
      hideViews: hideControllerViews,
      setText: setControllerText,
      showView: (viewId: string) => getControllerViewState().show(viewId),
      setAvatar: setControllerAvatar
    })
  );
}

function getControllerTextInputView() {
  return controllerModules.get("textInputView", () =>
    createControllerTextInputView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      dismissedInvalidKey: () => w.dismissedTextInvalidKey || "",
      elements: {
        done: el(w.controllerTextDone),
        input: el(w.controllerTextInput),
        invalidBanner: el(w.controllerInvalidBanner),
        prompt: el(w.controllerTextPrompt),
        state: el(w.controllerTextState),
        submitButton: el(w.controllerTextSubmitButton),
        voiceButton: el(w.controllerVoiceButton),
        voiceStatus: el(w.controllerVoiceStatus)
      },
      getVoiceInput: getControllerVoiceInput,
      hideViews: hideControllerViews,
      setText: setControllerText,
      showView: (viewId: string) => getControllerViewState().show(viewId),
      setPhaseActionId: (actionId: string) => {
        if (w.controllerState) w.controllerState.phaseActionId = actionId;
      },
      submitText: submitControllerText
    })
  );
}

function getControllerSubmitApi() {
  return controllerModules.get("submitApi", () =>
    createControllerSubmitApi({ getControllerState: () => w.controllerState, postJson: w.postJson! })
  );
}

function getControllerSessionRuntime() {
  return controllerModules.get("sessionRuntime", () =>
    createControllerSessionRuntime({
      elements: { joinState: el(w.joinState), lobbyState: el(w.controllerLobbyState) },
      getControllerState: () => w.controllerState,
      heartbeatRuntime: getControllerHeartbeatRuntime(),
      renderState: renderControllerState,
      showView: (viewId: string) => getControllerViewState().show(viewId),
      setControllerState: (value) => {
        w.controllerState = value as Dict | null;
      },
      setLocalValue: w.setLocalValue!,
      setSessionValue: w.setSessionValue!
    })
  );
}

function applyControllerLayoutForPhase(phase: string): void {
  w.applyControllerLayoutForPhase?.(phase);
}

function updateJoinButton(): void {
  const hasStage = w.normalizeStageCode!(el<HTMLInputElement>(w.stageCodeInput).value).length > 0;
  const hasName = el<HTMLInputElement>(w.playerNameInput).value.trim().length > 0;
  el<HTMLButtonElement>(w.joinButton).disabled = !(hasStage && hasName);
}

async function joinController(stageCode: string, playerName: string): Promise<Dict> {
  const playerId = w.getControllerPlayerId!();
  el<HTMLButtonElement>(w.joinButton).disabled = true;
  const result = (await getControllerSubmitApi().join(stageCode, playerName, playerId)) as Dict;
  const player = result.player as { id: string; name?: string };
  getControllerSessionRuntime().enterLobby(stageCode, player.id, result.lobby, player);
  return result;
}

function setControllerAvatar(player: Dict): void {
  getControllerAvatarView().setAvatar(player);
}

function setControllerPlayerBanner(player: Dict): void {
  getControllerAvatarView().setBanner(player);
}

function openAvatarPicker(): void {
  getControllerAvatarView().open();
}

async function closeAvatarPicker({ commit = true }: { commit?: boolean } = {}): Promise<void> {
  return getControllerAvatarView().close({ commit });
}

function hideControllerViews(): void {
  getControllerViewState().hideAll();
  w.controllerGlobalActionButton?.classList.add("hidden");
  w.introPresentButton?.classList.add("hidden");
}

async function submitControllerChoice(actionId: string, optionIndex: number, cardId = ""): Promise<void> {
  if (!w.controllerState) return;
  try {
    const result = (await getControllerSubmitApi().submitChoice(actionId, optionIndex, cardId)) as Dict;
    if (result.lobby) renderControllerState(result.lobby as Dict);
  } catch (error) {
    setControllerText(w.controllerChoicePrompt, (error as Error).message);
  }
}

async function submitControllerText(actionId: string, textOverride: string | null = null): Promise<void> {
  if (!w.controllerState) return;
  const input = el<HTMLInputElement>(w.controllerTextInput);
  const text = textOverride == null ? input.value : textOverride;
  if (!text.trim()) return;
  el<HTMLButtonElement>(w.controllerTextSubmitButton).disabled = true;
  el<HTMLButtonElement>(w.controllerVoiceButton).disabled = true;
  try {
    const result = (await getControllerSubmitApi().submitText(actionId, text)) as Dict;
    if (result.lobby) renderControllerState(result.lobby as Dict);
  } catch (error) {
    setControllerText(w.controllerInvalidBanner, (error as Error).message);
    w.controllerInvalidBanner?.classList.remove("hidden");
    input.value = "";
    el<HTMLButtonElement>(w.controllerTextSubmitButton).disabled = true;
    el<HTMLButtonElement>(w.controllerVoiceButton).disabled = false;
    setControllerText(w.controllerVoiceStatus, (error as Error).message);
  }
}

async function grantControllerMicrophoneAccess(actionId: string): Promise<Dict | null> {
  if (!w.controllerState) return null;
  const result = (await getControllerSubmitApi().grantMicrophoneAccess(actionId)) as Dict;
  if (result?.lobby) renderControllerState(result.lobby as Dict);
  return result;
}

async function previewControllerText(actionId: string, text = "T"): Promise<void> {
  if (!w.controllerState) return;
  try {
    const result = (await getControllerSubmitApi().previewText(actionId, text)) as Dict;
    if (result?.lobby) renderControllerState(result.lobby as Dict);
  } catch (error) {
    setControllerText(w.controllerVoiceStatus, (error as Error).message);
  }
}

async function advanceControllerStageClick(actionId: string): Promise<Dict | null> {
  if (!w.controllerState) return null;
  const result = (await getControllerSubmitApi().inputEvent(actionId, "stageClick")) as Dict;
  if (result?.lobby) renderControllerState(result.lobby as Dict);
  return result;
}

function renderControllerState(lobbyInput: unknown): void {
  if (!w.controllerState) return;
  const lobby = lobbyInput as Dict;
  w.controllerState.lobby = lobby;
  window.clearInterval(w.controllerCountdownTimer ?? undefined);
  const me = ((lobby.players as Dict[]) || []).find((player) => player.id === w.controllerState!.playerId);
  if (!me) {
    closeAvatarPicker({ commit: false });
    w.controllerState.startToken = "";
    getControllerLobbyView().renderMissingPlayer();
    return;
  }
  w.controllerState.player = me;
  setControllerPlayerBanner(me);
  w.controllerState.startToken = me.isVip ? lobby.startToken : "";
  getControllerAvatarView().syncPendingShape(me);

  const controllerPhase = (lobby.phase as string) || "lobby";
  w.controllerState.phase = controllerPhase;
  const renderedState = getControllerStateRuntime().render(lobby, me);
  w.controllerState.controllerViewStateId = renderedState.id;
  w.controllerCountdownTimer = renderedState.countdownTimer;
}

function reloadControllerArtAssets(): void {
  w.loadArtAssets!()
    .then(() => {
      if (w.controllerState?.player) setControllerAvatar(w.controllerState.player as Dict);
      if (w.controllerState?.lobby) renderControllerState(w.controllerState.lobby as Dict);
      else applyControllerLayoutForPhase((w.controllerState?.phase as string) || "join");
    })
    .catch(() => {});
}

function setupController(): void {
  w.lockControllerViewport!();
  w.bindControllerButtonPressStates!();
  w.controllerScreen?.classList.remove("hidden");
  reloadControllerArtAssets();
  w.listenForArtAssetsChanged!(reloadControllerArtAssets);
  w.loadControllerLayouts?.()
    .then(() => applyControllerLayoutForPhase("join"))
    .catch(() => applyControllerLayoutForPhase("join"));
  w.runtimeTestChannel?.addEventListener("message", (event: MessageEvent) => {
    w.applyControllerRuntimeTestMessage?.(event.data);
  });
  const stageInput = el<HTMLInputElement>(w.stageCodeInput);
  const nameInput = el<HTMLInputElement>(w.playerNameInput);
  stageInput.value =
    w.getStageCodeFromUrl!() || w.normalizeStageCode!(w.getSessionValue!("partyTemplateStageCode") || w.getLocalValue!("partyTemplateStageCode"));
  nameInput.value =
    w.getPlayerNameFromUrl!() || w.getSessionValue!("partyTemplatePlayerName") || w.getLocalValue!("partyTemplatePlayerName") || "";
  updateJoinButton();
  initializeControllerButtonText();
  applyControllerLayoutForPhase("join");

  const setupBindings = createControllerSetupBindings({
    elements: {
      invalidBanner: el(w.controllerInvalidBanner),
      joinButton: el(w.joinButton),
      joinForm: el(w.joinForm),
      playerNameInput: el(w.playerNameInput),
      stageCodeInput: el(w.stageCodeInput),
      textInput: el(w.controllerTextInput),
      textSubmitButton: el(w.controllerTextSubmitButton)
    } as never,
    getControllerState: () => w.controllerState,
    getSessionValue: w.getSessionValue!,
    joinController,
    normalizeStageCode: w.normalizeStageCode!,
    removeSessionValue: w.removeSessionValue!,
    setButtonText: setControllerButtonText,
    setLocalValue: w.setLocalValue!,
    setDismissedInvalidKey: (value: string) => {
      w.dismissedTextInvalidKey = value;
    },
    shouldAutoJoin: w.shouldAutoJoin!,
    updateJoinButton
  });
  setupBindings.bindJoinControls();
  setupBindings.bindTextInputControls();

  createControllerActionBindings({
    applyLayoutForPhase: applyControllerLayoutForPhase,
    closeAvatarPicker,
    elements: {
      avatar: el(w.controllerAvatar),
      avatarPicker: el(w.avatarPicker),
      avatarPickerDoneButton: el(w.avatarPickerDoneButton),
      avatarPickerPanel: el(w.avatarPicker?.querySelector(".avatar-picker-panel")),
      controllerScreen: el(w.controllerScreen),
      introPresentButton: el(w.introPresentButton),
      startButton: el(w.startGameButton)
    } as never,
    getControllerState: () => w.controllerState,
    getSessionRuntime: getControllerSessionRuntime,
    getSubmitApi: getControllerSubmitApi as unknown as ControllerActionBindingsOptions["getSubmitApi"],
    openAvatarPicker,
    origin: location.origin,
    renderState: renderControllerState,
    setButtonText: setControllerButtonText,
    setMetaText: (value: string) => {
      setControllerText(w.controllerMeta, value);
    }
  }).bindAll();
}

export function installControllerGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).setupController = setupController;
}

installControllerGlobals(typeof window !== "undefined" ? window : globalThis);
