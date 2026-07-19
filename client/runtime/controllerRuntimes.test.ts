import { describe, expect, it, vi } from "vitest";
import { createControllerSessionRuntime } from "./controllerSessionRuntime";
import { createControllerStateRuntime, type ControllerStateRuntimeOptions } from "./controllerStateRuntime";
import { controllerLayoutStateIds } from "../../shared/controller-layout-states";

describe("createControllerSessionRuntime (ported)", () => {
  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerSessionRuntime?: unknown };
    expect(host.createControllerSessionRuntime).toBeTypeOf("function");
  });

  it("exposes enterLobby + sendLeaveBeacon", () => {
    const runtime = createControllerSessionRuntime({
      elements: {} as Record<string, HTMLElement>,
      getControllerState: () => null,
      heartbeatRuntime: { start: vi.fn() },
      renderState: vi.fn(),
      setControllerState: vi.fn(),
      setLocalValue: vi.fn(),
      setSessionValue: vi.fn()
    });
    expect(runtime.enterLobby).toBeTypeOf("function");
    expect(runtime.sendLeaveBeacon).toBeTypeOf("function");
  });
});

describe("createControllerStateRuntime (ported)", () => {
  function options(over: Partial<ControllerStateRuntimeOptions> = {}): ControllerStateRuntimeOptions {
    const view = (render: () => boolean | number | null) => ({ render: vi.fn(render) });
    return {
      closeAvatarPicker: vi.fn(),
      getChoiceInputView: () => view(() => true),
      getGlobalActionView: () => ({ render: vi.fn(() => true), renderMessage: vi.fn(() => null) }),
      getLobbyView: () => ({ renderInGamePhase: vi.fn(), renderLobby: vi.fn(() => 99) }),
      getMicrophoneAccessView: () => view(() => true),
      getTextInputView: () => view(() => true),
      getVoiceInput: () => ({ stopRecognition: vi.fn() }),
      ...over
    };
  }

  it("routes a paused mid-game lobby to the paused spec", () => {
    const runtime = createControllerStateRuntime(options());
    const result = runtime.render({ isPaused: true, phase: "intro" }, {});
    expect(result.id).toBe("paused");
  });

  it("routes a microphone-access lobby to that spec", () => {
    const runtime = createControllerStateRuntime(options());
    const result = runtime.render({ microphoneAccess: { actionId: "a1" }, phase: "intro" }, {});
    expect(result.id).toBe("microphoneAccess");
  });

  it("routes a completed submit-once choice to the Presentation waiting layout", () => {
    const renderMessage = vi.fn(() => null);
    const runtime = createControllerStateRuntime(options({
      getGlobalActionView: () => ({ render: vi.fn(() => false), renderMessage })
    }));
    const result = runtime.render(
      {
        input: { actionId: "choice-1", mode: "submitOnce", type: "trivia" },
        phase: "crafting-game-state"
      },
      { answer: { done: true, text: "Tuesday" } }
    );

    expect(result.id).toBe("submissionConfirmation");
    expect(renderMessage).toHaveBeenCalledWith(
      expect.anything(),
      "You answered: Tuesday",
      expect.objectContaining({
        actionId: "choice-1",
        layoutPhase: controllerLayoutStateIds.presentation,
        showButton: false
      })
    );
  });

  it("routes a completed written answer to the Presentation waiting layout", () => {
    const renderMessage = vi.fn(() => null);
    const runtime = createControllerStateRuntime(options({
      getGlobalActionView: () => ({ render: vi.fn(() => false), renderMessage })
    }));
    const result = runtime.render(
      {
        phase: "writing-moment",
        textInput: { actionId: "write-1", mode: "all", type: "text" }
      },
      { answer: { done: true, text: "A tiny dinosaur" } }
    );

    expect(result.id).toBe("submissionConfirmation");
    expect(renderMessage).toHaveBeenCalledWith(
      expect.anything(),
      "You wrote: A tiny dinosaur",
      expect.objectContaining({
        actionId: "write-1",
        layoutPhase: controllerLayoutStateIds.presentation,
        showButton: false
      })
    );
  });

  it("does not use submission confirmation for votes, voice, or unfinished choices", () => {
    const choiceView = { render: vi.fn(() => true) };
    const textView = { render: vi.fn(() => true) };
    const runtime = createControllerStateRuntime(options({
      getChoiceInputView: () => choiceView,
      getTextInputView: () => textView
    }));

    expect(runtime.render(
      { input: { actionId: "vote-1", mode: "submitOnce", type: "vote" }, phase: "voting-moment" },
      { answer: { done: true, text: "Card A" } }
    ).id).toBe("choiceInput");
    expect(runtime.render(
      { phase: "voice-moment", textInput: { actionId: "voice-1", mode: "voiceVip", type: "voice" } },
      { answer: { done: true, text: "Recorded answer" } }
    ).id).toBe("textInput");
    expect(runtime.render(
      { input: { actionId: "choice-2", mode: "submitOnce", type: "trivia" }, phase: "crafting-game-state" },
      { answer: { done: false, text: "Tuesday" } }
    ).id).toBe("choiceInput");
  });

  it("falls through to the lobby view and surfaces its countdown timer", () => {
    const runtime = createControllerStateRuntime(options());
    const result = runtime.render({ phase: "lobby" }, {});
    expect(result.id).toBe("lobby");
    expect(result.countdownTimer).toBe(99);
  });
});
