import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createTriviaContentRuntime } = require("./trivia-content-runtime");

function runtime() {
  return createTriviaContentRuntime({
    multipleChoicePrompts: [{
      id: "three-horns",
      prompt: "Which dinosaur had three horns?",
      options: ["Triceratops", "Stegosaurus"],
      correctAnswerIndex: 0
    }],
    normalizeFlowVariableName: (value) => String(value || "content")
  });
}

describe("trivia content stage setup", () => {
  it("prepares the stage prompt when random content is selected", () => {
    const room = { flowVariables: {} };

    runtime().storeRandomTriviaPrompt(room, "question");

    expect(room.triviaPromptText).toBe("Which dinosaur had three horns?");
    expect(room.flowVariables.question.prompt).toBe("Which dinosaur had three horns?");
  });

  it("also prepares the prompt when trivia uses its default content", () => {
    const room = { flowVariables: {} };

    runtime().triviaContentForAction(room, { contentVariable: "missing" });

    expect(room.triviaPromptText).toBe("Which dinosaur had three horns?");
  });

  it("uses prompts from the room's pinned bundle instead of process defaults", () => {
    const room = {
      flowVariables: {},
      gameData: {
        multipleChoicePrompts: [{
          id: "pinned",
          prompt: "Pinned prompt",
          options: ["Pinned answer"],
          correctAnswerIndex: 0
        }]
      }
    };

    runtime().storeRandomTriviaPrompt(room, "question");
    const content = runtime().triviaContentForAction(room, { contentVariable: "question" });

    expect(room.triviaPromptText).toBe("Pinned prompt");
    expect(content).toMatchObject({ id: "pinned", prompt: "Pinned prompt", options: ["Pinned answer"] });
  });
});
