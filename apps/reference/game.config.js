"use strict";

const { defineGame } = require("@pop-party/engine/game");
const { defineGamePlugin } = require("@pop-party/engine/plugin");
const semanticRoles = require("./semantic-roles");

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
          artCompositionId: "player-name-widget",
          bindings: [{
            id: "name",
            kind: "text",
            source: "name",
            targetComponentId: "nameText"
          }]
        }
      }],
      select(context) {
        return { players: context.players };
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
