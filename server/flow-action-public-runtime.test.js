import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

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
});
