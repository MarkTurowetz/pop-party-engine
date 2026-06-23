(function () {
  "use strict";

  function createActionInspectorRegistry(context) {
    function appendActionPropertyControls(target, state, actionRef, options = {}) {
      const action = actionRef?.action;
      if (!target || !state || !action) return;
      const controls = context.getFlowActionControlGroups?.();
      const change = typeof options.change === "function" ? options.change : () => {};
      const softChange = typeof options.softChange === "function" ? options.softChange : change;
      const refresh = typeof options.refresh === "function" ? options.refresh : change;
      const refreshAll = typeof options.refreshAll === "function" ? options.refreshAll : refresh;
      const decisionChange = typeof options.decisionChange === "function" ? options.decisionChange : change;
      const targetOptions = typeof options.targetOptions === "function"
        ? options.targetOptions
        : (stateForOptions, actionForOptions, selectedTarget) => context.flowActionTargetOptions(stateForOptions, selectedTarget || "");
      const decisionTargetField = options.decisionTargetField || "targetActionId";
      const controlChange = (redraw = true) => (redraw ? change() : softChange());

      target.appendChild(context.flowActionNameField(state, action, (value) => {
        action.name = value || action.name;
        refreshAll();
      }, refreshAll));
      if (options.includeActionTypeControl !== false) {
        const typeOptions = typeof options.actionTypeOptions === "function"
          ? options.actionTypeOptions(action, actionRef)
          : actionTypeOptions(action, actionRef.isSubAction);
        target.appendChild(context.flowActionTypeSearch("Action Type", action.type, typeOptions, (value) => {
          context.applyFlowActionTypeDefaults(action, value, actionRef.isSubAction);
          context.refreshActionNameFromType(state, action);
          refreshAll();
        }));
      }

      appendActionTypeControls(target, state, actionRef, action, controls, {
        change,
        softChange,
        refresh,
        controlChange,
        decisionChange,
        decisionTargetField,
        targetOptions,
        stopAfterDecision: options.stopAfterDecision !== false
      });

      if (action.type === "decision" && options.stopAfterDecision !== false) return;

      appendNextActionControl(target, state, actionRef, action, change, options);
      appendTimingControls(target, actionRef, action, change);

      if (options.includeSubActionButton) {
        target.appendChild(context.flowActionButton("Add Sub-Action", () => context.addFlowSubAction(actionRef)));
      }
    }

    function actionTypeOptions(action, isSubAction = false) {
      return context.flowActionTypes().filter((option) => {
        if (isSubAction && option.primaryOnly) return false;
        if (option.deprecated && option.id !== action.type) return false;
        return true;
      });
    }

    function appendActionTypeControls(target, state, actionRef, action, controls, handlers) {
      if (action.type === "presentText" || action.type === "displayText" || action.type === "text") {
        controls?.appendTextActionControls(target, state, action, handlers.controlChange);
      }
      if (action.type === "presentText") appendStageClickExitControls(target, state, action, handlers);
      if (action.type === "multipleChoiceInput") appendMultipleChoiceControls(target, state, action, controls, handlers);
      if (action.type === "getRandomMultipleChoiceContent") appendRandomContentControls(target, action, handlers.change);
      if (action.type === "triviaInput") appendTriviaControls(target, state, action, controls, handlers);
      if (action.type === "textSubmissionInput" || action.type === "voiceSubmissionInput") appendTextSubmissionControls(target, state, action, controls, handlers);
      if (action.type === "prepareVotingCards") {
        target.appendChild(context.readOnlyFlowNote("Builds shuffled anonymous voting cards from the latest stored text answers. The card keeps the author internally, but players only see the answer text."));
      }
      if (action.type === "setVotingCardsShown") appendVotingCardsShownControls(target, action, controls, handlers.change);
      if (action.type === "voteOnAnswersInput") appendVoteInputControls(target, state, action, controls, handlers);
      if (action.type === "revealVotingResults") {
        target.appendChild(context.readOnlyFlowNote("Counts stored votes, marks winning voting cards, and reveals which players voted for each answer."));
      }
      if (action.type === "revealAuthors") {
        target.appendChild(context.readOnlyFlowNote("Reveals the author heading on each prepared voting card."));
      }
      if (action.type === "revealVotes") {
        controls?.appendBoundedNumberControl(target, action, "voteRevealStaggerSeconds", "Vote Stagger Seconds", handlers.change, { defaultValue: 1, min: 0, max: 60 });
        target.appendChild(context.readOnlyFlowNote("Reveals one voter per card per stagger interval. E+ timing starts after the final voter appears."));
      }
      if (action.type === "revealWinningAnswer") {
        target.appendChild(context.readOnlyFlowNote("Scores stored votes and highlights the winning voting card."));
      }
      if (action.type === "doNothing") {
        target.appendChild(context.readOnlyFlowNote("This action intentionally has no effect. Use its timing to create a pause or delayed branch."));
      }
      if (action.type === "jumpNode") appendJumpNodeControls(target, state, action, handlers.change);
      if (action.type === "playAudio") appendPlayAudioControls(target, action, handlers.change);
      if (action.type === "playHostAudio") appendPlayHostAudioControls(target, action, controls, handlers);
      if (action.type === "setPlayersShown") {
        controls?.appendVisibilityControls(target, action, handlers.controlChange, { visibleLabel: "Players Visible" });
      }
      if (action.type === "setPlayerAnswersShown") {
        controls?.appendVisibilityControls(target, action, handlers.controlChange, { visibleLabel: "Player Answers Visible" });
        controls?.appendPlayerFilterControls(target, action, handlers.change);
      }
      if (action.type === "revealPlayerAnswerCorrectness") {
        target.appendChild(context.readOnlyFlowNote("Compares stored player trivia answers to the current prompt and marks answer bubbles green or red."));
      }
      if (action.type === "showPoints") appendShowPointsControls(target, action, controls, handlers.change);
      if (action.type === "givePendingPoints") {
        target.appendChild(context.readOnlyFlowNote("Transfers every player's pending points into their score, then resets pending points to 0. No visual popup is shown."));
      }
      if (action.type === "setTimerShown") {
        controls?.appendVisibilityControls(target, action, handlers.controlChange, { visibleLabel: "Timer Visible" });
        target.appendChild(context.readOnlyFlowNote("Showing the timer resets it to the Crafting Timer Duration game constant. Hiding pauses it and keeps the current remaining value."));
      }
      if (action.type === "setWipeShown") {
        controls?.appendVisibilityControls(target, action, handlers.controlChange, { visibleLabel: "Wipe Visible" });
        target.appendChild(context.readOnlyFlowNote("Show covers the stage and stays covered. Hide continues the wipe offscreen, revealing whatever was prepared underneath."));
      }
      if (action.type === "startCraftingTimer") {
        target.appendChild(context.readOnlyFlowNote("The timer starts and this action advances normally. Timer Ends and Answers Submitted exits are defined on the input action that follows."));
      }
      if (action.type === "getPlayerAnswers") appendGetPlayerAnswersControls(target, action, handlers.change);
      if (action.type === "decision") appendDecisionActionControls(target, state, action, handlers);
      if (action.type === "transition") appendTransitionControls(target, action, handlers.change);
      if (action.type === "transitionState") appendTransitionStateControls(target, state, action, handlers);
    }

    function appendMultipleChoiceControls(target, state, action, controls, handlers) {
      const choiceConfig = globalThis.PartyChoiceInputActions?.choiceInputActionConfig?.(action.type) || {};
      const defaultPrompt = choiceConfig.prompt || "Answer this question by tapping an answer";
      target.appendChild(context.flowSelect("Button Style", action.inputMode || "singleSelect", context.choiceInputModeOptions(), (value) => {
        action.inputMode = value;
        handlers.refresh();
      }));
      if ((action.inputMode || "singleSelect") === "singleSelect") {
        target.appendChild(context.flowSelect("Locked", action.locked === true ? "true" : "false", context.flowTrueFalseOptions(false), (value) => {
          action.locked = value === "true";
          handlers.change();
        }));
      }
      target.appendChild(context.flowTextarea("Prompt Text", action.prompt || defaultPrompt, (value) => {
        action.prompt = value || defaultPrompt;
        handlers.softChange();
      }));
      target.appendChild(context.flowTextarea("Answer Bubble Text Options", (action.options || ["A", "B", "C", "D"]).join("\n"), (value) => {
        const nextOptions = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
        action.options = nextOptions.length ? nextOptions : ["A", "B", "C", "D"];
        handlers.softChange();
      }));
      controls?.appendInputExitControls(target, state, action, handlers.change, { targetOptions: handlers.targetOptions });
      target.appendChild(context.readOnlyFlowNote("Each line becomes one button label. Controllers send the option index; this action currently shows the matching line as the stage speech bubble. Choose None for On Answers Submitted when continuous input should wait for the timer."));
    }

    function appendRandomContentControls(target, action, change) {
      target.appendChild(context.flowField("Store In Variable", action.variableName || "multipleChoicePrompt", (value) => {
        action.variableName = (value || "multipleChoicePrompt").trim() || "multipleChoicePrompt";
        change();
      }));
      target.appendChild(context.readOnlyFlowNote("Gets a random prompt from the server prompt pool and stores it in this flow variable for later actions."));
    }

    function appendTriviaControls(target, state, action, controls, handlers) {
      target.appendChild(context.flowField("Multiple Choice Content Variable", action.contentVariable || "multipleChoicePrompt", (value) => {
        action.contentVariable = (value || "multipleChoicePrompt").trim() || "multipleChoicePrompt";
        handlers.change();
      }));
      target.appendChild(context.flowSelect("Button Style", action.inputMode || "submitOnce", context.choiceInputModeOptions(), (value) => {
        action.inputMode = value;
        handlers.refresh();
      }));
      if ((action.inputMode || "submitOnce") === "singleSelect") {
        target.appendChild(context.flowSelect("Locked", action.locked === true ? "true" : "false", context.flowTrueFalseOptions(false), (value) => {
          action.locked = value === "true";
          handlers.change();
        }));
      }
      target.appendChild(context.flowSelect("Randomize Options", action.randomizeOptions === true ? "true" : "false", context.flowTrueFalseOptions(false), (value) => {
        action.randomizeOptions = value === "true";
        handlers.change();
      }));
      controls?.appendInputExitControls(target, state, action, handlers.change, { targetOptions: handlers.targetOptions });
    }

    function appendTextSubmissionControls(target, state, action, controls, handlers) {
      const textAnswerConfig = globalThis.PartyTextAnswerActions?.textAnswerActionConfig?.(action.type) || {};
      const isVoice = textAnswerConfig.mode === "voiceVip";
      const defaultPrompt = textAnswerConfig.prompt || (isVoice ? "Say your answer" : "Write your answer");
      const defaultPlaceholder = textAnswerConfig.placeholder || (isVoice ? "Speak your answer" : "Answer here");
      target.appendChild(context.flowTextarea("Prompt Text", action.prompt || defaultPrompt, (value) => {
        action.prompt = value || defaultPrompt;
        handlers.softChange();
      }));
      target.appendChild(context.flowField(isVoice ? "Transcript Placeholder" : "Placeholder Text", action.placeholder || defaultPlaceholder, (value) => {
        action.placeholder = value || defaultPlaceholder;
        handlers.change();
      }));
      target.appendChild(context.flowNumber("Character Limit (0 = No Limit)", Number(action.characterLimit || 0), (value) => {
        action.characterLimit = Math.max(0, Math.floor(Number(value) || 0));
        handlers.change();
      }));
      controls?.appendInputExitControls(target, state, action, handlers.change, { targetOptions: handlers.targetOptions });
      target.appendChild(context.readOnlyFlowNote(isVoice
        ? "Only the VIP sees a microphone controller. The final transcript is stored like a text submission. Timer and answer exits belong to this input action."
        : "The stage validates text submissions. Current test rule: submissions must be non-empty and contain no numbers. Timer and answer exits belong to this input action."));
    }

    function appendVotingCardsShownControls(target, action, controls, change) {
      controls?.appendVisibilityControls(target, action, change, { visibleLabel: "Voting Cards Visible", includeInstant: false });
      target.appendChild(context.flowSelect("Cards", action.cardFilter || "all", context.votingCardFilterOptions(), (value) => {
        action.cardFilter = value;
        change();
      }));
      controls?.appendInstantControl(target, action, change);
    }

    function appendVoteInputControls(target, state, action, controls, handlers) {
      const choiceConfig = globalThis.PartyChoiceInputActions?.choiceInputActionConfig?.(action.type) || {};
      const defaultPrompt = choiceConfig.prompt || "Vote for your favorite answer";
      target.appendChild(context.flowTextarea("Prompt Text", action.prompt || defaultPrompt, (value) => {
        action.prompt = value || defaultPrompt;
        handlers.softChange();
      }));
      controls?.appendInputExitControls(target, state, action, handlers.change, {
        submittedLabel: `On ${choiceConfig.submittedLabel || "Votes Submitted"}`,
        targetOptions: handlers.targetOptions
      });
      target.appendChild(context.readOnlyFlowNote("Players vote for one anonymous answer card. The controller hides the player's own answer, and the stage stores votes secretly until results are revealed."));
    }

    function appendStageClickExitControls(target, state, action, handlers) {
      const selectedTarget = action.stageClickTargetActionId || action.nextTargetActionId || action.nextTargetNodeId || "";
      target.appendChild(context.flowSelect("On Screen Click", selectedTarget, handlers.targetOptions(state, action, selectedTarget), (value) => {
        action.stageClickTargetActionId = value;
        handlers.change();
      }));
      target.appendChild(context.readOnlyFlowNote("This input waits for a stage screen click event before following its exit."));
    }

    function appendPlayAudioControls(target, action, change) {
      target.appendChild(context.flowField("Audio URL", action.audioUrl || "", (value) => {
        action.audioUrl = value;
        change();
      }));
      target.appendChild(context.readOnlyFlowNote("Callback fires when the audio ends. Leave blank to complete immediately, or use S+ timing for fire-and-forget sound effects."));
    }

    function jumpTargetOptions(state, action) {
      const selectedTarget = action.jumpTargetActionId || "none";
      const options = [{ id: "none", name: "None" }];
      for (const candidate of state?.actions || []) {
        if (candidate.id === action.id) continue;
        options.push({ id: candidate.id, name: candidate.name || candidate.id });
      }
      if (selectedTarget && !options.some((option) => option.id === selectedTarget)) {
        options.push({ id: selectedTarget, name: selectedTarget });
      }
      return options;
    }

    function jumpTargetIsMissing(action) {
      const target = String(action?.jumpTargetActionId || "").toLowerCase();
      return !target || target === "none";
    }

    function appendJumpNodeControls(target, state, action, change) {
      target.appendChild(context.flowSelect("Jump Target", action.jumpTargetActionId || "none", jumpTargetOptions(state, action), (value) => {
        action.jumpTargetActionId = value || "none";
        change();
      }));
      target.appendChild(context.readOnlyFlowNote(jumpTargetIsMissing(action)
        ? "Warning: this Jump Node needs a target. If runtime reaches it while the target is None, the moment will hang here."
        : "Jump Nodes immediately move to the selected action in this moment. They do not use timing or draggable exit dots."));
    }

    function appendPlayHostAudioControls(target, action, controls, handlers) {
      controls?.appendHostAudioPlaybackControls(target, action, handlers.change, {
        onPlaybackModeChange: handlers.refresh
      });
      target.appendChild(context.readOnlyFlowNote("Callback fires when the selected host-audio line ends. Blank URLs complete immediately."));
    }

    function appendShowPointsControls(target, action, controls, change) {
      controls?.appendPlayerFilterControls(target, action, change, { defaultFilter: "correct" });
      controls?.appendBoundedNumberControl(target, action, "points", "Points (0 = Correct Answer Constant)", change, { defaultValue: 0, min: 0, integer: true });
      target.appendChild(context.readOnlyFlowNote("Adds pending points immediately, then shows a temporary points popup above each targeted player's answer bubble."));
    }

    function appendGetPlayerAnswersControls(target, action, change) {
      target.appendChild(context.flowTextarea("Input ID", action.inputId || "input", (value) => {
        action.inputId = value.trim() || "input";
        change();
      }));
      target.appendChild(context.flowSelect("Round", action.round || "current", context.roundOptions(), (value) => {
        action.round = value;
        change();
      }));
      target.appendChild(context.flowTextarea("Variable Name", action.variableName || "playerAnswers", (value) => {
        action.variableName = value.trim() || "playerAnswers";
        change();
      }));
      target.appendChild(context.readOnlyFlowNote("Stores an array of { playerId, text, optionIndex, ... } objects into a flow variable for use in decisions and moment-specific actions."));
    }

    function appendDecisionActionControls(target, state, action, handlers) {
      const targetField = handlers.decisionTargetField || "targetActionId";
      context.appendDecisionControls(target, state, action, handlers.decisionChange, {
        targetField,
        targetOptions: (stateForOptions, actionForOptions, selectedTarget) => handlers.targetOptions(stateForOptions, actionForOptions, selectedTarget || "")
      });
      target.appendChild(context.readOnlyFlowNote(handlers.stopAfterDecision
        ? "Decision actions do not use timing. They evaluate branches in order and wait forever if the selected branch has no connection."
        : "Decision actions are invisible branch points. Runtime evaluates them immediately and jumps to the selected target action."));
    }

    function appendTransitionControls(target, action, change) {
      target.appendChild(context.flowSelect("Transition", action.transition || "horizontalWipe", context.flowTransitions(), (value) => {
        action.transition = value;
        change();
      }));
      target.appendChild(context.readOnlyFlowNote("Deprecated: use Set Wipe Shown for wipe art and Jump Node for explicit flow jumps."));
    }

    function appendTransitionStateControls(target, state, action, handlers) {
      target.appendChild(context.flowSelect("Target State", action.targetState || "intro", context.gameStates().map((item) => ({ id: item.id, name: item.name })), (value) => {
        action.targetState = value;
        handlers.change();
      }));
      target.appendChild(context.flowSelect("Trigger", action.trigger || "", context.transitionTriggerOptions(), (value) => {
        action.trigger = value;
        handlers.change();
      }));
      target.appendChild(context.flowSelect(action.trigger === "onCountdownComplete" ? "On Countdown Complete Exit" : "Event Exit", action.nextTargetActionId || "", handlers.targetOptions(state, action, action.nextTargetActionId || ""), (value) => {
        action.nextTargetActionId = value;
        handlers.change();
      }));
    }

    function appendNextActionControl(target, state, actionRef, action, change, options) {
      const excludedTypes = new Set(["decision", "jumpNode", "transitionState"]);
      if (context.actionTypeMeta(action.type).category === "input") excludedTypes.add(action.type);
      for (const type of options.excludeNextActionTypes || []) excludedTypes.add(type);
      if (actionRef.isSubAction || excludedTypes.has(action.type)) return;
      const nextTargetField = options.nextTargetField || "nextTargetActionId";
      const selectedTarget = action[nextTargetField] || "";
      target.appendChild(context.flowSelect(options.nextTargetLabel || "Next Action", selectedTarget, (options.targetOptions || ((stateForOptions, actionForOptions, targetId) => context.flowActionTargetOptions(stateForOptions, targetId || "")))(state, action, selectedTarget), (value) => {
        action[nextTargetField] = value;
        change();
      }));
    }

    function appendTimingControls(target, actionRef, action, change) {
      if (action.type === "jumpNode") return;
      const waitsForFlowEvent = context.actionTypeMeta(action.type).category === "input"
        || (action.type === "transitionState" && action.trigger === "onCountdownComplete");
      const isInputAction = waitsForFlowEvent && !actionRef.isSubAction;
      const timingOptions = actionRef.isSubAction
        ? [{ id: "S+", name: "S+ Timing" }]
        : isInputAction
          ? [{ id: "E+", name: "E+ Timing" }]
          : [{ id: "E+", name: "E+ Timing" }, { id: "S+", name: "S+ Timing" }];
      if (isInputAction) target.appendChild(context.readOnlyFlowNote("Input actions always use E+ timing because they wait for player, stage, or system events."));
      if (actionRef.isSubAction) target.appendChild(context.readOnlyFlowNote("Sub-actions use S+ timing as an offset from the primary action start."));
      const timing = context.ensureActionTiming(action, actionRef.isSubAction);
      target.appendChild(context.flowSelect("Timing Mode", timing.mode, timingOptions, (value) => {
        context.ensureActionTiming(action, actionRef.isSubAction).mode = value === "S+" && !isInputAction ? "S+" : "E+";
        change();
      }));
      target.appendChild(context.flowNumber("Timing Seconds", timing.seconds, (value) => {
        context.ensureActionTiming(action, actionRef.isSubAction).seconds = value;
        change();
      }));
    }

    return { appendActionPropertyControls };
  }

  window.PartyGameFlowActionInspectorRegistry = { createActionInspectorRegistry };
})();
