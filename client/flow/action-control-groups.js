(function () {
  "use strict";

  function createActionControlGroups(context) {
    function appendTextActionControls(target, state, action, rerender) {
      const textTargetOptions = context.textTargetOptionsForFlowState(state.id, action.textTarget || "presentation");
      target.appendChild(context.flowSelect("Text Field", context.normalizeTextTargetId(action.textTarget || textTargetOptions[0]?.id || "presentation"), textTargetOptions, (value) => {
        action.textTarget = value;
        rerender();
      }));
      target.appendChild(context.flowTextarea("Text", action.text || "", (value) => {
        action.text = value;
        rerender(false);
      }));
      appendVisibilityControls(target, action, rerender, { visibleLabel: "Text Visible" });
    }

    function appendInstantControl(target, action, rerender) {
      appendBooleanSelect(target, "Instant", action.instant === true ? "true" : "false", false, (value) => {
        action.instant = value === "true";
        rerender();
      });
    }

    function appendVisibilityControls(target, action, rerender, options = {}) {
      const visibleLabel = options.visibleLabel || "Visible";
      appendBooleanSelect(target, visibleLabel, action.isShown === false ? "false" : "true", true, (value) => {
        action.isShown = value !== "false";
        rerender();
      });
      if (options.includeInstant !== false) appendInstantControl(target, action, rerender);
    }

    function appendInputExitControls(target, state, action, rerender, options = {}) {
      const submittedLabel = options.submittedLabel || "On Answers Submitted";
      const targetOptions = typeof options.targetOptions === "function"
        ? options.targetOptions
        : (stateForOptions, actionForOptions, selectedTarget) => context.flowActionTargetOptions(stateForOptions, selectedTarget || "");
      target.appendChild(context.flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions(state, action, action.timerEndTargetActionId || ""), (value) => {
        action.timerEndTargetActionId = value;
        rerender();
      }));
      target.appendChild(context.flowSelect(submittedLabel, action.answersSubmittedTargetActionId || "", targetOptions(state, action, action.answersSubmittedTargetActionId || ""), (value) => {
        action.answersSubmittedTargetActionId = value;
        rerender();
      }));
    }

    function appendPlayerFilterControls(target, action, rerender, options = {}) {
      const label = options.label || "Players";
      const defaultFilter = options.defaultFilter || "all";
      target.appendChild(context.flowSelect(label, action.playerFilter || defaultFilter, context.playerFilterOptions(), (value) => {
        action.playerFilter = value;
        rerender();
      }));
    }

    function appendHostAudioPlaybackControls(target, action, rerender, options = {}) {
      target.appendChild(context.flowHostAudioSearch("Host Audio", action.hostAudioId || "", (value) => {
        action.hostAudioId = value;
        rerender();
      }));
      target.appendChild(context.flowSelect("Playback", action.playMode || "random", context.hostAudioPlayModeOptions(), (value) => {
        action.playMode = value;
        if (typeof options.onPlaybackModeChange === "function") {
          options.onPlaybackModeChange();
        } else {
          rerender();
        }
      }));
      if ((action.playMode || "random") === "index") {
        target.appendChild(context.flowInteger("Line Index (0 = First Line)", Number(action.lineIndex || 0), (value) => {
          action.lineIndex = Math.max(0, Math.floor(Number(value) || 0));
          rerender();
        }));
      }
    }

    function appendBoundedNumberControl(target, action, key, label, rerender, options = {}) {
      const defaultValue = Number(options.defaultValue ?? 0);
      const min = Number(options.min ?? Number.NEGATIVE_INFINITY);
      const max = Number(options.max ?? Number.POSITIVE_INFINITY);
      target.appendChild(context.flowNumber(label, Number(action[key] ?? defaultValue), (value) => {
        const rawValue = Number(value) || 0;
        const roundedValue = options.integer ? Math.floor(rawValue) : rawValue;
        action[key] = Math.max(min, Math.min(max, roundedValue));
        rerender();
      }));
    }

    function appendBooleanSelect(target, label, value, trueFirst, onChange) {
      target.appendChild(context.flowSelect(label, value, context.flowTrueFalseOptions(trueFirst), onChange));
    }

    return {
      appendBooleanSelect,
      appendBoundedNumberControl,
      appendHostAudioPlaybackControls,
      appendInputExitControls,
      appendInstantControl,
      appendPlayerFilterControls,
      appendVisibilityControls,
      appendTextActionControls
    };
  }

  window.PartyGameFlowActionControlGroups = { createActionControlGroups };
})();
