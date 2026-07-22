import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLayoutNormalizationRuntime } = require("./layout-normalization-runtime");
const semanticRoles = {
  "engine.stage.roomCode": { compositionId: "stage-code-widget" },
  "engine.stage.joinQrCode": { compositionId: "join-qr-code" },
  "engine.stage.timer": { compositionId: "crafting-timer-widget" },
  "engine.stage.roomCodePanel": { compositionId: "stage-code-panel" },
  "engine.stage.joinPrompt": { compositionId: "join-widget" },
  "engine.stage.waitingStatus": { compositionId: "waiting-status-widget" },
  "engine.stage.countdown": { compositionId: "countdown-popup" },
  "engine.stage.presentationAdvancePrompt": { compositionId: "presentation-click-prompt" },
  "engine.stage.layoutText": { compositionId: "layout-text-field" },
  "engine.controller.avatarChoice": { compositionId: "controller-avatar-button" },
  "engine.controller.invalidSubmission": { compositionId: "controller-invalid-banner" },
  "engine.controller.submitControl": { compositionId: "controller-primary-button" },
  "engine.controller.playerIdentity": { compositionId: "controller-player-banner" },
  "engine.controller.textInput": { compositionId: "controller-text-input-field" },
  "engine.controller.playerNameInput": { compositionId: "controller-player-name-field" },
  "engine.controller.stageCodeInput": { compositionId: "controller-stage-code-field" }
};

function runtime() {
  return createLayoutNormalizationRuntime({
    cleanFlowText: (value, fallback = "") => String(value || fallback),
    cleanLayoutSelector: (value) => String(value || ""),
    cleanLayoutText: (value) => String(value || ""),
    defaultCanvas: { width: 390, height: 844 },
    normalizeColor: (value) => String(value || ""),
    normalizeFlowId: (value, fallback = "") => String(value || fallback),
    normalizeLayoutNumber: (value, fallback) => Number(value ?? fallback),
    semanticRoles
  });
}

describe("layout normalization", () => {
  it("keeps reference-game widget policy in the adapter", () => {
    expect(runtime().normalizeLayoutElement({ id: "startpopup" }, 0)).toMatchObject({
      artCompositionId: "countdown-popup",
      defaultAnimationState: "Park",
      kind: "art"
    });
  });

  it("normalizes and preserves configuration tags on saved elements", () => {
    const element = runtime().normalizeLayoutElement({
      id: "voicePrompt",
      tags: [" Phase One ", "phase   one", "Review", ""]
    }, 0);

    expect(element.tags).toEqual(["Phase One", "Review"]);
  });

  it("normalizes the explicit background/content layer contract", () => {
    expect(runtime().normalizeLayoutElement({ id: "background", layoutLayer: "BACKGROUND" }, 0).layoutLayer).toBe("background");
    expect(runtime().normalizeLayoutElement({ id: "content", layoutLayer: "unexpected" }, 1).layoutLayer).toBe("content");
  });
});
