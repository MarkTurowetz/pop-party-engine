import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createFlowActionPublicRuntime } = require("./flow-action-public-runtime");

describe("flow action public runtime", () => {
  it("does not serialize Setup Game as a Display Text action", () => {
    const runtime = createFlowActionPublicRuntime({
      availableFlowTransitions: [],
      flowActionTypeMeta: () => ({ category: "standard" })
    });

    expect(runtime.publicFlowAction({ id: "setup", name: "Setup Game", type: "setupGame", subActions: [] }, 0)).toMatchObject({
      id: "setup",
      actionType: "setupGame",
      type: "setupGame"
    });
  });

  it("serializes Log Value with its authored Flow expression", () => {
    const runtime = createFlowActionPublicRuntime({
      availableFlowTransitions: [],
      flowActionTypeMeta: () => ({ category: "standard" })
    });

    expect(runtime.publicFlowAction({
      id: "log-bid",
      name: "Log Bid",
      type: "logValue",
      value: "l.bidResponse",
      subActions: []
    }, 0)).toMatchObject({
      id: "log-bid",
      actionType: "logValue",
      type: "logValue",
      value: "l.bidResponse"
    });
  });

  it("pipes authoritative player correctness groups onto the reveal action", () => {
    const runtime = createFlowActionPublicRuntime({});
    const action = runtime.resolveRoomActionText(
      { id: "reveal", type: "revealPlayerAnswerCorrectness", subActions: [] },
      { playerAnswerGroups: { correct: ["right"], wrong: ["wrong"] } }
    );

    expect(action.answerCorrectness).toEqual({
      correctPlayerIds: ["right"],
      incorrectPlayerIds: ["wrong"]
    });
  });

  it("resolves host audio from the room-owned source", () => {
    const room = { gameData: { defaultHostAudios: { hostAudios: [] } } };
    const readHostAudios = vi.fn(() => ({ hostAudios: [] }));
    const resolveHostAudioAction = vi.fn((_room, action) => ({ ...action, resolved: true }));
    const runtime = createFlowActionPublicRuntime({ readHostAudios, resolveHostAudioAction });

    const action = runtime.resolveRoomActionText({ id: "audio", type: "playHostAudio", subActions: [] }, room);

    expect(readHostAudios).toHaveBeenCalledWith(room);
    expect(resolveHostAudioAction).toHaveBeenCalledWith(room, expect.any(Object), { hostAudios: [] });
    expect(action.resolved).toBe(true);
  });
});
