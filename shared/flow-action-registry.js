"use strict";
// TypeScript source for the dual-use flow action registry (server require + client global).
// Built to shared/flow-action-registry.js via `npm run build:shared` (committed output).
// Body wrapped in a bare block so its top-level names stay local to the shared/*.ts
// compilation (they don't leak into the global script scope shared with game-data.ts).
{
    const textAnswerActions = typeof require === "function"
        ? require("./text-answer-action-config")
        : globalThis.PartyTextAnswerActions;
    const microphoneAccessActions = typeof require === "function"
        ? require("./microphone-access-action-config")
        : globalThis.PartyMicrophoneAccessActions;
    function normalizeVoteRevealStaggerSeconds(value) {
        const number = Number(value);
        return Number(Math.max(0, Math.min(60, Number.isFinite(number) ? number : 1)).toFixed(2));
    }
    function normalizeTextAction(action, base, context, fallbackText) {
        return {
            ...base,
            text: context.cleanFlowText(action?.text, fallbackText),
            textTarget: context.normalizeTextTarget(action?.textTarget),
            isShown: action?.isShown !== false,
            instant: action?.instant === true
        };
    }
    function publicTextAction(action, base, context, publicType) {
        return {
            ...base,
            type: publicType,
            text: action.text,
            textTarget: action.textTarget || "presentation",
            isShown: action.isShown !== false,
            instant: action.instant === true
        };
    }
    function normalizeLayoutTargetScope(value) {
        const scope = String(value || "").toLowerCase();
        return ["global", "moment"].includes(scope) ? scope : "";
    }
    function normalizeLayoutTargetSurface(value) {
        const surface = String(value || "").toLowerCase();
        return ["stage", "controller"].includes(surface) ? surface : "stage";
    }
    function identityAction(publicType) {
        return {
            canCompleteFromStage: true,
            stageActionType: publicType,
            normalize: (action, base) => ({ ...base }),
            toPublic: (action, base) => ({ ...base, type: publicType })
        };
    }
    function submissionInputDefinition({ id, name, prompt, placeholder }) {
        const config = textAnswerActions?.textAnswerActionConfig?.(id) || {};
        const defaultPrompt = config.prompt || prompt;
        const defaultPlaceholder = config.placeholder || placeholder;
        return {
            id,
            name,
            category: "input",
            canCompleteFromStage: true,
            completionCleanup: "text",
            stageActionType: id,
            normalize: (action, base, context) => ({
                ...base,
                prompt: context.cleanFlowText(action?.prompt, defaultPrompt),
                placeholder: context.cleanFlowText(action?.placeholder, defaultPlaceholder),
                characterLimit: context.normalizeCharacterLimit(action?.characterLimit),
                timerEndTargetActionId: context.flowActionTarget(action?.timerEndTargetActionId),
                answersSubmittedTargetActionId: context.flowActionTarget(action?.answersSubmittedTargetActionId)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: id,
                prompt: action.prompt || defaultPrompt,
                placeholder: action.placeholder || defaultPlaceholder,
                characterLimit: context.normalizeCharacterLimit(action.characterLimit),
                timerEndTargetActionId: action.timerEndTargetActionId || "",
                answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
            })
        };
    }
    const flowActionDefinitions = [
        {
            id: "presentText",
            name: "Present Text",
            category: "input",
            canCompleteFromStage: true,
            stageActionType: "present",
            stageRunner: "displayText",
            normalize: (action, base, context) => ({
                ...normalizeTextAction(action, base, context, "Presented text"),
                stageClickTargetActionId: context.flowActionTarget(action?.stageClickTargetActionId)
            }),
            toPublic: (action, base, context) => ({
                ...publicTextAction(action, base, context, "present"),
                stageClickTargetActionId: action.stageClickTargetActionId || ""
            })
        },
        {
            id: "multipleChoiceInput",
            name: "Multiple Choice Input",
            category: "input",
            canCompleteFromStage: true,
            completionCleanup: "choice",
            stageActionType: "multipleChoiceInput",
            normalize: (action, base, context) => ({
                ...base,
                prompt: context.cleanFlowText(action?.prompt, "Answer this question by tapping an answer"),
                options: context.cleanChoiceOptions(action?.options),
                inputMode: context.normalizeChoiceInputMode(action?.inputMode),
                locked: action?.locked === true,
                timerEndTargetActionId: context.flowActionTarget(action?.timerEndTargetActionId),
                answersSubmittedTargetActionId: context.flowActionTarget(action?.answersSubmittedTargetActionId)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "multipleChoiceInput",
                prompt: action.prompt || "Answer this question by tapping an answer",
                options: context.cleanChoiceOptions(action.options),
                inputMode: context.normalizeChoiceInputMode(action.inputMode),
                locked: action.locked === true,
                timerEndTargetActionId: action.timerEndTargetActionId || "",
                answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
            })
        },
        {
            id: "triviaInput",
            name: "Trivia Input",
            category: "input",
            canCompleteFromStage: true,
            completionCleanup: "choice",
            stageActionType: "triviaInput",
            normalize: (action, base, context) => ({
                ...base,
                contentVariable: context.normalizeFlowVariableName(action?.contentVariable),
                inputMode: context.normalizeChoiceInputMode(action?.inputMode),
                locked: action?.locked === true,
                randomizeOptions: action?.randomizeOptions === true,
                timerEndTargetActionId: context.flowActionTarget(action?.timerEndTargetActionId),
                answersSubmittedTargetActionId: context.flowActionTarget(action?.answersSubmittedTargetActionId)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "triviaInput",
                contentVariable: context.normalizeFlowVariableName(action.contentVariable),
                inputMode: context.normalizeChoiceInputMode(action.inputMode),
                locked: action.locked === true,
                randomizeOptions: action.randomizeOptions === true,
                timerEndTargetActionId: action.timerEndTargetActionId || "",
                answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
            })
        },
        submissionInputDefinition({
            id: "textSubmissionInput",
            name: "Text Submission Input",
            prompt: "Write your answer",
            placeholder: "Answer here"
        }),
        submissionInputDefinition({
            id: "voiceSubmissionInput",
            name: "Voice Submission Input",
            prompt: "Say your answer",
            placeholder: "Speak your answer"
        }),
        {
            id: "requestMicrophoneAccessInput",
            name: "Request Microphone Access",
            category: "input",
            canCompleteFromStage: true,
            completionCleanup: "microphone",
            stageActionType: "requestMicrophoneAccessInput",
            normalize: (action, base, context) => {
                const config = microphoneAccessActions?.microphoneAccessActionConfig?.("requestMicrophoneAccessInput") || {};
                return {
                    ...base,
                    prompt: context.cleanFlowText(action?.prompt, config.prompt || "Give microphone access to the game"),
                    buttonLabel: context.cleanFlowText(action?.buttonLabel, config.buttonLabel || "Yes"),
                    microphoneAccessMode: microphoneAccessActions?.normalizeMicrophoneAccessMode?.(action?.microphoneAccessMode) || "vip",
                    microphoneAccessGrantedTargetActionId: context.flowActionTarget(action?.microphoneAccessGrantedTargetActionId)
                };
            },
            toPublic: (action, base, context) => {
                const config = microphoneAccessActions?.microphoneAccessActionConfig?.("requestMicrophoneAccessInput") || {};
                return {
                    ...base,
                    type: "requestMicrophoneAccessInput",
                    prompt: action.prompt || config.prompt || "Give microphone access to the game",
                    buttonLabel: action.buttonLabel || config.buttonLabel || "Yes",
                    microphoneAccessMode: microphoneAccessActions?.normalizeMicrophoneAccessMode?.(action.microphoneAccessMode) || "vip",
                    microphoneAccessGrantedTargetActionId: context.flowActionTarget(action.microphoneAccessGrantedTargetActionId)
                };
            }
        },
        {
            id: "doNothing",
            name: "Do Nothing",
            category: "standard",
            ...identityAction("doNothing"),
            stageRunner: "immediateComplete"
        },
        {
            id: "labelNode",
            name: "Label Node",
            category: "standard",
            canCompleteFromStage: true,
            primaryOnly: true,
            stageActionType: "labelNode",
            stageRunner: "immediateComplete",
            normalize: (action, base, context) => ({
                ...base,
                labelText: context.cleanFlowText(action?.labelText || action?.text, "Flow note"),
                timing: { mode: "E+", seconds: 0 },
                subActions: []
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "labelNode",
                labelText: context.cleanFlowText(action.labelText || action.text, "Flow note"),
                timing: { mode: "E+", seconds: 0 },
                subActions: []
            })
        },
        {
            id: "codeNode",
            name: "Code Node",
            category: "standard",
            canCompleteFromStage: true,
            primaryOnly: true,
            stageActionType: "codeNode",
            stageRunner: "serverEffect",
            normalize: (action, base, context) => ({
                ...base,
                code: context.cleanFlowText(action?.code, "g.example = true"),
                timing: { mode: "E+", seconds: 0 },
                subActions: []
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "codeNode",
                code: context.cleanFlowText(action.code, "g.example = true"),
                timing: { mode: "E+", seconds: 0 },
                subActions: []
            }),
            applyRoomEffect: (room, action, context) => {
                context.applyDynamicGameStateCode?.(room, action.code || "");
            }
        },
        {
            id: "subroutine",
            name: "Subroutine",
            category: "standard",
            canCompleteFromStage: true,
            primaryOnly: true,
            stageActionType: "subroutine",
            stageRunner: "immediateComplete",
            normalize: (action, base, context) => ({
                ...base,
                timing: { mode: "E+", seconds: 0 },
                entryTargetActionId: context.flowActionTarget(action?.entryTargetActionId),
                nextTargetActionId: context.flowActionTarget(action?.nextTargetActionId),
                subActions: []
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "subroutine",
                timing: { mode: "E+", seconds: 0 },
                entryTargetActionId: context.flowActionTarget(action.entryTargetActionId),
                nextTargetActionId: context.flowActionTarget(action.nextTargetActionId),
                subActions: []
            })
        },
        {
            id: "jumpNode",
            name: "Jump Node",
            category: "standard",
            canCompleteFromStage: true,
            primaryOnly: true,
            stageActionType: "jumpNode",
            stageRunner: "immediateComplete",
            normalize: (action, base, context) => ({
                ...base,
                timing: { mode: "E+", seconds: 0 },
                nextTargetActionId: "",
                jumpTargetActionId: context.flowActionTarget(action?.jumpTargetActionId || "none"),
                subActions: []
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "jumpNode",
                timing: { mode: "E+", seconds: 0 },
                nextTargetActionId: "",
                jumpTargetActionId: context.flowActionTarget(action.jumpTargetActionId || "none"),
                subActions: []
            })
        },
        {
            id: "playAudio",
            name: "Play Audio",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "playAudio",
            stageRunner: "playAudio",
            normalize: (action, base, context) => ({
                ...base,
                audioUrl: context.cleanFlowText(action?.audioUrl, "")
            }),
            toPublic: (action, base) => ({
                ...base,
                type: "playAudio",
                audioUrl: action.audioUrl || ""
            })
        },
        {
            id: "playHostAudio",
            name: "Play Host Audio",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "playHostAudio",
            stageRunner: "playAudio",
            normalize: (action, base, context) => ({
                ...base,
                hostAudioId: context.normalizeFlowId(action?.hostAudioId, ""),
                playMode: context.normalizeHostAudioPlayMode(action?.playMode),
                lineIndex: context.normalizeLineIndex(action?.lineIndex)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "playHostAudio",
                hostAudioId: action.hostAudioId || "",
                playMode: context.normalizeHostAudioPlayMode(action.playMode),
                lineIndex: context.normalizeLineIndex(action.lineIndex),
                audioUrl: ""
            })
        },
        {
            id: "getRandomMultipleChoiceContent",
            name: "Get Random Multiple Choice Content",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "getRandomMultipleChoiceContent",
            stageRunner: "serverEffect",
            normalize: (action, base, context) => ({
                ...base,
                variableName: context.normalizeFlowVariableName(action?.variableName)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "getRandomMultipleChoiceContent",
                variableName: context.normalizeFlowVariableName(action.variableName)
            }),
            applyRoomEffect: (room, action, context) => {
                context.storeRandomTriviaPrompt(room, action.variableName);
            }
        },
        {
            id: "prepareVotingCards",
            name: "Prepare Voting Cards",
            category: "standard",
            ...identityAction("prepareVotingCards"),
            stageRunner: "serverEffect",
            applyRoomEffect: (room, action, context) => {
                context.prepareVotingCards(room);
            }
        },
        {
            id: "setVotingCardsShown",
            name: "Set Voting Cards Shown",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setVotingCardsShown",
            stageRunner: "serverEffect",
            normalize: (action, base, context) => ({
                ...base,
                isShown: action?.isShown !== false,
                instant: action?.instant === true,
                cardFilter: context.normalizeVotingCardFilter(action?.cardFilter)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "setVotingCardsShown",
                isShown: action.isShown !== false,
                instant: action.instant === true,
                cardFilter: context.normalizeVotingCardFilter(action.cardFilter)
            }),
            applyRoomEffect: (room, action, context) => {
                context.setVotingCardsShown(room, action);
            }
        },
        {
            id: "voteOnAnswersInput",
            name: "Vote On Answers Input",
            category: "input",
            canCompleteFromStage: true,
            stageActionType: "voteOnAnswersInput",
            normalize: (action, base, context) => ({
                ...base,
                prompt: context.cleanFlowText(action?.prompt, "Vote for your favorite answer"),
                inputMode: "submitOnce",
                timerEndTargetActionId: context.flowActionTarget(action?.timerEndTargetActionId),
                answersSubmittedTargetActionId: context.flowActionTarget(action?.answersSubmittedTargetActionId)
            }),
            toPublic: (action, base) => ({
                ...base,
                type: "voteOnAnswersInput",
                prompt: action.prompt || "Vote for your favorite answer",
                inputMode: "submitOnce",
                timerEndTargetActionId: action.timerEndTargetActionId || "",
                answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
            })
        },
        {
            id: "revealVotingResults",
            name: "Reveal Voting Results",
            category: "standard",
            ...identityAction("revealVotingResults"),
            stageRunner: "votingReveal",
            applyRoomEffect: (room, action, context) => {
                context.revealVotingResults(room);
            }
        },
        {
            id: "revealAuthors",
            name: "Reveal Authors",
            category: "standard",
            ...identityAction("revealAuthors"),
            stageRunner: "votingReveal",
            applyRoomEffect: (room, action, context) => {
                context.revealAuthors(room);
            }
        },
        {
            id: "revealVotes",
            name: "Reveal Votes",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "revealVotes",
            stageRunner: "votingReveal",
            normalize: (action, base) => ({
                ...base,
                voteRevealStaggerSeconds: normalizeVoteRevealStaggerSeconds(action?.voteRevealStaggerSeconds)
            }),
            toPublic: (action, base) => ({
                ...base,
                type: "revealVotes",
                voteRevealStaggerSeconds: normalizeVoteRevealStaggerSeconds(action.voteRevealStaggerSeconds)
            }),
            applyRoomEffect: (room, action, context) => {
                context.revealVotes(room);
            }
        },
        {
            id: "revealWinningAnswer",
            name: "Reveal Winning Answer",
            category: "standard",
            ...identityAction("revealWinningAnswer"),
            stageRunner: "votingReveal",
            applyRoomEffect: (room, action, context) => {
                context.revealWinningAnswer(room);
            }
        },
        {
            id: "setupGame",
            name: "Setup Game",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setupGame",
            stageRunner: "serverEffect",
            applyRoomEffect: (room) => {
                for (const player of room.players.values()) {
                    player.points = 0;
                    player.pendingPoints = 0;
                }
                room.currentRound = 0;
                room.flowVariables = {};
                room.G = {};
                room.pendingPointPopups = [];
                room.pendingPointPopupNonce = 0;
                room.playerAnswerRecords = {};
                room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
                room.storedPlayerAnswers = {};
                room.votingCards = [];
                room.votingCardsShown = false;
                room.votingResultsShown = false;
                room.votingAuthorsRevealed = false;
                room.votingVotesRevealed = false;
                room.votingWinnerRevealed = false;
                room.votingWinners = [];
                room.playersShown = false;
                room.playerAnswersShown = false;
                room.hiddenPlayerAnswerIds = new Set();
                room.displayedPlayerAnswers = new Map();
                room.displayedAnswerCorrectness = new Map();
            }
        },
        {
            id: "getPlayerAnswers",
            name: "Get Player Answers",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "getPlayerAnswers",
            stageRunner: "serverEffect",
            applyRoomEffect: (room, action, context) => {
                const inputId = String(action.inputId || "input").trim() || "input";
                const round = context.resolveStoredAnswerRound(room, action.round);
                const varName = String(action.variableName || "playerAnswers").trim() || "playerAnswers";
                const records = room.storedPlayerAnswers?.[round]?.[inputId] || {};
                room.flowVariables = room.flowVariables || {};
                room.flowVariables[varName] = Object.entries(records).map(([playerId, rec]) => ({
                    playerId,
                    ...(rec && typeof rec === "object" ? rec : { text: String(rec || "") })
                }));
            }
        },
        {
            id: "displayText",
            name: "Display Text",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "displayText",
            stageRunner: "displayText",
            normalize: (action, base, context) => normalizeTextAction(action, base, context, "Displayed text"),
            toPublic: (action, base, context) => publicTextAction(action, base, context, "displayText")
        },
        {
            id: "setPlayersShown",
            name: "Set Players Shown",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setPlayersShown",
            stageRunner: "setPlayersShown",
            normalize: (action, base) => ({
                ...base,
                isShown: action?.isShown !== false,
                instant: action?.instant === true
            }),
            toPublic: (action, base) => ({
                ...base,
                type: "setPlayersShown",
                isShown: action.isShown !== false,
                instant: action.instant === true
            }),
            applyRoomEffect: (room, action) => {
                room.playersShown = action.isShown !== false;
            }
        },
        {
            id: "setPlayerAnswersShown",
            name: "Set Player Answers Shown",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setPlayerAnswersShown",
            stageRunner: "setPlayerAnswersShown",
            normalize: (action, base, context) => ({
                ...base,
                isShown: action?.isShown !== false,
                instant: action?.instant === true,
                playerFilter: context.normalizePlayerFilter(action?.playerFilter)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "setPlayerAnswersShown",
                isShown: action.isShown !== false,
                instant: action.instant === true,
                playerFilter: context.normalizePlayerFilter(action.playerFilter)
            }),
            applyRoomEffect: (room, action, context) => {
                const shouldShow = action.isShown !== false;
                const filter = context.normalizePlayerFilter(action.playerFilter);
                const targetPlayerIds = shouldShow && filter === "all"
                    ? context.activePlayers(room).map((player) => player.id)
                    : context.filteredPlayerIds(room, filter);
                if (shouldShow)
                    context.seedDisplayedPlayerAnswers(room, targetPlayerIds);
                room.playerAnswersVisibleFilter = filter;
                room.hiddenPlayerAnswerIds = room.hiddenPlayerAnswerIds instanceof Set ? room.hiddenPlayerAnswerIds : new Set();
                if (filter === "all") {
                    room.playerAnswersShown = shouldShow;
                    if (shouldShow)
                        room.hiddenPlayerAnswerIds.clear();
                    else {
                        context.clearDisplayedCorrectnessForPlayers(room, targetPlayerIds);
                        for (const playerId of targetPlayerIds)
                            room.hiddenPlayerAnswerIds.add(playerId);
                    }
                }
                else {
                    room.playerAnswersShown = true;
                    if (!shouldShow)
                        context.clearDisplayedCorrectnessForPlayers(room, targetPlayerIds);
                    for (const playerId of targetPlayerIds) {
                        if (shouldShow)
                            room.hiddenPlayerAnswerIds.delete(playerId);
                        else
                            room.hiddenPlayerAnswerIds.add(playerId);
                    }
                }
            }
        },
        {
            id: "setGameObjectShown",
            name: "Set Game Object Shown",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setGameObjectShown",
            stageRunner: "setGameObjectShown",
            normalize: (action, base, context) => ({
                ...base,
                targetLayoutElementId: context.normalizeFlowId(action?.targetLayoutElementId, ""),
                targetLayoutScope: normalizeLayoutTargetScope(action?.targetLayoutScope),
                targetLayoutSurface: normalizeLayoutTargetSurface(action?.targetLayoutSurface),
                isShown: action?.isShown !== false,
                instant: action?.instant === true
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "setGameObjectShown",
                targetLayoutElementId: context.normalizeFlowId(action.targetLayoutElementId, ""),
                targetLayoutScope: normalizeLayoutTargetScope(action.targetLayoutScope),
                targetLayoutSurface: normalizeLayoutTargetSurface(action.targetLayoutSurface),
                isShown: action.isShown !== false,
                instant: action.instant === true
            })
        },
        {
            id: "playGameObjectAnimation",
            name: "Play Game Object Animation",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "playGameObjectAnimation",
            stageRunner: "playGameObjectAnimation",
            normalize: (action, base, context) => ({
                ...base,
                targetLayoutElementId: context.normalizeFlowId(action?.targetLayoutElementId, ""),
                targetLayoutScope: normalizeLayoutTargetScope(action?.targetLayoutScope),
                targetLayoutSurface: normalizeLayoutTargetSurface(action?.targetLayoutSurface),
                animationName: context.cleanFlowText(action?.animationName || action?.timelineLabel || action?.animation, "appear"),
                instant: action?.instant === true
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "playGameObjectAnimation",
                targetLayoutElementId: context.normalizeFlowId(action.targetLayoutElementId, ""),
                targetLayoutScope: normalizeLayoutTargetScope(action.targetLayoutScope),
                targetLayoutSurface: normalizeLayoutTargetSurface(action.targetLayoutSurface),
                animationName: context.cleanFlowText(action.animationName || action.timelineLabel || action.animation, "appear"),
                instant: action.instant === true
            })
        },
        {
            id: "setArtAssetShown",
            name: "Set Art Asset Shown (Deprecated)",
            category: "standard",
            canCompleteFromStage: true,
            deprecated: true,
            stageActionType: "setArtAssetShown",
            stageRunner: "setGameObjectShown",
            normalize: (action, base, context) => ({
                ...base,
                type: "setGameObjectShown",
                targetLayoutElementId: context.normalizeFlowId(action?.targetLayoutElementId, ""),
                targetLayoutScope: normalizeLayoutTargetScope(action?.targetLayoutScope),
                targetLayoutSurface: normalizeLayoutTargetSurface(action?.targetLayoutSurface),
                isShown: action?.isShown !== false,
                instant: action?.instant === true
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "setGameObjectShown",
                targetLayoutElementId: context.normalizeFlowId(action.targetLayoutElementId, ""),
                targetLayoutScope: normalizeLayoutTargetScope(action.targetLayoutScope),
                targetLayoutSurface: normalizeLayoutTargetSurface(action.targetLayoutSurface),
                isShown: action.isShown !== false,
                instant: action.instant === true
            })
        },
        {
            id: "revealPlayerAnswerCorrectness",
            name: "Reveal Player Answer Correctness",
            category: "standard",
            ...identityAction("revealPlayerAnswerCorrectness"),
            stageRunner: "delayedComplete",
            stageRunnerDelayMs: 250,
            applyRoomEffect: (room, action, context) => {
                context.markDisplayedAnswersCorrectness(room);
            }
        },
        {
            id: "showPoints",
            name: "Show Points",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "showPoints",
            stageRunner: "delayedComplete",
            stageRunnerDelayMs: 1500,
            normalize: (action, base, context) => ({
                ...base,
                playerFilter: context.normalizePlayerFilter(action?.playerFilter || "correct"),
                points: context.normalizeConstantInteger(action?.points, 0, 0, 999999)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "showPoints",
                playerFilter: context.normalizePlayerFilter(action.playerFilter || "correct"),
                points: context.normalizeConstantInteger(action.points, 0, 0, 999999)
            }),
            applyRoomEffect: (room, action, context) => {
                const playerIds = context.filteredPlayerIds(room, action.playerFilter);
                const points = Number(action.points || 0) > 0 ? Number(action.points) : context.gameConstants().pointsForCorrectAnswer;
                room.pendingPointPopupNonce = Number(room.pendingPointPopupNonce || 0) + 1;
                const nonce = room.pendingPointPopupNonce;
                room.pendingPointPopups = playerIds.map((playerId, index) => {
                    const player = room.players.get(playerId);
                    if (player)
                        player.pendingPoints = Number(player.pendingPoints || 0) + points;
                    return { id: `${nonce}-${playerId}`, nonce, playerId, points, index, createdAt: Date.now() };
                });
            }
        },
        {
            id: "givePendingPoints",
            name: "Give Pending Points",
            category: "standard",
            ...identityAction("givePendingPoints"),
            stageRunner: "serverEffect",
            applyRoomEffect: (room) => {
                for (const player of room.players.values()) {
                    const pending = Number(player.pendingPoints || 0);
                    if (pending > 0) {
                        player.points = Number(player.points || 0) + pending;
                        player.pendingPoints = 0;
                    }
                }
            }
        },
        {
            id: "setTimerShown",
            name: "Set Timer Shown",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setTimerShown",
            stageRunner: "setTimerShown",
            normalize: (action, base) => ({
                ...base,
                isShown: action?.isShown !== false,
                instant: action?.instant === true
            }),
            toPublic: (action, base) => ({
                ...base,
                type: "setTimerShown",
                isShown: action.isShown !== false,
                instant: action.instant === true
            }),
            applyRoomEffect: (room, action, context) => {
                context.setCraftingTimerShown(room, action.isShown !== false);
            }
        },
        {
            id: "setWipeShown",
            name: "Set Wipe Shown",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setWipeShown",
            stageRunner: "setWipeShown",
            normalize: (action, base) => ({
                ...base,
                isShown: action?.isShown !== false,
                instant: action?.instant === true
            }),
            toPublic: (action, base) => ({
                ...base,
                type: "setWipeShown",
                isShown: action.isShown !== false,
                instant: action.instant === true
            }),
            applyRoomEffect: (room, action) => {
                room.wipeShown = action.isShown !== false;
            }
        },
        {
            id: "setControllerLayout",
            name: "Set Controller Layout",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "setControllerLayout",
            stageRunner: "serverEffect",
            normalize: (action, base, context) => ({
                ...base,
                controllerLayoutId: context.normalizeFlowId(action?.controllerLayoutId, "")
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "setControllerLayout",
                controllerLayoutId: context.normalizeFlowId(action.controllerLayoutId, "")
            }),
            applyRoomEffect: (room, action) => {
                room.controllerLayoutId = action.controllerLayoutId || room.phase || "";
            }
        },
        {
            id: "startCraftingTimer",
            name: "Start Crafting Timer",
            category: "standard",
            ...identityAction("startCraftingTimer"),
            stageRunner: "serverEffect",
            applyRoomEffect: (room, action, context) => {
                context.startCraftingTimer(room, action);
            }
        },
        {
            id: "decision",
            name: "Decision",
            category: "standard",
            normalize: (action, base, context) => ({
                ...base,
                variable: context.cleanFlowText(action?.variable, "activePlayerCount"),
                valueType: context.normalizeDecisionValueType(action?.valueType),
                branches: context.normalizeDecisionBranches(action)
            }),
            toPublic: (action, base, context) => ({
                ...base,
                type: "decision",
                variable: action.variable || "activePlayerCount",
                valueType: context.normalizeDecisionValueType(action.valueType),
                branches: context.normalizeDecisionBranches(action)
            })
        },
        {
            id: "transition",
            name: "Do Transition (Deprecated)",
            category: "standard",
            canCompleteFromStage: true,
            deprecated: true,
            stageActionType: "transition",
            stageRunner: "transition",
            normalize: (action, base, context) => {
                const transition = context.availableFlowTransitions.some((item) => item.id === action?.transition)
                    ? action.transition
                    : "horizontalWipe";
                return { ...base, transition };
            },
            toPublic: (action, base, context) => {
                const transition = context.availableFlowTransitions.find((item) => item.id === action.transition)
                    || context.availableFlowTransitions[0];
                return { ...base, type: "transition", transition: transition.id, transitionName: transition.name };
            }
        },
        {
            id: "transitionState",
            name: "Transition To State",
            category: "standard",
            canCompleteFromStage: true,
            stageActionType: "transitionState",
            stageRunner: "immediateComplete",
            normalize: (action, base, context) => ({
                ...base,
                trigger: action?.trigger === "onCountdownComplete" ? "onCountdownComplete" : "",
                targetState: context.normalizeFlowId(action?.targetState, "intro")
            }),
            toPublic: (action, base) => ({
                ...base,
                type: "transitionState",
                targetState: action.targetState,
                trigger: action.trigger || ""
            })
        }
    ];
    const availableFlowActionTypes = flowActionDefinitions.map(({ id, name, category, deprecated, primaryOnly }) => ({
        id,
        name,
        category,
        deprecated: deprecated === true,
        primaryOnly: primaryOnly === true
    }));
    const definitionById = new Map(flowActionDefinitions.map((definition) => [definition.id, definition]));
    const definitionByStageActionType = new Map(flowActionDefinitions.map((definition) => [definition.stageActionType || definition.id, definition]));
    const completableStageActionTypes = new Set(flowActionDefinitions
        .filter((definition) => definition.canCompleteFromStage)
        .map((definition) => definition.stageActionType || definition.id));
    const stageActionRunnerDefinitions = flowActionDefinitions
        .filter((definition) => definition.stageRunner)
        .map((definition) => ({
        actionId: definition.id,
        type: definition.stageActionType || definition.id,
        runner: definition.stageRunner,
        delayMs: Math.max(0, Number(definition.stageRunnerDelayMs || 0))
    }));
    function fallbackNormalizeAction(action, base, context) {
        return normalizeTextAction(action, base, context, "Text");
    }
    function fallbackPublicAction(action, base, context) {
        return publicTextAction(action, base, context, "displayText");
    }
    function createFlowActionRegistry(context) {
        function hasActionType(type) {
            return definitionById.has(type);
        }
        function actionTypeMeta(type) {
            return availableFlowActionTypes.find((item) => item.id === type) || availableFlowActionTypes[0];
        }
        function normalizeAction(type, action, base) {
            const definition = definitionById.get(type);
            const normalize = definition?.normalize || fallbackNormalizeAction;
            return normalize(action, base, context);
        }
        function publicAction(action, base) {
            const definition = definitionById.get(action?.type);
            const toPublic = definition?.toPublic || fallbackPublicAction;
            return toPublic(action, base, context);
        }
        function applyRoomEffect(room, action) {
            const definition = definitionById.get(action?.type);
            if (!definition?.applyRoomEffect)
                return false;
            definition.applyRoomEffect(room, action, context);
            return true;
        }
        return {
            applyRoomEffect,
            actionTypeMeta,
            hasActionType,
            normalizeAction,
            publicAction
        };
    }
    function isCompletableStageActionType(type) {
        return completableStageActionTypes.has(type);
    }
    function stageCompletionCleanupForActionType(type) {
        return definitionByStageActionType.get(type)?.completionCleanup || "";
    }
    const exportedRegistry = {
        availableFlowActionTypes,
        completableStageActionTypes,
        createFlowActionRegistry,
        flowActionDefinitions,
        isCompletableStageActionType,
        normalizeVoteRevealStaggerSeconds,
        stageActionRunnerDefinitions,
        stageCompletionCleanupForActionType
    };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = exportedRegistry;
    }
    if (typeof window !== "undefined") {
        window.PartyGameFlowActionRegistry = exportedRegistry;
    }
}
