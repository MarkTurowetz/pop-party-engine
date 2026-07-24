"use strict";

const { createGameApplicationComposition } = require("./game-application-composition");

function publicRuntimeMetadata(gameDefinition, active) {
  return Object.freeze({
    game: Object.freeze({
      id: gameDefinition.gameId,
      displayName: gameDefinition.displayName,
      version: gameDefinition.version,
      pluginNamespace: gameDefinition.plugin.namespace
    }),
    release: Object.freeze({ ...active.release })
  });
}

function createGameApplicationRuntime(options = {}) {
  if (!options.gameDefinition) throw new Error("Game application requires a defined game");
  let composition = null;
  let state = Object.freeze({ status: "pending", diagnostic: null, release: null });

  async function start() {
    if (state.status === "running") return composition.startup;
    state = Object.freeze({ status: "starting", diagnostic: null, release: null });
    try {
      composition = await createGameApplicationComposition(options);
      const startup = await composition.start();
      state = Object.freeze({
        status: "running",
        diagnostic: null,
        release: composition.active.release
      });
      return startup;
    } catch (error) {
      composition = null;
      state = Object.freeze({
        status: "failed",
        diagnostic: Object.freeze({
          code: String(error?.code || "GAME_APPLICATION_START_FAILED"),
          message: String(error?.message || error)
        }),
        release: null
      });
      throw error;
    }
  }

  async function stop() {
    if (composition) await composition.stop();
    composition = null;
    state = Object.freeze({ status: "stopped", diagnostic: null, release: null });
  }

  return Object.freeze({
    start,
    stop,
    get active() {
      return composition?.active || null;
    },
    get lifecycle() {
      return composition?.lifecycle || state;
    },
    get server() {
      return composition?.server || null;
    },
    get startup() {
      return composition?.startup || null;
    },
    get state() {
      return state;
    }
  });
}

module.exports = Object.freeze({
  createGameApplicationRuntime,
  publicRuntimeMetadata
});
