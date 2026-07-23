"use strict";

function createTriviaContentRuntime({
  multipleChoicePrompts,
  normalizeFlowVariableName
}) {
  function promptsForRoom(room = null) {
    const pinnedPrompts = room?.gameData?.multipleChoicePrompts;
    return Array.isArray(pinnedPrompts) ? pinnedPrompts : multipleChoicePrompts;
  }

  function triviaPromptById(id, room = null) {
    return promptsForRoom(room).find((prompt) => prompt.id === id) || null;
  }

  function clonePrompt(prompt) {
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      options: [...prompt.options],
      correctAnswerIndex: prompt.correctAnswerIndex
    };
  }

  function randomTriviaPrompt(room = null) {
    const prompts = promptsForRoom(room);
    return prompts[Math.floor(Math.random() * prompts.length)] || prompts[0];
  }

  function shuffledTriviaPrompt(prompt) {
    const pairs = prompt.options.map((text, originalIndex) => ({ text, originalIndex }));
    for (let i = pairs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      options: pairs.map((item) => item.text),
      optionOriginalIndexes: pairs.map((item) => item.originalIndex),
      correctAnswerIndex: prompt.correctAnswerIndex
    };
  }

  function storeRandomTriviaPrompt(room, variableName) {
    const prompt = randomTriviaPrompt(room);
    room.flowVariables = room.flowVariables && typeof room.flowVariables === "object" ? room.flowVariables : {};
    room.flowVariables[normalizeFlowVariableName(variableName)] = clonePrompt(prompt);
    room.triviaPromptText = String(prompt?.prompt || "");
  }

  function triviaContentForAction(room, action) {
    const variableName = normalizeFlowVariableName(action?.contentVariable);
    const stored = room.flowVariables?.[variableName];
    const prompts = promptsForRoom(room);
    const prompt = stored?.id ? triviaPromptById(stored.id, room) || stored : prompts[0];
    const content = action?.randomizeOptions ? shuffledTriviaPrompt(prompt) : {
      ...clonePrompt(prompt),
      optionOriginalIndexes: prompt.options.map((_, index) => index)
    };
    room.triviaPromptText = String(content?.prompt || "");
    return content;
  }

  return {
    clonePrompt,
    storeRandomTriviaPrompt,
    triviaContentForAction
  };
}

module.exports = { createTriviaContentRuntime };
