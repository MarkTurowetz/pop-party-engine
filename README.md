# Party Game Template

A server-backed toolkit for building stage/controller party games. Use it as the core package for future games: stages, controllers, durable game flow data, art management, constants, layouts, and controller-spawning tools are all part of the template.

## Local

```bash
node server.js
```

Open the stage:

```text
http://localhost:3000/stage
```

Open a controller:

```text
http://localhost:3000/controller
```

Short aliases:

```text
http://localhost:3000/s
http://localhost:3000/c
http://localhost:3000/l
```

## Deploy

This app is ready for Render as a Node web service.

- Build command: `npm run build-info`
- Start command: `node server.js`
- Health check path: `/api/health`

The included `render.yaml` defines the same settings as a Render Blueprint.

## Durable Game Flow Storage

The flow editor does not rely on the deployed server filesystem. In production,
game flow data is stored through a pluggable storage layer. The Render blueprint
is configured to use GitHub-backed storage:

```text
GAME_FLOW_STORAGE=github
GAME_FLOW_GITHUB_REPO=MarkTurowetz/pop-party
GAME_FLOW_GITHUB_BRANCH=game-data
GAME_FLOW_GITHUB_PATH=game-flow.json
GAME_CONSTANTS_GITHUB_PATH=game-constants.json
STAGE_LAYOUTS_GITHUB_PATH=stage-layouts.json
CONTROLLER_LAYOUTS_GITHUB_PATH=controller-layouts.json
HOST_AUDIOS_GITHUB_PATH=host-audios.json
ART_MANIFEST_GITHUB_PATH=art-manifest.json
```

Set `GAME_FLOW_GITHUB_TOKEN` in Render as a secret environment variable. Use a
fine-grained GitHub token with Contents read/write access to this repository.
When that token is present, the app automatically uses GitHub flow storage unless
`GAME_FLOW_STORAGE=local` is explicitly set. The app writes flow edits to the
`game-data` branch so saving flow data does not trigger app redeploys from
`main`.

Local development still falls back to the ignored `game-flow.json` file unless
`GAME_FLOW_STORAGE=github` is set.

If a local clone shows an older or empty Flow Tool, sync the ignored local data
file from the durable `game-data` branch:

```bash
npm run sync-game-data
```

That command restores `game-flow.json` from `origin/game-data` and backs up the
previous local file under `game-flow.backups/`. To sync every supported ignored
tool data file from that branch, run:

```bash
npm run sync-game-data -- --all
```

Game constants, stage layouts, controller layouts, host audio sets, and Art
Manager composition data use the same durable storage layer. Open `/constants`
to edit values such as the `playerColors` list used for random unique player
colors. Art Manager saves composition edits, including voting-card component
positions and colors, to `ART_MANIFEST_GITHUB_PATH` so deploys and app commits
do not reset them.

## Chrome Controller Spawner

An unpacked Chrome extension lives in `chrome-extension/`.

To install it locally:

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select the `chrome-extension` folder

Use it from an open Party Game Template stage or controller page. Enter a stage code, player names, and controller count, then spawn foregrounded controller windows sized to fit your monitor height. Use Sort Controllers to reposition active spawned windows into a top-right grid based on the order of names in the player list. The extension can also tap a random visible game option on every spawned controller, or close all spawned controller windows.

If the extension code changes, click Reload on the extension card in `chrome://extensions`. The Tap Random Option action uses Chrome's debugger input permission so it can send real mouse clicks to controller windows. It only taps elements marked with `data-controller-option`, not every visible button.

If this repo folder is renamed or moved, remove the old unpacked extension from `chrome://extensions` and load it again from the new `chrome-extension` folder path. Chrome tracks unpacked extensions by their local folder path.
