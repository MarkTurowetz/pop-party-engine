import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { controllerPlayerBannerRenderOptions, layoutTextArtRenderOptions, layoutTextArtUsesNestedPrefab } from "./layoutRuntime";

const globals = globalThis as typeof globalThis & {
  artComposition?: (id: string) => Record<string, unknown> | null;
};
const previousArtComposition = globals.artComposition;

beforeEach(() => {
  globalThis.__POP_PARTY_RUNTIME_CONFIG__ = {
    semanticRoles: {
      "engine.controller.playerIdentity": { compositionId: "controller-player-banner" },
      "engine.controller.textInput": { compositionId: "controller-text-input-field" },
      "engine.controller.submitControl": { compositionId: "controller-primary-button" },
      "engine.controller.choiceControl": { compositionId: "controller-choice-option" },
      "engine.controller.invalidSubmission": { compositionId: "controller-invalid-banner" },
      "engine.controller.stageCodeInput": { compositionId: "controller-stage-code-field" },
      "engine.controller.playerNameInput": { compositionId: "controller-player-name-field" },
      "engine.controller.avatarChoice": { compositionId: "controller-avatar-button" }
    }
  };
});

afterEach(() => {
  globals.artComposition = previousArtComposition;
});

describe("layout text art runtime targeting", () => {
  it("targets a flat Layout Text Field even when the child prefab also exists", () => {
    globals.artComposition = (id) => {
      if (id === "layout-text-field") return { id, components: [{ id: "text", kind: "text" }] };
      if (id === "prefab-layout-text-field-text") return { id, components: [{ id: "text", kind: "text" }] };
      return null;
    };

    expect(layoutTextArtUsesNestedPrefab()).toBe(false);
    expect(layoutTextArtRenderOptions({ defaultText: "Lobby" }).textOverrides).toEqual({
      "layout-text-field/text": "Lobby",
      text: "Lobby"
    });
  });

  it("targets the nested text prefab only when the active parent references it", () => {
    globals.artComposition = (id) => id === "layout-text-field"
      ? {
          id,
          components: [{
            id: "layout-text-field-text",
            kind: "reference",
            artCompositionId: "prefab-layout-text-field-text"
          }]
        }
      : null;

    expect(layoutTextArtUsesNestedPrefab()).toBe(true);
    expect(layoutTextArtRenderOptions({ defaultText: "Round Intro" }).textOverrides).toEqual({
      "prefab-layout-text-field-text/text": "Round Intro",
      "layout-text-field/text": ""
    });
  });
});

describe("controller Player Banner runtime targeting", () => {
  it("binds identity to the nested name and deepest avatar sprite", () => {
    expect(controllerPlayerBannerRenderOptions({
      name: "Ava",
      avatar: { shape: "trike", color: "#ff4fa3" }
    })).toEqual({
      textOverrides: {
        "player-name-widget/name-text": "Ava",
        "controller-player-banner/banner-name": "Ava"
      },
      componentOverrides: {
        "avatars/avatar": { imageTint: "#ff4fa3" }
      }
    });
  });
});
