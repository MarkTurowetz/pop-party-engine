(function () {
  "use strict";

  const customDecisionVariableId = "__custom_variable_path__";

  function createDecisionControls(context) {
    function baseDecisionVariableOptions() {
      return [
        { id: "activePlayerCount", name: "Active Player Count" },
        { id: "currentRound", name: "Current Round" },
        { id: "numSequentialGames", name: "Sequential Games" },
        { id: "isFirstGameOfSession", name: "Is First Game of Session" },
        { id: "gameTitle", name: "Game Title" },
        { id: "numberOfRounds", name: "Number of Rounds" },
        { id: "randomChanceTest", name: "Random Chance Test" },
        { id: "overrideFirstGameOfSession", name: "Override First Game of Session" },
        { id: "craftingTimerDuration", name: "Crafting Timer Duration" },
        { id: "startGameCountdownDuration", name: "Start Game Countdown Duration" },
        { id: "players.length", name: "Players.length" },
        { id: "choiceInputAnswers.count", name: "Choice Answers.count" },
        { id: "textInputAnswers.count", name: "Text Answers.count" }
      ];
    }

    function isKnownDecisionVariable(variable) {
      return baseDecisionVariableOptions().some((option) => option.id === variable);
    }

    function decisionVariableOptions() {
      return [
        ...baseDecisionVariableOptions(),
        { id: customDecisionVariableId, name: "Custom Variable Path" }
      ];
    }

    function decisionTargetField(options = {}) {
      return options.targetField || "targetActionId";
    }

    function decisionTargetOptions(state, action, branch, options = {}) {
      if (typeof options.targetOptions === "function") return options.targetOptions(state, action, branch);
      const targetField = decisionTargetField(options);
      return context.flowActionTargetOptions(state, branch[targetField] || "");
    }

    function addDecisionBranch(action, type, options = {}) {
      const targetField = decisionTargetField(options);
      const branches = context.ensureDecisionBranches(action, options);
      const noMatchIndex = Math.max(0, branches.findIndex((branch) => branch.type === "noMatch"));
      branches.splice(noMatchIndex, 0, {
        id: context.makeDecisionBranchId(type),
        type,
        value: type === "hit" ? "0" : "",
        code: type === "code" ? "x < 3" : "",
        [targetField]: ""
      });
    }

    function appendDecisionBranchControls(target, state, action, branch, index, rerender, options = {}) {
      const targetField = decisionTargetField(options);
      const panel = document.createElement("div");
      panel.className = "flow-form-grid";
      const branchTypeOptions = branch.type === "noMatch"
        ? [{ id: "noMatch", name: "No Match Branch" }]
        : [
            { id: "hit", name: "Hit Branch" },
            { id: "code", name: "Code Branch" }
          ];
      panel.appendChild(context.flowSelect(`Branch ${index + 1} Type`, branch.type, branchTypeOptions, (value) => {
        branch.type = value;
        if (value === "code" && !branch.code) branch.code = "x < 3";
        rerender();
      }));
      if (branch.type === "hit") {
        panel.appendChild(context.flowField("Hit Value", branch.value || "", (value) => {
          branch.value = value;
          rerender(false);
        }));
      }
      if (branch.type === "code") {
        panel.appendChild(context.flowField("Code", branch.code || "x < 3", (value) => {
          branch.code = value || "x < 3";
          rerender(false);
        }));
      }
      panel.appendChild(context.flowSelect("Branch Target", branch[targetField] || "", decisionTargetOptions(state, action, branch, options), (value) => {
        branch[targetField] = value;
        rerender();
      }));
      if (branch.type !== "noMatch") {
        panel.appendChild(context.flowActionButton("Remove Branch", () => {
          action.branches = context.ensureDecisionBranches(action, options).filter((item) => item.id !== branch.id);
          context.ensureDecisionBranches(action, options);
          rerender();
        }));
      }
      target.appendChild(panel);
    }

    function appendDecisionControls(target, state, action, rerender, options = {}) {
      context.ensureDecisionBranches(action, options);
      const variable = action.variable || "activePlayerCount";
      const usesCustomVariable = action.variableMode === "custom" || !isKnownDecisionVariable(variable);
      target.appendChild(context.flowVariableSearch("Variable", usesCustomVariable ? customDecisionVariableId : variable, decisionVariableOptions(), (value) => {
        if (value === customDecisionVariableId) {
          action.variableMode = "custom";
        } else {
          delete action.variableMode;
          action.variable = value;
        }
        rerender();
      }));
      if (usesCustomVariable) {
        target.appendChild(context.flowField("Custom Variable Path", isKnownDecisionVariable(variable) ? "" : variable, (value) => {
          action.variableMode = "custom";
          action.variable = value.trim();
          rerender(false);
        }));
      }
      target.appendChild(context.flowSelect("Value Type", action.valueType || "int", [
        { id: "int", name: "Int" },
        { id: "float", name: "Float" },
        { id: "string", name: "String" },
        { id: "bool", name: "Bool" }
      ], (value) => {
        action.valueType = value;
        rerender();
      }));
      target.appendChild(context.readOnlyFlowNote("Branches are evaluated in order. The required No Match branch acts like an else statement."));
      const branches = context.ensureDecisionBranches(action, options);
      branches.forEach((branch, index) => {
        appendDecisionBranchControls(target, state, action, branch, index, rerender, options);
      });
      target.appendChild(context.flowActionButton("+ Hit Branch", () => {
        addDecisionBranch(action, "hit", options);
        rerender();
      }));
      target.appendChild(context.flowActionButton("+ Code Branch", () => {
        addDecisionBranch(action, "code", options);
        rerender();
      }));
    }

    return {
      appendDecisionBranchControls,
      appendDecisionControls
    };
  }

  window.PartyGameFlowDecisionControls = { createDecisionControls };
})();
