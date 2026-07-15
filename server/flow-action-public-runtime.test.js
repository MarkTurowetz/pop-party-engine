import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createFlowActionPublicRuntime } = require("./flow-action-public-runtime");

describe("flow action public runtime", () => {
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
