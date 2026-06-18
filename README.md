# Flip 7 Party

A server-backed Flip 7-style stage/controller party game.

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
```

Set `GAME_FLOW_GITHUB_TOKEN` in Render as a secret environment variable. Use a
fine-grained GitHub token with Contents read/write access to this repository.
The app writes flow edits to the `game-data` branch so saving flow data does not
trigger app redeploys from `main`.

Local development still falls back to the ignored `game-flow.json` file unless
`GAME_FLOW_STORAGE=github` is set.

## Chrome Controller Spawner

An unpacked Chrome extension lives in `chrome-extension/`.

To install it locally:

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select the `chrome-extension` folder

Use it from an open Flip 7 Party stage or controller page. Enter a stage code, player names, and controller count, then spawn foregrounded controller windows sized to fit your monitor height. Use Sort Controllers to reposition active spawned windows into a top-right grid based on the order of names in the player list. The extension can also tap a random visible game option on every spawned controller, or close all spawned controller windows.

If the extension code changes, click Reload on the extension card in `chrome://extensions`. The Tap Random Option action uses Chrome's debugger input permission so it can send real mouse clicks to controller windows. It only taps elements marked with `data-controller-option`, not every visible button.
