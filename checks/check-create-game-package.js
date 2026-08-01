"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");
const { execFileSync } = require("child_process");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "packages", "create-game");
const enginePackageRoot = path.join(root, "packages", "engine");
const engineVersion = JSON.parse(fs.readFileSync(path.join(enginePackageRoot, "package.json"), "utf8")).version;
const playwrightModulePath = require.resolve("playwright");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-create-game-"));

try {
  const packOutput = JSON.parse(execFileSync("npm", ["pack", packageRoot, "--json", "--pack-destination", fixtureRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  }));
  const packed = packOutput[0];
  if (!packed?.filename) throw new Error("npm pack did not return a create-game tarball");
  if (!packed.files.some((file) => file.path === "bin/create-game.js")) throw new Error("create-game tarball is missing its CLI");
  if (!packed.files.some((file) => file.path === "starter/content/content-bundle.json")) throw new Error("create-game tarball is missing canonical starter content");
  if (!packed.files.some((file) => file.path === "starter/ASSET-NOTICES.json")) throw new Error("create-game tarball is missing starter asset notices");
  const tarball = path.join(fixtureRoot, packed.filename);
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "create-game-pack-fixture", private: true }, null, 2)}\n`);
  execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: fixtureRoot,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  });
  const packedCli = path.join(fixtureRoot, "node_modules", "@pop-party", "create-game", "bin", "create-game.js");
  const cliTargetRoot = path.join(fixtureRoot, "cli-generated-game");
  const cliOutput = execFileSync(process.execPath, [packedCli, "CLI Generated Fixture", "--engine-version", engineVersion, "--output", cliTargetRoot], {
    cwd: fixtureRoot,
    encoding: "utf8"
  });
  if (!cliOutput.includes(`Created CLI Generated Fixture at ${cliTargetRoot}`)
    || !cliOutput.includes(`Engine: @pop-party/engine@${engineVersion}`)) {
    throw new Error("Packed create-game executable output contract failed");
  }
  if (JSON.parse(fs.readFileSync(path.join(cliTargetRoot, "package.json"), "utf8")).name !== "cli-generated-fixture") {
    throw new Error("Packed create-game executable did not generate the requested game");
  }
  const fixtureRequire = createRequire(path.join(fixtureRoot, "fixture.js"));
  const { generateGame } = fixtureRequire("@pop-party/create-game");
  const targetRoot = path.join(fixtureRoot, "generated-game");
  generateGame({ displayName: "Generated Fixture", engineVersion, targetRoot });
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(targetRoot, "package.json"), "utf8"));
  if (!fs.readFileSync(path.join(targetRoot, "LICENSE"), "utf8").startsWith("MIT License\n")) throw new Error("Generated game is missing its MIT code license");
  if (!fs.existsSync(path.join(targetRoot, "STARTER-ASSET-NOTICES.json"))) throw new Error("Generated game is missing starter asset notices");
  if (!fs.readFileSync(path.join(targetRoot, ".gitignore"), "utf8").includes(".pop-party/")) {
    throw new Error("Generated game does not ignore its local development content workspace");
  }
  const renderBlueprint = fs.readFileSync(path.join(targetRoot, "render.yaml"), "utf8");
  for (const contract of ["type: web", "runtime: node", "numInstances: 1", "startCommand: npm start", "healthCheckPath: /health"]) {
    if (!renderBlueprint.includes(contract)) throw new Error(`Generated Render Blueprint is missing ${contract}`);
  }
  if (!fs.existsSync(path.join(targetRoot, "DEPLOYMENT.md"))) throw new Error("Generated game is missing its deployment runbook");
  for (const relativePath of ["src/actions/index.js", "src/stage/index.js", "src/controller/index.js", "src/tools/index.js", "src/plugin/index.js", "tests/config.test.js"]) {
    if (!fs.existsSync(path.join(targetRoot, relativePath))) throw new Error(`Generated game is missing ${relativePath}`);
  }
  if (generatedManifest.dependencies?.["@pop-party/engine"] !== engineVersion) throw new Error("Generated game did not pin the exact engine version");
  if (generatedManifest.scripts?.start !== "pop-party start"
    || generatedManifest.scripts?.dev !== "pop-party dev"
    || generatedManifest.scripts?.migrate !== "pop-party migrate") {
    throw new Error("Generated game is missing engine-owned service and migration scripts");
  }
  if (JSON.stringify(generatedManifest).includes("file:") || JSON.stringify(generatedManifest).includes("workspace:")) {
    throw new Error("Generated game contains a local dependency reference");
  }
  const generatedSnapshot = createLocalContentBundleProvider({ root: path.join(targetRoot, "content") }).loadPublishedRevision();
  if (generatedSnapshot.manifest.gameId !== "generated-fixture") throw new Error("Packed generator did not create an independently identified bundle");
  const enginePackOutput = JSON.parse(execFileSync("npm", ["pack", enginePackageRoot, "--json", "--pack-destination", fixtureRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  }));
  const engineTarball = path.join(fixtureRoot, enginePackOutput[0].filename);
  execFileSync("npm", ["install", engineTarball, "--no-save", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: targetRoot,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  });
  execFileSync("npm", ["test"], { cwd: targetRoot, stdio: "inherit" });
  fs.writeFileSync(path.join(targetRoot, "src", "actions", "index.js"), `"use strict";
module.exports = Object.freeze([{
  id: "generated-fixture.increment",
  value: {
    name: "Increment Fixture Counter",
    fields: [
      { key: "amount", label: "Amount", control: "integer", min: 1, max: 10, default: 1 },
      { key: "resultVariable", label: "Result Variable", control: "text", default: "fixtureCount" }
    ],
    outputs: [
      { id: "count", name: "Count", variableField: "resultVariable", defaultVariable: "fixtureCount" }
    ],
    execute(context, action) {
      context.state.count = Number(context.state.count || 0) + Number(action.amount || 0);
      context.outputs.set("count", context.state.count);
    }
  }
}]);
`);
  fs.writeFileSync(path.join(targetRoot, "src", "inputs", "index.js"), `"use strict";
module.exports = Object.freeze([
  {
    id: "generated-fixture.turnChoice",
    value: {
      name: "Turn Choice",
      fields: [
        { key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" },
        { key: "resultVariable", label: "Result Variable", control: "text", default: "inputResult" }
      ],
      outputs: [{ id: "choice", name: "Choice", variableField: "resultVariable" }],
      submission: [{ id: "choice", type: "choice", optionsSource: "options" }],
      controller: {
        layoutStateId: "fixture-plugin-input",
        bindings: [
          { id: "hit", kind: "choice", layoutElementId: "fixture-hit-button", field: "choice", optionIndex: 0, autoSubmit: true },
          { id: "stay", kind: "choice", layoutElementId: "fixture-stay-button", field: "choice", optionIndex: 1, autoSubmit: true }
        ]
      },
      recipients(context) { return context.players.slice(0, 1).map((player) => player.id); },
      view(context) {
        return { viewer: context.viewer.id, options: [{ id: "hit", label: "Hit" }, { id: "stay", label: "Stay" }] };
      },
      submit(context, payload) {
        context.state.turnChoice = { playerId: context.actor.id, choice: payload.choice };
        context.outputs.set("choice", payload.choice);
      }
    }
  },
  {
    id: "generated-fixture.privateWager",
    value: {
      name: "Private Wager",
      fields: [{ key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" }],
      submission: [
        { id: "side", type: "choice", optionsSource: "options" },
        { id: "amount", type: "integer", min: 1, max: 50 }
      ],
      controller: {
        layoutStateId: "controller-text-input",
        bindings: [
          { id: "left", kind: "choice", layoutElementId: "controllerTextPrompt", field: "side", optionIndex: 0 },
          { id: "right", kind: "choice", layoutElementId: "controllerInvalidBanner", field: "side", optionIndex: 1 },
          { id: "amount", kind: "integer", layoutElementId: "controllerTextInput", field: "amount" },
          { id: "submit", kind: "submit", layoutElementId: "controllerTextSubmitButtonContainer" }
        ],
        submitted: {
          layoutStateId: "fixture-wager-confirmed",
          bindings: [
            { id: "confirmedTarget", kind: "text", layoutElementId: "fixture-wager-confirmation", source: "target", targetComponentId: "text" }
          ]
        }
      },
      disconnect: "completeRemaining",
      recipients(context) { return context.players.map((player) => player.id); },
      view(context) {
        const target = context.viewer.name === "One" ? 10 : 20;
        return {
          target,
          options: [{ id: "over", label: "Over " + target }, { id: "under", label: "Under " + target }],
          amount: { initial: context.viewer.name === "One" ? 7 : 9 }
        };
      },
      submit(context, payload) {
        context.state.wagers ||= {};
        context.state.wagers[context.actor.id] = payload;
      }
    }
  }
]);
`);
  const generatedRenderer = (id, layoutElementId, targetComponentId) => `"use strict";
module.exports = Object.freeze([{
  id: ${JSON.stringify(id)},
  value: {
    name: "Fixture Counter",
    target: { layoutElementId: ${JSON.stringify(layoutElementId)}, layoutScope: "global" },
    bindings: [
      { id: "count", kind: "text", source: "label", targetComponentId: ${JSON.stringify(targetComponentId)}, fallback: "0" }
    ],
    select(context) { return { label: String(context.state.count || 0) }; }
  }
}]);
`;
  fs.writeFileSync(
    path.join(targetRoot, "src", "stage", "index.js"),
    generatedRenderer("generated-fixture.stageCounter", "stagecodebadge", "badge-code")
  );
  fs.writeFileSync(
    path.join(targetRoot, "src", "controller", "index.js"),
    generatedRenderer("generated-fixture.controllerCounter", "controllerglobalactionmessage", "layout-text-field-text/layout-text")
  );
  const developmentSmoke = execFileSync(process.execPath, ["-e", `
    const fs = require("node:fs");
    const { startDevelopmentApplication } = require("@pop-party/engine/tooling");
    const { chromium } = require(${JSON.stringify(playwrightModulePath)});
    (async () => {
      const first = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: ${JSON.stringify(engineVersion)}, host: "127.0.0.1", port: 0 });
      const browser = await chromium.launch({ headless: true });
      const firstHealth = await (await fetch(first.startup.localUrl + "/health")).json();
      const flowResponse = await fetch(first.startup.localUrl + "/api/game-flow");
      const flowPayload = await flowResponse.json();
      const pluginActionMeta = flowPayload.availableActionTypes.find((item) => item.id === "generated-fixture.increment");
      const pluginInputMeta = flowPayload.availableActionTypes.find((item) => item.id === "generated-fixture.turnChoice");
      const controllerLayoutsResponse = await fetch(first.startup.localUrl + "/api/controller-layouts");
      const controllerLayoutsPayload = await controllerLayoutsResponse.json();
      const customInputLayout = {
        id: "fixture-plugin-input",
        name: "Fixture Plugin Input",
        hiddenInStates: false,
        hiddenGlobals: [],
        elements: [
          {
            id: "fixture-input-prompt",
            name: "Fixture Input Prompt",
            selector: "",
            kind: "art",
            artCompositionId: "layout-text-field",
            hidden: false,
            locked: false,
            x: 195,
            y: 180,
            width: 330,
            height: 110,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "Choose an action",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          },
          {
            id: "fixture-hit-button",
            name: "Fixture Hit Button",
            selector: "",
            kind: "art",
            artCompositionId: "controller-choice-option",
            hidden: false,
            locked: false,
            x: 195,
            y: 390,
            width: 300,
            height: 80,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          },
          {
            id: "fixture-stay-button",
            name: "Fixture Stay Button",
            selector: "",
            kind: "art",
            artCompositionId: "controller-choice-option",
            hidden: false,
            locked: false,
            x: 195,
            y: 500,
            width: 300,
            height: 80,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          }
        ]
      };
      const wagerConfirmedLayout = {
        id: "fixture-wager-confirmed",
        name: "Fixture Wager Confirmed",
        hiddenGlobals: [],
        hiddenLayers: [],
        elements: [{
          id: "fixture-wager-confirmation",
          name: "Wager Confirmation",
          selector: "",
          kind: "art",
          artCompositionId: "layout-text-field",
          hidden: false,
          locked: false,
          x: 195,
          y: 420,
          width: 330,
          height: 120,
          scale: 1,
          rotation: 0,
          defaultAnimationState: "On",
          defaultText: "Wager confirmed",
          fontSize: 32,
          autoFitText: false,
          fontFamily: "",
          fontColor: "#17131f"
        }]
      };
      const persistentContextLayer = {
        id: "fixture-persistent-context",
        name: "Fixture Persistent Context",
        zIndex: 150,
        elements: [{
          id: "fixture-persistent-pulse",
          name: "Persistent Pulse",
          selector: "",
          kind: "art",
          artCompositionId: "layout-text-field",
          hidden: false,
          locked: false,
          x: 195,
          y: 90,
          width: 300,
          height: 70,
          scale: 1,
          rotation: 0,
          defaultAnimationState: "On",
          defaultText: "Persistent context",
          fontSize: 24,
          autoFitText: false,
          fontFamily: "",
          fontColor: "#17131f"
        }]
      };
      const controllerLayouts = {
        ...controllerLayoutsPayload.layouts,
        layers: [
          ...(controllerLayoutsPayload.layouts.layers || []).filter((layer) => layer.id !== persistentContextLayer.id),
          persistentContextLayer
        ],
        states: [
          ...controllerLayoutsPayload.layouts.states.filter((state) => ![customInputLayout.id, wagerConfirmedLayout.id].includes(state.id)),
          customInputLayout,
          wagerConfirmedLayout
        ]
      };
      const controllerLayoutSaveResponse = await fetch(first.startup.localUrl + "/api/controller-layouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layouts: controllerLayouts })
      });
      const fixtureLobby = {
          id: "lobby",
          name: "Lobby",
          entryTargetActionId: "fixture-increment",
          actions: [
            {
              id: "fixture-increment",
              name: "Increment Fixture Counter",
              type: "generated-fixture.increment",
              amount: 2,
              resultVariable: "fixtureCount",
              timing: { mode: "E+", seconds: 0 },
              subActions: [],
              nextTargetActionId: "fixture-decision"
            },
            {
              id: "fixture-decision",
              name: "Branch On Fixture Counter",
              type: "decision",
              variable: "flowVariables.fixtureCount",
              valueType: "int",
              subActions: [],
              branches: [
                { id: "branch-hit", type: "code", code: "x == 2", targetActionId: "fixture-hit" },
                { id: "branch-miss", type: "noMatch", targetActionId: "fixture-miss" }
              ]
            },
            {
              id: "fixture-hit",
              name: "Fixture Hit",
              type: "presentText",
              text: "Plugin branch hit",
              timing: { mode: "E+", seconds: 0 },
              subActions: [],
              nextTargetActionId: "none"
            },
            {
              id: "fixture-miss",
              name: "Fixture Miss",
              type: "presentText",
              text: "Plugin branch missed",
              timing: { mode: "E+", seconds: 0 },
              subActions: [],
              nextTargetActionId: "none"
            }
          ]
      };
      const fixtureFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? fixtureLobby : state)
      };
      const stageHtml = await (await fetch(first.startup.localUrl + "/stage")).text();
      const controllerHtml = await (await fetch(first.startup.localUrl + "/controller")).text();
      const roomResponse = await fetch(first.startup.localUrl + "/api/stage/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "PLUG" })
      });
      const room = await roomResponse.json();
      const initialLobbyResponse = await fetch(first.startup.localUrl + "/api/stage/PLUG/lobby");
      await initialLobbyResponse.json();
      const stageHeaders = {
        "content-type": "application/json",
        "x-stage-capability": room.stageCapability
      };
      const testConfigResponse = await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ flow: fixtureFlow })
      });
      const configuredLobby = (await testConfigResponse.json()).lobby;
      const completeResponse = await fetch(first.startup.localUrl + "/api/complete-action", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ stageCode: "PLUG", actionId: "fixture-increment", source: "callback" })
      });
      const completedLobby = (await completeResponse.json()).lobby;
      const joinPlayer = async (name) => {
        const response = await fetch(first.startup.localUrl + "/api/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stageCode: "PLUG", playerName: name })
        });
        return response.json();
      };
      const controllerPage = await browser.newPage();
      await controllerPage.goto(first.startup.localUrl + "/controller?stage=PLUG&name=One&join=1", { waitUntil: "load" });
      await controllerPage.waitForFunction(() => Boolean(window.controllerState?.player?.id), null, { timeout: 15_000 });
      const one = await controllerPage.evaluate(() => ({
        player: window.controllerState.player,
        playerCapability: sessionStorage.getItem("partyTemplatePlayerCapability")
      }));
      const two = await joinPlayer("Two");
      const playerHeaders = (joined) => ({
        "content-type": "application/json",
        "x-player-capability": joined.playerCapability,
        "x-player-id": joined.player.id,
        "x-stage-code": "PLUG"
      });
      const inputLobby = {
        ...fixtureLobby,
        entryTargetActionId: "fixture-before-turn",
        actions: [
          {
            id: "fixture-before-turn",
            name: "Before Turn Choice",
            type: "presentText",
            text: "Preparing controller input",
            timing: { mode: "E+", seconds: 0 },
            subActions: [],
            nextTargetActionId: "fixture-turn-choice"
          },
          {
            id: "fixture-turn-choice",
            name: "Turn Choice",
            type: "generated-fixture.turnChoice",
            answersSubmittedTargetActionId: "fixture-input-decision",
            resultVariable: "inputResult",
            timing: { mode: "E+", seconds: 0 },
            subActions: []
          },
          {
            id: "fixture-input-decision",
            name: "Branch On Input",
            type: "decision",
            variable: "flowVariables.inputResult",
            valueType: "string",
            subActions: [],
            branches: [
              { id: "input-hit", type: "code", code: "x == 'hit'", targetActionId: "fixture-input-hit" },
              { id: "input-miss", type: "noMatch", targetActionId: "fixture-input-miss" }
            ]
          },
          { id: "fixture-input-hit", name: "Input Hit", type: "presentText", text: "Input branch hit", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" },
          { id: "fixture-input-miss", name: "Input Miss", type: "presentText", text: "Input branch missed", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" },
          ...fixtureLobby.actions
        ]
      };
      const inputFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? inputLobby : state)
      };
      const inputConfigResponse = await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ flow: inputFlow })
      });
      const configuredInputLobby = (await inputConfigResponse.json()).lobby;
      const inputTransitionResponse = await fetch(first.startup.localUrl + "/api/complete-action", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ stageCode: "PLUG", actionId: "fixture-before-turn", source: "callback" })
      });
      const inputStageLobby = (await inputTransitionResponse.json()).lobby;
      const heartbeat = async (joined) => (await (await fetch(first.startup.localUrl + "/api/heartbeat", {
        method: "POST",
        headers: playerHeaders(joined),
        body: JSON.stringify({ stageCode: "PLUG", playerId: joined.player.id })
      })).json()).lobby;
      const oneInputLobby = await heartbeat(one);
      const twoInputLobby = await heartbeat(two);
      const turnInput = oneInputLobby.gamePlugin?.input;
      try {
        await controllerPage.waitForFunction(() => {
          const input = window.controllerState?.lobby?.gamePlugin?.input;
          const layoutElement = window.controllerLayoutElementForId?.("fixture-hit-button");
          const layoutHost = layoutElement && window.controllerLayoutTargetElement?.(layoutElement);
          const control = document.querySelector('[data-game-plugin-input-binding="hit"]');
          return input?.actionId === "fixture-turn-choice"
            && Boolean(layoutHost && control && layoutHost.contains(control));
        }, null, { timeout: 15_000 });
      } catch (error) {
        const diagnostic = await controllerPage.evaluate(() => ({
          revision: window.controllerState?.lobby?.revision,
          viewStateId: window.controllerState?.controllerViewStateId,
          input: window.controllerState?.lobby?.gamePlugin?.input,
          runtimeConfig: document.getElementById("pop-party-runtime-config")?.textContent,
          activeLayoutElements: Array.from(document.querySelectorAll("[data-controller-layout-element-id]"))
            .map((node) => node.getAttribute("data-controller-layout-element-id")),
          choiceHost: document.querySelector('[data-controller-layout-element-id="fixture-hit-button"]')?.outerHTML,
          controls: document.querySelectorAll("[data-game-plugin-input-binding]").length
        }));
        throw new Error("Generated controller input did not activate: " + JSON.stringify(diagnostic), { cause: error });
      }
      const controllerInputState = await controllerPage.evaluate(() => ({
        viewStateId: window.controllerState?.controllerViewStateId,
        actionId: window.controllerState?.lobby?.gamePlugin?.input?.actionId,
        layoutHostActive: (() => {
          const layoutElement = window.controllerLayoutElementForId?.("fixture-hit-button");
          const layoutHost = layoutElement && window.controllerLayoutTargetElement?.(layoutElement);
          const control = document.querySelector('[data-game-plugin-input-binding="hit"]');
          return Boolean(layoutHost && control && layoutHost.contains(control));
        })()
      }));
      const turnSubmit = await (await fetch(first.startup.localUrl + "/api/game-plugin-input", {
        method: "POST",
        headers: playerHeaders(one),
        body: JSON.stringify({
          stageCode: "PLUG",
          playerId: one.player.id,
          gameSessionId: oneInputLobby.gameSessionId,
          actionId: turnInput.actionId,
          visitId: turnInput.visitId,
          submissionId: "turn-one",
          payload: { choice: "hit" }
        })
      })).json();
      const wagerLobby = {
        ...fixtureLobby,
        entryTargetActionId: "fixture-private-wager",
        actions: [
          {
            id: "fixture-private-wager",
            name: "Private Wager",
            type: "generated-fixture.privateWager",
            answersSubmittedTargetActionId: "fixture-input-hit",
            timing: { mode: "E+", seconds: 0 },
            subActions: []
          },
          { id: "fixture-input-hit", name: "Wagers Done", type: "presentText", text: "Done", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" }
        ]
      };
      const wagerFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? wagerLobby : state)
      };
      await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ flow: wagerFlow })
      });
      const oneWagerLobby = await heartbeat(one);
      const twoWagerLobby = await heartbeat(two);
      await controllerPage.waitForFunction(() => {
        const input = window.controllerState?.lobby?.gamePlugin?.input;
        return input?.type === "generated-fixture.privateWager"
          && document.querySelectorAll("[data-game-plugin-input-binding]").length === 4;
      }, null, { timeout: 15_000 });
      const wagerInitialState = await controllerPage.evaluate(() => {
        const field = document.querySelector('[data-game-plugin-input-binding="amount"]');
        const left = document.querySelector('[data-game-plugin-input-binding="left"]');
        const style = field ? getComputedStyle(field) : null;
        return {
          value: field?.value,
          fontSize: Number.parseFloat(style?.fontSize || "0"),
          caretColor: style?.caretColor,
          leftPressed: left?.getAttribute("aria-pressed"),
          leftSelected: left?.classList.contains("is-selected") === true
        };
      });
      await controllerPage.locator('[data-game-plugin-input-binding="left"]').click();
      await controllerPage.locator('[data-game-plugin-input-binding="amount"]').fill("17");
      await controllerPage.waitForTimeout(1_600);
      const wagerEditedState = await controllerPage.evaluate(() => {
        const field = document.querySelector('[data-game-plugin-input-binding="amount"]');
        const left = document.querySelector('[data-game-plugin-input-binding="left"]');
        const right = document.querySelector('[data-game-plugin-input-binding="right"]');
        return {
          value: field?.value,
          leftPressed: left?.getAttribute("aria-pressed"),
          rightPressed: right?.getAttribute("aria-pressed"),
          leftSelected: left?.classList.contains("is-selected") === true,
          hostSelected: left?.parentElement?.dataset.gamePluginInputSelected,
          focused: document.activeElement === field
        };
      });
      await controllerPage.reload({ waitUntil: "load" });
      await controllerPage.waitForFunction(() => {
        const input = window.controllerState?.lobby?.gamePlugin?.input;
        return input?.type === "generated-fixture.privateWager"
          && document.querySelector('[data-game-plugin-input-binding="amount"]')?.value === "7";
      }, null, { timeout: 15_000 });
      const wagerReloadedState = await controllerPage.evaluate(() => ({
        value: document.querySelector('[data-game-plugin-input-binding="amount"]')?.value,
        leftPressed: document.querySelector('[data-game-plugin-input-binding="left"]')?.getAttribute("aria-pressed")
      }));
      await controllerPage.evaluate(() => {
        const host = document.querySelector('[data-controller-layout-scope="layer:fixture-persistent-context"][data-controller-layout-element-id="fixture-persistent-pulse"]');
        const globalHost = document.querySelector('[data-controller-layout-scope="global"][data-controller-layout-element-id="controllerplayerbanner"]');
        if (!host || !globalHost) return;
        window.__fixturePersistentHost = host;
        window.__fixturePersistentArtLayer = host.querySelector(":scope > .controller-widget-art-layer");
        window.__fixturePersistentRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(host);
        window.__fixtureGlobalHost = globalHost;
        window.__fixtureGlobalRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(globalHost);
        window.__fixturePersistentAnimation = host.animate(
          [{ opacity: 1 }, { opacity: 0.82 }, { opacity: 1 }],
          { duration: 500, iterations: Infinity }
        );
      });
      await controllerPage.waitForTimeout(120);
      const persistentIdentityBefore = await controllerPage.evaluate(() => ({
        scope: window.__fixturePersistentHost?.getAttribute("data-controller-layout-scope"),
        zIndex: window.__fixturePersistentHost ? getComputedStyle(window.__fixturePersistentHost).zIndex : "",
        persistentRendererPresent: Boolean(window.__fixturePersistentRenderer),
        globalRendererPresent: Boolean(window.__fixtureGlobalRenderer),
        animationTime: Number(window.__fixturePersistentAnimation?.currentTime || 0)
      }));
      await controllerPage.locator('[data-game-plugin-input-binding="left"]').click();
      await controllerPage.locator('[data-game-plugin-input-binding="amount"]').fill("17");
      const browserSubmitResponse = controllerPage.waitForResponse((response) => (
        response.url().endsWith("/api/game-plugin-input") && response.request().method() === "POST"
      ));
      await controllerPage.locator('[data-game-plugin-input-binding="submit"]').click();
      const browserWagerResponse = await browserSubmitResponse;
      const browserWagerRequest = JSON.parse(browserWagerResponse.request().postData() || "{}");
      const firstWagerSubmit = await browserWagerResponse.json();
      await controllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.submitted === true
        && window.controllerState?.lobby?.gamePlugin?.input?.layoutStateId === "fixture-wager-confirmed"
        && document.querySelector('[data-controller-layout-element-id="fixture-wager-confirmation"]')
        && document.querySelectorAll("[data-game-plugin-input-binding]").length === 0
      ), null, { timeout: 15_000 });
      const submittedControllerState = await controllerPage.evaluate(() => ({
        layoutStateId: window.controllerState?.lobby?.gamePlugin?.input?.layoutStateId,
        submitted: window.controllerState?.lobby?.gamePlugin?.input?.submitted,
        activeControls: document.querySelectorAll("[data-game-plugin-input-binding]").length,
        persistentHostRetained: window.__fixturePersistentHost === document.querySelector('[data-controller-layout-scope="layer:fixture-persistent-context"][data-controller-layout-element-id="fixture-persistent-pulse"]'),
        persistentArtRetained: window.__fixturePersistentArtLayer === window.__fixturePersistentHost?.querySelector(":scope > .controller-widget-art-layer"),
        persistentRendererRetained: window.__fixturePersistentRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixturePersistentHost),
        globalHostRetained: window.__fixtureGlobalHost === document.querySelector('[data-controller-layout-scope="global"][data-controller-layout-element-id="controllerplayerbanner"]'),
        globalRendererRetained: window.__fixtureGlobalRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixtureGlobalHost),
        animationTime: Number(window.__fixturePersistentAnimation?.currentTime || 0),
        animationState: window.__fixturePersistentAnimation?.playState
      }));
      const submitPluginInput = async (joined, lobby, payload, id) => (await (await fetch(first.startup.localUrl + "/api/game-plugin-input", {
        method: "POST",
        headers: playerHeaders(joined),
        body: JSON.stringify({
          stageCode: "PLUG",
          playerId: joined.player.id,
          gameSessionId: lobby.gameSessionId,
          actionId: lobby.gamePlugin.input.actionId,
          visitId: lobby.gamePlugin.input.visitId,
          submissionId: id,
          payload
        })
      })).json());
      const duplicateWagerSubmit = await (await fetch(first.startup.localUrl + "/api/game-plugin-input", {
        method: "POST",
        headers: playerHeaders(one),
        body: JSON.stringify(browserWagerRequest)
      })).json();
      const secondWagerSubmit = await submitPluginInput(two, twoWagerLobby, { side: "under", amount: 22 }, "wager-two");
      await controllerPage.waitForFunction(() => window.controllerState?.lobby?.action?.id === "fixture-input-hit", null, { timeout: 15_000 });
      const transitionedControllerIdentity = await controllerPage.evaluate(() => ({
        persistentHostRetained: window.__fixturePersistentHost === document.querySelector('[data-controller-layout-scope="layer:fixture-persistent-context"][data-controller-layout-element-id="fixture-persistent-pulse"]'),
        persistentArtRetained: window.__fixturePersistentArtLayer === window.__fixturePersistentHost?.querySelector(":scope > .controller-widget-art-layer"),
        persistentRendererRetained: window.__fixturePersistentRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixturePersistentHost),
        globalHostRetained: window.__fixtureGlobalHost === document.querySelector('[data-controller-layout-scope="global"][data-controller-layout-element-id="controllerplayerbanner"]'),
        globalRendererRetained: window.__fixtureGlobalRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixtureGlobalHost),
        originalGlobalConnected: window.__fixtureGlobalHost?.isConnected === true,
        globalCandidates: document.querySelectorAll('[data-controller-layout-scope="global"][data-controller-layout-element-id="controllerplayerbanner"]').length,
        animationTime: Number(window.__fixturePersistentAnimation?.currentTime || 0),
        animationState: window.__fixturePersistentAnimation?.playState
      }));
      const constantsResponse = await fetch(first.startup.localUrl + "/api/game-constants");
      const constantsPayload = await constantsResponse.json();
      constantsPayload.constants.gameTitle = "Generated Fixture Edited";
      const saveResponse = await fetch(first.startup.localUrl + "/api/game-constants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ constants: constantsPayload.constants })
      });
      const flowSaveResponse = await fetch(first.startup.localUrl + "/api/game-flow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow: inputFlow })
      });
      const flowSavePayload = await flowSaveResponse.json();
      const savedRevision = JSON.parse(fs.readFileSync(".pop-party/content/content-bundle.json", "utf8")).rootHash;
      await first.runtime.stop().catch(() => {});
      await browser.close();
      const second = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: ${JSON.stringify(engineVersion)}, host: "127.0.0.1", port: 0 });
      const secondConstants = await (await fetch(second.startup.localUrl + "/api/game-constants")).json();
      const secondFlow = await (await fetch(second.startup.localUrl + "/api/game-flow")).json();
      const secondControllerLayouts = await (await fetch(second.startup.localUrl + "/api/controller-layouts")).json();
      const restartedBrowser = await chromium.launch({ headless: true });
      const restartedControllerPage = await restartedBrowser.newPage();
      const restartedRoomResponse = await fetch(second.startup.localUrl + "/api/stage/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "RSTR" })
      });
      const restartedRoom = await restartedRoomResponse.json();
      await restartedControllerPage.goto(second.startup.localUrl + "/controller?stage=RSTR&name=One&join=1", { waitUntil: "load" });
      await restartedControllerPage.waitForFunction(() => Boolean(window.controllerState?.player?.id), null, { timeout: 15_000 });
      await fetch(second.startup.localUrl + "/api/stage/RSTR/test-config", {
        method: "POST",
        headers: { "content-type": "application/json", "x-stage-capability": restartedRoom.stageCapability },
        body: JSON.stringify({ flow: wagerFlow })
      });
      await restartedControllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.type === "generated-fixture.privateWager"
        && document.querySelector('[data-game-plugin-input-binding="amount"]')?.value === "7"
      ), null, { timeout: 15_000 });
      await restartedControllerPage.locator('[data-game-plugin-input-binding="left"]').click();
      const wagerRestartedState = await restartedControllerPage.evaluate(() => ({
        value: document.querySelector('[data-game-plugin-input-binding="amount"]')?.value,
        leftPressed: document.querySelector('[data-game-plugin-input-binding="left"]')?.getAttribute("aria-pressed"),
        hostSelected: document.querySelector('[data-game-plugin-input-binding="left"]')?.parentElement?.dataset.gamePluginInputSelected
      }));
      await restartedBrowser.close();
      const result = {
        firstRevision: first.development.revision,
        healthRevision: firstHealth.release.contentRevision,
        saveStatus: saveResponse.status,
        savedRevision,
        secondRevision: second.development.revision,
        secondGameTitle: secondConstants.constants.gameTitle,
        pluginActionVisible: Boolean(pluginActionMeta && pluginActionMeta.fields.some((field) => field.key === "amount")),
        pluginInputVisible: Boolean(pluginInputMeta && pluginInputMeta.fields.some((field) => field.key === "resultVariable")),
        flowSaveStatus: flowSaveResponse.status,
        flowSaveError: flowSavePayload.error,
        controllerLayoutSaveStatus: controllerLayoutSaveResponse.status,
        customControllerLayoutReloaded: secondControllerLayouts.layouts.states
          .some((state) => state.id === "fixture-plugin-input"
            && state.elements.some((element) => element.id === "fixture-hit-button")),
        persistentLayerReloaded: secondControllerLayouts.layouts.layers
          ?.some((layer) => layer.id === "fixture-persistent-context" && layer.zIndex === 150),
        rendererManifestVisible: stageHtml.includes("generated-fixture.stageCounter")
          && controllerHtml.includes("generated-fixture.controllerCounter"),
        pluginViewModel: configuredLobby.gamePlugin?.viewModels?.["generated-fixture.stageCounter"]?.label,
        configuredAction: configuredLobby.action?.id,
        configuredFault: configuredLobby.runtimeFault,
        branchSelected: completedLobby.lastDecisionTrace?.selectedBranch,
        branchedAction: completedLobby.action?.id,
        inputTransitionAction: inputStageLobby.action?.id,
        privateInputHiddenBeforeTransition: configuredInputLobby.gamePlugin?.input == null,
        privateInputHiddenFromStage: inputStageLobby.gamePlugin?.input == null,
        inputDeliveryRevisionAdvanced: Number(oneInputLobby.revision) > Number(inputStageLobby.revision),
        currentPlayerInputVisible: turnInput?.viewModel?.viewer === one.player.id,
        currentPlayerInputLayout: turnInput?.layoutStateId,
        controllerInputViewState: controllerInputState.viewStateId,
        controllerInputAction: controllerInputState.actionId,
        controllerLayoutControlBound: controllerInputState.layoutHostActive,
        waitingPlayerInputHidden: twoInputLobby.gamePlugin?.input == null,
        inputBranchSelected: turnSubmit.lobby?.lastDecisionTrace?.selectedBranch,
        inputBranchedAction: turnSubmit.lobby?.action?.id,
        privateWagerTargets: [
          oneWagerLobby.gamePlugin?.input?.viewModel?.target,
          twoWagerLobby.gamePlugin?.input?.viewModel?.target
        ],
        waitingWagerLayout: twoWagerLobby.gamePlugin?.input?.layoutStateId,
        submittedWagerLayout: firstWagerSubmit.lobby?.gamePlugin?.input?.layoutStateId,
        persistentIdentityBefore,
        submittedControllerState,
        transitionedControllerIdentity,
        wagerInitialState,
        wagerEditedState,
        wagerReloadedState,
        wagerRestartedState,
        browserWagerPayload: browserWagerRequest.payload,
        firstWagerWaited: firstWagerSubmit.lobby?.action?.id === "fixture-private-wager",
        duplicateWagerIgnored: duplicateWagerSubmit.duplicate === true,
        wagerCompletionAction: secondWagerSubmit.lobby?.action?.id,
        secondFlowActionType: secondFlow.flow.states
          .find((state) => state.id === "lobby")?.actions
          .find((action) => action.id === "fixture-increment")?.type,
        seededFirst: first.development.seeded,
        seededSecond: second.development.seeded
      };
      await second.runtime.stop();
      process.stdout.write(JSON.stringify(result));
    })().catch((error) => { console.error(error); process.exit(1); });
  `], { cwd: targetRoot, encoding: "utf8" });
  const development = JSON.parse(developmentSmoke.trim().split(/\r?\n/).at(-1));
  if (!development.seededFirst || development.seededSecond
    || development.firstRevision !== development.healthRevision
    || development.saveStatus !== 200
    || development.savedRevision === development.firstRevision
    || development.secondRevision !== development.savedRevision
    || development.secondGameTitle !== "Generated Fixture Edited"
    || !development.pluginActionVisible
    || !development.pluginInputVisible
    || development.flowSaveStatus !== 200
    || development.controllerLayoutSaveStatus !== 200
    || !development.customControllerLayoutReloaded
    || !development.persistentLayerReloaded
    || !development.rendererManifestVisible
    || development.pluginViewModel !== "2"
    || development.branchSelected !== "branch-hit"
    || development.branchedAction !== "fixture-hit"
    || development.inputTransitionAction !== "fixture-turn-choice"
    || !development.privateInputHiddenBeforeTransition
    || !development.privateInputHiddenFromStage
    || !development.inputDeliveryRevisionAdvanced
    || !development.currentPlayerInputVisible
    || development.currentPlayerInputLayout !== "fixture-plugin-input"
    || development.controllerInputViewState !== "gamePluginInput"
    || development.controllerInputAction !== "fixture-turn-choice"
    || !development.controllerLayoutControlBound
    || !development.waitingPlayerInputHidden
    || development.inputBranchSelected !== "input-hit"
    || development.inputBranchedAction !== "fixture-input-hit"
    || JSON.stringify(development.privateWagerTargets) !== JSON.stringify([10, 20])
    || development.wagerInitialState?.value !== "7"
    || !(development.wagerInitialState?.fontSize > 0)
    || !development.wagerInitialState?.caretColor
    || development.wagerInitialState?.leftPressed !== "false"
    || development.wagerInitialState?.leftSelected
    || development.wagerEditedState?.value !== "17"
    || development.wagerEditedState?.leftPressed !== "true"
    || development.wagerEditedState?.rightPressed !== "false"
    || !development.wagerEditedState?.leftSelected
    || development.wagerEditedState?.hostSelected !== "true"
    || !development.wagerEditedState?.focused
    || development.wagerReloadedState?.value !== "7"
    || development.wagerReloadedState?.leftPressed !== "false"
    || development.wagerRestartedState?.value !== "7"
    || development.wagerRestartedState?.leftPressed !== "true"
    || development.wagerRestartedState?.hostSelected !== "true"
    || JSON.stringify(development.browserWagerPayload) !== JSON.stringify({ side: "over", amount: 17 })
    || development.waitingWagerLayout !== "controller-text-input"
    || development.submittedWagerLayout !== "fixture-wager-confirmed"
    || development.persistentIdentityBefore?.scope !== "layer:fixture-persistent-context"
    || development.persistentIdentityBefore?.zIndex !== "150"
    || !development.persistentIdentityBefore?.persistentRendererPresent
    || !development.persistentIdentityBefore?.globalRendererPresent
    || development.submittedControllerState?.layoutStateId !== "fixture-wager-confirmed"
    || development.submittedControllerState?.submitted !== true
    || development.submittedControllerState?.activeControls !== 0
    || !development.submittedControllerState?.persistentHostRetained
    || !development.submittedControllerState?.persistentArtRetained
    || !development.submittedControllerState?.persistentRendererRetained
    || !development.submittedControllerState?.globalHostRetained
    || !development.submittedControllerState?.globalRendererRetained
    || development.submittedControllerState?.animationState !== "running"
    || !(development.submittedControllerState?.animationTime > development.persistentIdentityBefore?.animationTime)
    || !development.transitionedControllerIdentity?.persistentHostRetained
    || !development.transitionedControllerIdentity?.persistentArtRetained
    || !development.transitionedControllerIdentity?.persistentRendererRetained
    || !development.transitionedControllerIdentity?.globalHostRetained
    || !development.transitionedControllerIdentity?.globalRendererRetained
    || development.transitionedControllerIdentity?.animationState !== "running"
    || !(development.transitionedControllerIdentity?.animationTime >= development.submittedControllerState?.animationTime)
    || !development.firstWagerWaited
    || !development.duplicateWagerIgnored
    || development.wagerCompletionAction !== "fixture-input-hit"
    || development.secondFlowActionType !== "generated-fixture.increment") {
    throw new Error(`Generated game tools did not persist an independently valid local content revision: ${JSON.stringify(development)}`);
  }
  if (!fs.existsSync(path.join(targetRoot, ".pop-party", "content", "content-bundle.json"))) {
    throw new Error("Generated game development workspace was not created inside the game");
  }
  const migrationPreview = execFileSync("npm", ["run", "migrate"], { cwd: targetRoot, encoding: "utf8" });
  if (!migrationPreview.includes("Migration preview valid: level 0 -> 0") || !migrationPreview.includes("Changed paths: (none)")) {
    throw new Error("Generated game migration preview contract failed");
  }
  execFileSync("npm", ["run", "build"], { cwd: targetRoot, stdio: "pipe" });
  const gameBuild = JSON.parse(fs.readFileSync(path.join(targetRoot, "dist", "pop-party-build.json"), "utf8"));
  if (gameBuild.gameId !== "generated-fixture" || gameBuild.engineVersion !== engineVersion) {
    throw new Error("Generated game build manifest does not identify the exact game and engine");
  }
  if (gameBuild.contentRevision !== generatedSnapshot.revision) {
    throw new Error("Generated game build manifest is not pinned to the validated content revision");
  }
  console.log(`Packed create-game fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
