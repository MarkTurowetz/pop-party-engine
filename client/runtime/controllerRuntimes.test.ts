import { describe, expect, it, vi } from "vitest";
import { createControllerSessionRuntime } from "./controllerSessionRuntime";
import { createControllerStateRuntime, type ControllerStateRuntimeOptions } from "./controllerStateRuntime";
import { controllerLayoutStateIds } from "../../shared/controller-layout-states";

describe("createControllerSessionRuntime (ported)", () => {
  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerSessionRuntime?: unknown };
    expect(host.createControllerSessionRuntime).toBeTypeOf("function");
  });

  it("persists only session identity when entering a lobby", () => {
    const addClass = vi.fn();
    const joinState = { classList: { add: addClass } } as unknown as HTMLElement;
    const setControllerState = vi.fn();
    const setLocalValue = vi.fn();
    const setSessionValue = vi.fn();
    const renderState = vi.fn();
    const start = vi.fn();
    const runtime = createControllerSessionRuntime({
      elements: { joinState },
      getControllerState: () => null,
      heartbeatRuntime: { start },
      renderState,
      setControllerState,
      setLocalValue,
      setSessionValue
    });
    const lobby = { phase: "lobby" };

    runtime.enterLobby("ABCD", "p1", "capability-1", lobby, { name: "Ava", color: "pink" });

    expect(setControllerState).toHaveBeenCalledWith({
      stageCode: "ABCD",
      playerId: "p1",
      playerCapability: "capability-1",
      player: { name: "Ava", color: "pink" }
    });
    expect(setSessionValue.mock.calls).toEqual([
      ["partyTemplatePlayerId", "p1"],
      ["partyTemplatePlayerName", "Ava"],
      ["partyTemplateStageCode", "ABCD"],
      ["partyTemplatePlayerCapability", "capability-1"]
    ]);
    expect(setLocalValue).toHaveBeenCalledWith("partyTemplateStageCode", "ABCD");
    expect(addClass).toHaveBeenCalledWith("hidden");
    expect(renderState).toHaveBeenCalledWith(lobby);
    expect(start).toHaveBeenCalledOnce();
  });

  it("can defer the first lobby render until room content is ready", () => {
    const renderState = vi.fn();
    const start = vi.fn();
    const runtime = createControllerSessionRuntime({
      elements: { joinState: { classList: { add: vi.fn() } } as unknown as HTMLElement },
      getControllerState: () => null,
      heartbeatRuntime: { start },
      renderState,
      setControllerState: vi.fn(),
      setLocalValue: vi.fn(),
      setSessionValue: vi.fn()
    });
    const lobby = { phase: "lobby" };

    runtime.enterLobby("ABCD", "p1", "capability-1", lobby, { name: "Ava" }, { deferActivation: true });

    expect(renderState).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    runtime.activateLobby(lobby);

    expect(renderState).toHaveBeenCalledWith(lobby);
    expect(start).toHaveBeenCalledOnce();
  });

  it("sends the player capability on a best-effort leave beacon", () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const runtime = createControllerSessionRuntime({
      elements: { joinState: { classList: { add: vi.fn() } } as unknown as HTMLElement },
      fetchImpl,
      getControllerState: () => ({ stageCode: "ABCD", playerId: "p1", playerCapability: "capability-1" }),
      heartbeatRuntime: { start: vi.fn() },
      renderState: vi.fn(),
      setControllerState: vi.fn(),
      setLocalValue: vi.fn(),
      setSessionValue: vi.fn()
    });

    runtime.sendLeaveBeacon("https://game.example");

    expect(fetchImpl).toHaveBeenCalledWith("https://game.example/api/leave", expect.objectContaining({
      body: JSON.stringify({ stageCode: "ABCD", playerId: "p1" }),
      headers: expect.objectContaining({ "X-Player-Capability": "capability-1" }),
      keepalive: true,
      method: "POST"
    }));
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

  it("gives an authoritative runtime fault precedence over every playable state", () => {
    const renderMessage = vi.fn(() => null);
    const choiceView = { render: vi.fn(() => true) };
    const runtime = createControllerStateRuntime(options({
      getChoiceInputView: () => choiceView,
      getGlobalActionView: () => ({ render: vi.fn(() => true), renderMessage })
    }));

    const result = runtime.render({
      input: { actionId: "choice-1", options: ["A", "B"] },
      isPaused: true,
      microphoneAccess: { actionId: "mic-1" },
      phase: "voting-moment",
      runtimeFault: { id: "fault-1", code: "ANSWERS_REQUIRED", message: "No answers were produced" }
    }, {});

    expect(result.id).toBe("runtimeFault");
    expect(renderMessage).toHaveBeenCalledWith(
      expect.anything(),
      "No answers were produced (ANSWERS_REQUIRED)",
      expect.objectContaining({ id: "runtimeFault:fault-1", showButton: false })
    );
    expect(choiceView.render).not.toHaveBeenCalled();
  });

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
