"use strict";

const path = require("path");
const enginePackage = require("../../package.json");
const { createLocalContentBundleProvider } = require("../server/local-content-bundle-provider");
const { createGameApplicationRuntime } = require("../server/game-application-runtime");
const { createGameBuild, loadGameDefinition } = require("./game-build-runtime");

const HELP_TEXT = [
  "Usage: pop-party <command>",
  "",
  "Commands:",
  "  validate [content-directory]  Validate a complete local content bundle",
  "  build [game-config]           Validate and write an immutable game build manifest",
  "  start [game-config]           Validate and start the production game service",
  "  dev [game-config]             Validate and start the local game service",
  "",
  "Service options:",
  "  --host <address>              Listening address (default: HOST or 0.0.0.0)",
  "  --port <number>               Listening port (default: PORT or 3000)"
].join("\n");

function serviceArguments(argv, env = process.env) {
  let configPath = "game.config.js";
  let host = String(env.HOST || "0.0.0.0");
  let port = env.PORT === undefined ? 3000 : Number(env.PORT);
  let configSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--host" || value === "--port") {
      if (index + 1 >= argv.length) throw new Error(`${value} requires a value`);
      const next = argv[index + 1];
      if (value === "--host") host = String(next);
      else port = Number(next);
      index += 1;
      continue;
    }
    if (value.startsWith("--host=")) {
      host = value.slice("--host=".length);
      continue;
    }
    if (value.startsWith("--port=")) {
      port = Number(value.slice("--port=".length));
      continue;
    }
    if (value.startsWith("-")) throw new Error(`Unknown service option: ${value}`);
    if (configSeen) throw new Error(`Unexpected service argument: ${value}`);
    configPath = value;
    configSeen = true;
  }
  if (!host.trim()) throw new Error("Service host cannot be empty");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Service port must be an integer from 0 through 65535");
  return Object.freeze({ configPath, host, port });
}

function installShutdownHandlers(runtime, options = {}) {
  const processRuntime = options.processRuntime || process;
  const output = options.output || console;
  let stopping = false;
  async function stop(signal) {
    if (stopping) return;
    stopping = true;
    try {
      await runtime.stop();
      output.log(`Game service stopped (${signal}).`);
    } catch (error) {
      output.error(`Game service stop failed: ${error.message}`);
      processRuntime.exitCode = 1;
    }
  }
  processRuntime.once("SIGINT", () => stop("SIGINT"));
  processRuntime.once("SIGTERM", () => stop("SIGTERM"));
}

async function startGameApplication(options = {}) {
  const loaded = loadGameDefinition(options);
  const runtime = createGameApplicationRuntime({
    gameDefinition: loaded.gameDefinition,
    engineVersion: options.engineVersion,
    contentSchemaVersion: options.contentSchemaVersion || options.engineVersion,
    host: options.host,
    port: options.port,
    onError: options.onError
  });
  const startup = await runtime.start();
  return Object.freeze({ ...loaded, runtime, startup });
}

function validateContentBundle(contentRoot, output = console) {
  const root = path.resolve(contentRoot || "content");
  const snapshot = createLocalContentBundleProvider({ root }).loadPublishedRevision();
  output.log(`Content bundle valid: ${snapshot.manifest.gameId}`);
  output.log(`Revision: ${snapshot.revision}`);
  output.log(`Files: ${snapshot.manifest.files.length}`);
  return snapshot;
}

async function runCli(argv = process.argv.slice(2), options = {}) {
  const output = options.output || console;
  const cwd = path.resolve(options.cwd || process.cwd());
  const [command, argument] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    output.log(HELP_TEXT);
    return 0;
  }
  if (command !== "validate" && command !== "build" && command !== "start" && command !== "dev") {
    output.error(`Unknown pop-party command: ${command}`);
    output.error(HELP_TEXT);
    return 1;
  }
  try {
    if (command === "validate") validateContentBundle(path.resolve(cwd, argument || "content"), output);
    else if (command === "build") {
      const build = await createGameBuild({
        cwd,
        configPath: argument || "game.config.js",
        engineVersion: options.engineVersion || enginePackage.version,
        outputDirectory: options.outputDirectory || "dist"
      });
      output.log(`Game build valid: ${build.manifest.gameId}`);
      output.log(`Content revision: ${build.manifest.contentRevision}`);
      output.log(`Build manifest: ${path.relative(cwd, build.manifestPath)}`);
    } else {
      const service = serviceArguments(argv.slice(1), options.env || process.env);
      const started = await (options.startGameApplication || startGameApplication)({
        configPath: service.configPath,
        cwd,
        engineVersion: options.engineVersion || enginePackage.version,
        host: service.host,
        port: service.port
      });
      output.log(`Game service ready: ${started.startup.localUrl}`);
      for (const url of started.startup.lanUrls) output.log(`LAN: ${url}`);
      if (options.installSignalHandlers !== false) {
        installShutdownHandlers(started.runtime, { output, processRuntime: options.processRuntime });
      }
    }
    return 0;
  } catch (error) {
    const label = command === "validate" ? "Content bundle" : command === "build" ? "Game build" : "Game service";
    output.error(`${label} invalid: ${error.message}`);
    return 1;
  }
}

module.exports = Object.freeze({
  HELP_TEXT,
  installShutdownHandlers,
  runCli,
  serviceArguments,
  startGameApplication,
  validateContentBundle
});
