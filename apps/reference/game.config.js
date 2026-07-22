"use strict";

const { defineGame } = require("@pop-party/engine/game");
const { defineGamePlugin } = require("@pop-party/engine/plugin");
const gameData = require("../../shared/game-data");

const referencePlugin = defineGamePlugin({
  namespace: "reference",
  register() {
    // The compatibility game has no custom registrations yet. Moving current
    // behavior behind this boundary precedes extracting engine-owned modules.
  }
});

module.exports = defineGame({
  gameId: "pop-party-reference",
  displayName: "Pop Party Engine Reference",
  version: "1.0.17",
  engineCompatibility: "monolith-1.0.17",
  content: {
    mode: "legacy-monolith",
    schemaVersion: 0
  },
  gameData,
  plugin: referencePlugin,
  semanticRoles: {}
});
