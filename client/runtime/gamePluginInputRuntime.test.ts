import { afterEach, describe, expect, it, vi } from "vitest";
import { createGamePluginInputView } from "./gamePluginInputRuntime";

describe("game plugin input runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives a namespaced custom layout precedence over the room phase layout", () => {
    vi.stubGlobal("document", {
      getElementById: (id: string) => id === "pop-party-runtime-config"
        ? {
            textContent: JSON.stringify({
              gamePlugin: {
                inputs: [{
                  id: "fixture.customInput",
                  submission: [],
                  controller: { bindings: [] }
                }]
              }
            })
          }
        : null,
      querySelectorAll: () => []
    });
    const applyLayoutForPhase = vi.fn();
    const view = createGamePluginInputView({
      applyLayoutForPhase,
      hideViews: vi.fn(),
      renderState: vi.fn(),
      showView: vi.fn(),
      submit: vi.fn()
    });

    expect(view.render({
      phase: "round-initialization",
      gamePlugin: {
        input: {
          actionId: "fixture-input",
          type: "fixture.customInput",
          visitId: 2,
          gameSessionId: 3,
          layoutStateId: "fixture-custom-layout",
          viewModel: {}
        }
      }
    })).toBe(true);
    expect(applyLayoutForPhase).toHaveBeenCalledWith(
      "fixture-custom-layout",
      expect.any(Function),
      { preferRequestedState: true }
    );
  });

  it("switches a submitted recipient to the authored confirmation layout on the same visit", () => {
    vi.stubGlobal("document", {
      getElementById: () => ({
        textContent: JSON.stringify({ gamePlugin: { inputs: [{
          id: "fixture.wager",
          submission: [],
          controller: {
            bindings: [],
            submitted: { layoutStateId: "fixture-wager-confirmed", bindings: [] }
          }
        }] } })
      }),
      querySelectorAll: () => []
    });
    const applyLayoutForPhase = vi.fn();
    const view = createGamePluginInputView({
      applyLayoutForPhase,
      hideViews: vi.fn(),
      renderState: vi.fn(),
      showView: vi.fn(),
      submit: vi.fn()
    });

    expect(view.render({ gamePlugin: { input: {
      actionId: "wager",
      type: "fixture.wager",
      visitId: 8,
      gameSessionId: 2,
      submitted: true,
      layoutStateId: "fixture-wager-confirmed",
      viewModel: { privateTarget: 17 }
    } } })).toBe(true);
    expect(applyLayoutForPhase).toHaveBeenCalledWith(
      "fixture-wager-confirmed",
      expect.any(Function),
      { preferRequestedState: true }
    );
  });
});
