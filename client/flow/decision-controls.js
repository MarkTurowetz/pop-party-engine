(function () {
  "use strict";

  const customDecisionVariableId = "__custom_variable_path__";

  function createDecisionControls(context) {
    function baseDecisionVariableOptions() {
      const currentConstants = typeof context.gameConstants === "function" ? context.gameConstants() : {};
      const customConstants = Array.isArray(currentConstants?.customConstants) ? currentConstants.customConstants : [];
      const customOptions = customConstants.flatMap((constant) => {
        const label = constant.name || constant.id;
        const typeLabel = constant.type ? ` (${constant.type})` : "";
        const options = [{
          id: `constants.${constant.id}`,
          name: `Constant: ${label}${typeLabel}`
        }];
        if (constant.type === "list") {
          options.push({
            id: `constants.${constant.id}.count`,
            name: `Constant: ${label} Count`
          });
        }
        return options;
      });
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
        { id: "textInputAnswers.count", name: "Text Answers.count" },
        ...customOptions
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

    function decisionBranchModel(state, action, branch, index, options = {}) {
      const descriptors = context.flowNodeBranchDescriptors?.()?.descriptorsFor(state, action, options) || [];
      const descriptor = descriptors.find((item) => item.branch.id === branch?.id) || descriptors[index] || null;
      const targetField = descriptor?.targetField || decisionTargetField(options);
      const liveBranch = descriptor?.branch || branch;
      return {
        branch: liveBranch,
        descriptor,
        index: descriptor?.index ?? index,
        targetField
      };
    }

    function decisionTargetOptions(state, action, branch, options = {}) {
      const targetField = decisionTargetField(options);
      const selectedTarget = branch[targetField] || "";
      if (typeof options.targetOptions === "function") return options.targetOptions(state, action, selectedTarget, branch);
      return context.flowActionTargetOptions(state, branch[targetField] || "");
    }

    function addDecisionBranch(action, type, options = {}) {
      const targetField = decisionTargetField(options);
      const branches = context.ensureDecisionBranches(action, options);
      const noMatchIndex = Math.max(0, branches.findIndex((branch) => branch.type === "noMatch"));
      const branch = {
        id: context.makeDecisionBranchId(type),
        type,
        value: type === "hit" ? "0" : "",
        code: type === "code" ? "x < 3" : "",
        [targetField]: ""
      };
      context.pushFlowHistory?.();
      branches.splice(noMatchIndex, 0, branch);
      action.branches = branches;
      context.ensureDecisionBranches(action, options);
      return branch.id;
    }

    function moveDecisionBranch(action, branchId, direction, options = {}) {
      const branches = context.ensureDecisionBranches(action, options);
      const index = branches.findIndex((branch) => branch.id === branchId);
      if (index < 0 || branches[index]?.type === "noMatch") return false;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= branches.length || branches[targetIndex]?.type === "noMatch") return false;
      context.pushFlowHistory?.();
      const [branch] = branches.splice(index, 1);
      branches.splice(targetIndex, 0, branch);
      action.branches = branches;
      context.ensureDecisionBranches(action, options);
      return true;
    }

    function appendDecisionBranchControls(target, state, action, branch, index, rerender, options = {}) {
      const model = decisionBranchModel(state, action, branch, index, options);
      branch = model.branch;
      index = model.index;
      const targetField = model.targetField;
      const branchId = branch?.id || "";
      const liveBranchModel = () => decisionBranchModel(state, action, { id: branchId }, index, options);
      const liveBranch = () => liveBranchModel().branch || branch;
      const liveTargetField = () => liveBranchModel().targetField || targetField;
      const panel = document.createElement("div");
      panel.className = "flow-form-grid";
      const branchTypeOptions = branch.type === "noMatch"
        ? [{ id: "noMatch", name: "No Match Branch" }]
        : [
            { id: "hit", name: "Hit Branch" },
            { id: "code", name: "Code Branch" }
          ];
      panel.appendChild(context.flowSelect(`Branch ${index + 1} Type`, branch.type, branchTypeOptions, (value) => {
        const currentBranch = liveBranch();
        currentBranch.type = value;
        if (value === "code" && !currentBranch.code) currentBranch.code = "x < 3";
        rerender();
      }));
      if (branch.type === "hit") {
        const hitValueControl = (context.flowTextarea || context.flowField)("Hit Value", branch.value || "", (value) => {
          liveBranch().value = value;
          rerender(false);
        });
        panel.appendChild(hitValueControl);
      }
      if (branch.type === "code") {
        const codeControl = (context.flowTextarea || context.flowField)("Code", branch.code || "x < 3", (value) => {
          liveBranch().code = value || "x < 3";
          rerender(false);
        });
        panel.appendChild(codeControl);
      }
      panel.appendChild(context.flowSelect("Branch Target", branch[targetField] || "", decisionTargetOptions(state, action, branch, options), (value) => {
        liveBranch()[liveTargetField()] = value;
        rerender();
      }));
      if (branch.type !== "noMatch") {
        const moveRow = document.createElement("div");
        moveRow.className = "flow-form-grid";
        const upButton = context.flowActionButton("Move Branch Up", () => {
          if (moveDecisionBranch(action, branchId, -1, options)) rerender();
        });
        const downButton = context.flowActionButton("Move Branch Down", () => {
          if (moveDecisionBranch(action, branchId, 1, options)) rerender();
        });
        upButton.disabled = index <= 0;
        downButton.disabled = index >= context.ensureDecisionBranches(action, options).filter((item) => item.type !== "noMatch").length - 1;
        moveRow.append(upButton, downButton);
        panel.appendChild(moveRow);
        panel.appendChild(context.flowActionButton("Remove Branch", () => {
          context.pushFlowHistory?.();
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
      if (options.includeBranchPanels !== false) {
        target.appendChild(context.readOnlyFlowNote("Branches are evaluated in order. The required No Match branch acts like an else statement."));
        const branches = context.ensureDecisionBranches(action, options);
        branches.forEach((branch, index) => {
          appendDecisionBranchControls(target, state, action, branch, index, rerender, options);
        });
      }
      target.appendChild(context.flowActionButton("Add Branch", () => {
        addDecisionBranch(action, "hit", options);
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
