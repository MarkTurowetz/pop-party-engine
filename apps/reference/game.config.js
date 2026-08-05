"use strict";

const { defineGame } = require("@pop-party/engine/game");
const { defineGamePlugin } = require("@pop-party/engine/plugin");
const semanticRoles = require("./semantic-roles");

const REFERENCE_AVATARS = Object.freeze([
  Object.freeze({ id: "rex", label: "Rex", state: "Rex" }),
  Object.freeze({ id: "stego", label: "Stego", state: "Stego" }),
  Object.freeze({ id: "trike", label: "Trike", state: "Trike" }),
  Object.freeze({ id: "raptor", label: "Raptor", state: "Raptor" }),
  Object.freeze({ id: "bronto", label: "Bronto", state: "Bronto" }),
  Object.freeze({ id: "cleo", label: "Cleo", state: "Cleo" })
]);
const REFERENCE_PLAYER_COLORS = Object.freeze([
  "#e3c6eb",
  "#60d394",
  "#ffe156",
  "#ff9e2c",
  "#ff4fa3",
  "#7c3aed",
  "#2458ff",
  "#ef4444",
  "#f97316"
]);
const REFERENCE_AVATAR_BY_ID = new Map(REFERENCE_AVATARS.map((avatar) => [avatar.id, avatar]));

function defaultAvatarForPlayer(playerId) {
  let hash = 2166136261;
  for (const character of String(playerId || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return REFERENCE_AVATARS[hash % REFERENCE_AVATARS.length];
}

function selectedAvatar(playerId, profile = {}) {
  return REFERENCE_AVATAR_BY_ID.get(String(profile.avatarId || "")) || defaultAvatarForPlayer(playerId);
}

function playerColor(players, playerId) {
  const index = Math.max(0, players.findIndex((player) => player.id === playerId));
  return REFERENCE_PLAYER_COLORS[index % REFERENCE_PLAYER_COLORS.length];
}

function answerPresentation(displayedAnswer) {
  if (!displayedAnswer) {
    return { answerText: "", answerSemanticState: "Default", answerLifecycleState: "Off" };
  }
  if (displayedAnswer.hidden === true) {
    return {
      answerText: String(displayedAnswer.text || ""),
      // The semantic leaf must keep its authored correctness color while the
      // lifecycle wrapper plays Disappear. Default is selected only after the
      // displayed answer is removed and the wrapper is safely Off.
      answerSemanticState: displayedAnswer.correct === true
        ? "Correct"
        : displayedAnswer.correct === false
          ? "Incorrect"
          : "Default",
      answerLifecycleState: "Disappear"
    };
  }
  return {
    answerText: String(displayedAnswer.text || ""),
    answerSemanticState: displayedAnswer.correct === true
      ? "Correct"
      : displayedAnswer.correct === false
        ? "Incorrect"
        : "Default",
    answerLifecycleState: displayedAnswer.correct === true || displayedAnswer.correct === false
      ? "Update"
      : "Appear"
  };
}

function referencePlayerModel(player, players, profiles) {
  const avatar = selectedAvatar(player.id, profiles[player.id]);
  const answer = answerPresentation(player.displayedAnswer);
  const pendingPoints = Math.max(0, Number(player.pendingPoints || 0));
  return {
    id: player.id,
    name: player.name,
    widgetLifecycleState: "On",
    avatarState: avatar.state,
    avatarColor: playerColor(players, player.id),
    avatarLifecycleState: "On",
    inputState: player.needsInput ? "ChoosingStart" : "ChoosingEnd",
    nameLifecycleState: "On",
    vipLifecycleState: player.isVip ? "On" : "Off",
    ...answer,
    pointLabel: pendingPoints > 0 ? `+${pendingPoints}` : "",
    pointPopupState: pendingPoints > 0 ? "Popup" : "Off"
  };
}

function avatarChoiceBindings() {
  return REFERENCE_AVATARS.map((avatar, index) => ({
    id: `choose${avatar.state}`,
    kind: "choice",
    layoutElementId: `reference-avatar-${avatar.id}`,
    field: "avatarId",
    optionIndex: index,
    interactionTargetComponentId: "controller-avatar-button-interaction-ref",
    autoSubmit: false
  }));
}

const referencePlugin = defineGamePlugin({
  namespace: "reference",
  register(registry) {
    registry.stageRenderers("reference.players", {
      name: "Reference player presentation",
      target: {
        kind: "layout",
        layoutElementId: "gameplayerpresentation",
        layoutScope: "global"
      },
      bindings: [{
        id: "players",
        kind: "collection",
        source: "players",
        item: {
          keySource: "id",
          artCompositionId: "prefab-player-widget-mc",
          bindings: [
            {
              id: "widgetLifecycle",
              kind: "state",
              source: "widgetLifecycleState",
              playback: "stop"
            },
            {
              id: "name",
              kind: "text",
              source: "name",
              targetComponentId: "nameText"
            },
            {
              id: "avatar",
              kind: "state",
              source: "avatarState",
              targetComponentId: "avatar",
              playback: "stop"
            },
            {
              id: "avatarColor",
              kind: "component",
              source: "avatarColor",
              targetComponentId: "avatar-sprite",
              property: "imageTint"
            },
            {
              id: "avatarLifecycle",
              kind: "state",
              source: "avatarLifecycleState",
              targetComponentId: "player-avatar-mc",
              playback: "stop"
            },
            {
              id: "inputStatus",
              kind: "state",
              source: "inputState",
              targetComponentId: "player-avatar-behaviors"
            },
            {
              id: "nameLifecycle",
              kind: "state",
              source: "nameLifecycleState",
              targetComponentId: "player-name-mc",
              playback: "stop"
            },
            {
              id: "vipLifecycle",
              kind: "state",
              source: "vipLifecycleState",
              targetComponentId: "vip-mc",
              playback: "stop"
            },
            {
              id: "answerText",
              kind: "text",
              source: "answerText",
              targetComponentId: "answer-text"
            },
            {
              id: "answerSemantic",
              kind: "state",
              source: "answerSemanticState",
              targetComponentId: "playerAnswerBubble",
              playback: "stop"
            },
            {
              id: "answerLifecycle",
              kind: "state",
              source: "answerLifecycleState",
              targetComponentId: "player-answer-bubble-mc"
            },
            {
              id: "pointText",
              kind: "text",
              source: "pointLabel",
              targetComponentId: "point-text"
            },
            {
              id: "pointShadow",
              kind: "text",
              source: "pointLabel",
              targetComponentId: "point-shadow"
            },
            {
              id: "pointPopup",
              kind: "state",
              source: "pointPopupState",
              targetComponentId: "reference-player-point-popup"
            }
          ]
        }
      }],
      select(context) {
        return {
          players: context.players.map((player) => referencePlayerModel(player, context.players, context.profiles))
        };
      }
    });
    registry.controllerRenderers("reference.viewer", {
      name: "Reference controller player presentation",
      target: {
        kind: "layout",
        layoutElementId: "controllerplayerbanner",
        layoutScope: "global"
      },
      bindings: [
        {
          id: "name",
          kind: "text",
          source: "name",
          targetComponentId: "nameText"
        },
        {
          id: "shown",
          kind: "state",
          source: "state"
        },
        {
          id: "avatar",
          kind: "state",
          source: "avatarState",
          targetComponentId: "avatar",
          playback: "stop"
        },
        {
          id: "avatarColor",
          kind: "component",
          source: "avatarColor",
          targetComponentId: "avatar-sprite",
          property: "imageTint"
        },
        {
          id: "avatarLifecycle",
          kind: "state",
          source: "avatarLifecycleState",
          targetComponentId: "player-avatar-mc",
          playback: "stop"
        },
        {
          id: "nameLifecycle",
          kind: "state",
          source: "nameLifecycleState",
          targetComponentId: "player-name-mc",
          playback: "stop"
        }
      ],
      select(context) {
        if (!context.viewer) return { name: "", state: "Off" };
        const avatar = selectedAvatar(context.viewer.id, context.profile);
        return {
          name: context.viewer.name,
          state: "On",
          avatarState: avatar.state,
          avatarColor: playerColor(context.players, context.viewer.id),
          avatarLifecycleState: "On",
          nameLifecycleState: "On"
        };
      }
    });
    registry.controllerInteractions("reference.avatarProfile", {
      name: "Reference avatar profile",
      profileField: "avatarId",
      visibility: "public",
      submission: [{
        id: "avatarId",
        type: "choice",
        optionsSource: "options",
        options: REFERENCE_AVATARS.map((avatar) => ({ id: avatar.id }))
      }],
      controller: {
        layoutScope: "layer",
        layoutLayerId: "reference-avatar-picker",
        disclosure: {
          triggerLayoutElementId: "controllerplayerbanner",
          triggerLayoutScope: "global",
          ariaLabel: "Choose avatar"
        },
        bindings: [
          ...avatarChoiceBindings(),
          {
            id: "saveAvatar",
            kind: "submit",
            layoutElementId: "reference-avatar-done",
            labelSource: "doneLabel"
          }
        ]
      },
      available(context) {
        return context.viewer.active && context.phase === "lobby";
      },
      view(context) {
        const avatar = selectedAvatar(context.viewer.id, context.profile);
        return {
          avatarId: avatar.id,
          doneLabel: "Done",
          options: REFERENCE_AVATARS.map((option) => ({ id: option.id, label: option.label }))
        };
      },
      submit(context, payload) {
        context.profile.set(payload.avatarId);
        context.broadcast.request();
      }
    });
  }
});

module.exports = defineGame({
  gameId: "pop-party-reference",
  displayName: "Pop Party Engine Reference",
  version: "1.0.17",
  engineCompatibility: "1.4.6",
  content: {
    mode: "bundle",
    schemaVersion: 1
  },
  plugin: referencePlugin,
  semanticRoles
});
