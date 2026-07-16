import { describe, expect, it, vi } from "vitest";
import { createControllerGlobalActionView } from "./controllerGlobalActionView";
import { controllerLayoutStateIds } from "../../shared/controller-layout-states";

function view() {
  return createControllerGlobalActionView({
    advanceStageClick: vi.fn(),
    applyLayoutForPhase: vi.fn(),
    elements: {} as never,
    hideViews: vi.fn(),
    showView: vi.fn()
  });
}

describe("createControllerGlobalActionView (ported)", () => {
  it("presentClickConfig is null without a present click action", () => {
    expect(view().presentClickConfig({}, {})).toBe(null);
    expect(view().presentClickConfig({ action: { type: "present" } }, {})).toBe(null);
  });

  it("presentClickConfig enables the button for the VIP only", () => {
    const lobby = { action: { type: "present", id: "a1" }, phase: "intro" };
    const vip = view().presentClickConfig(lobby, { isVip: true });
    const guest = view().presentClickConfig(lobby, { isVip: false });
    expect(vip?.enabled).toBe(true);
    expect(vip?.showButton).toBe(true);
    expect(vip?.message).toBe("Tap Next to continue");
    expect(guest?.enabled).toBe(false);
    expect(guest?.message).toBe("Waiting for the VIP to continue");
    expect(vip?.layoutPhase).toBe(controllerLayoutStateIds.presentation);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerGlobalActionView?: unknown };
    expect(host.createControllerGlobalActionView).toBeTypeOf("function");
  });

  it("spawns a state-local button and disposes it before another controller state", () => {
    const presentationContainer = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const pausedContainer = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const presentationMessage = "controllerPresentationMessage";
    const lifecycle = vi.fn();
    const disposeButtonArt = vi.fn();
    const remove = vi.fn();
    const button = {
      dataset: {},
      disabled: false,
      isConnected: true,
      parentElement: presentationContainer,
      remove,
      onclick: null
    } as unknown as HTMLButtonElement;
    const actionView = createControllerGlobalActionView({
      advanceStageClick: vi.fn(),
      applyLayoutForPhase: vi.fn(),
      bindPress: vi.fn(),
      createButton: vi.fn(() => button),
      disposeButtonArt,
      elements: {
        presentation: {
          buttonContainer: presentationContainer,
          buttonId: "controllerPresentationButton",
          message: presentationMessage
        },
        paused: {
          buttonContainer: pausedContainer,
          buttonId: "controllerPausedButton",
          message: "controllerPausedMessage"
        },
        state: {} as HTMLElement
      },
      hideViews: vi.fn(),
      setButtonLifecycleState: lifecycle,
      setButtonText: vi.fn(),
      setText: vi.fn(),
      showView: vi.fn()
    });

    actionView.renderConfig({
      id: "present",
      enabled: true,
      layoutPhase: controllerLayoutStateIds.presentation,
      run: vi.fn(),
      showButton: true
    });
    expect(button.dataset.optionId).toBe("global.action");
    expect(lifecycle).toHaveBeenCalledWith(button, "On");

    actionView.prepareForLayout(controllerLayoutStateIds.paused);
    expect(lifecycle).toHaveBeenLastCalledWith(button, "Off");
    expect(disposeButtonArt).toHaveBeenCalledWith(button);
    expect(remove).toHaveBeenCalledOnce();
  });
});
