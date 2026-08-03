"use strict";

const { defineGame } = require("@pop-party/engine/game");
const { defineGamePlugin } = require("@pop-party/engine/plugin");
const semanticRoles = require("./semantic-roles");

const REFERENCE_AVATAR_STATES = Object.freeze(["Rex", "Stego", "Trike", "Raptor", "Bronto", "Cleo"]);

function avatarStateForPlayer(playerId) {
  let hash = 2166136261;
  for (const character of String(playerId || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return REFERENCE_AVATAR_STATES[hash % REFERENCE_AVATAR_STATES.length];
}

function referencePlayerModel(player) {
  return {
    id: player.id,
    name: player.name,
    widgetLifecycleState: "On",
    avatarState: avatarStateForPlayer(player.id),
    avatarLifecycleState: "On",
    inputState: player.needsInput ? "ChoosingStart" : "ChoosingEnd",
    nameLifecycleState: "On",
    vipLifecycleState: player.isVip ? "On" : "Off"
  };
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
          artCompositionId: "game-object-reference-player-presentation",
          bindings: [
            {
              id: "widgetLifecycle",
              kind: "state",
              source: "widgetLifecycleState",
              targetComponentId: "playerWidgetMC",
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
            }
          ]
        }
      }],
      select(context) {
        return { players: context.players.map(referencePlayerModel) };
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
        }
      ],
      select(context) {
        return context.viewer
          ? { name: context.viewer.name, state: "On" }
          : { name: "", state: "Off" };
      }
    });
  }
});

module.exports = defineGame({
  gameId: "pop-party-reference",
  displayName: "Pop Party Engine Reference",
  version: "1.0.17",
  engineCompatibility: "1.4.1",
  content: {
    mode: "bundle",
    schemaVersion: 1
  },
  plugin: referencePlugin,
  semanticRoles
});
