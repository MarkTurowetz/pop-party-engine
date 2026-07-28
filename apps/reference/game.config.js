"use strict";

const { defineGame } = require("@pop-party/engine/game");
const { defineGamePlugin } = require("@pop-party/engine/plugin");
const semanticRoles = require("./semantic-roles");

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
  engineCompatibility: "1.3.16",
  content: {
    mode: "bundle",
    schemaVersion: 1
  },
  plugin: referencePlugin,
  semanticRoles
});
