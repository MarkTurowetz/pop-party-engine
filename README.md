# Party Game Template

A server-backed toolkit for building stage/controller party games. Use it as the core package for future games: stages, controllers, durable game flow data, art management, constants, layouts, and controller-spawning tools are all part of the template.

The repository is being separated into the public MIT-licensed
`@pop-party/engine`, the public `@pop-party/create-game` generator, and a thin
reference application. Generated games own independent copies of their flow,
layouts, prompts, art, audio, constants, and starter blobs. See `PLAN.md` for
the locked extraction and Flip 7 cutover plan.

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

- Build command: `npm run build`
- Start command: `node server.js`
- Health check path: `/api/health`

The included `render.yaml` defines the same settings as a Render Blueprint.
`npm run build-info` also rebuilds the Vite client assets before stamping
`build-info.json`, so older Render services still configured to call
`build-info` deploy the current tool UI instead of reusing stale bundles.

## Durable Game Flow Storage

The flow editor does not rely on the deployed server filesystem. In production,
game flow data is stored through a pluggable storage layer. The Render blueprint
is configured to use GitHub-backed storage:

```text
GAME_FLOW_STORAGE=github
GAME_FLOW_GITHUB_REPO=MarkTurowetz/pop-party-engine
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

### Template Session Preview

The reference service at `pop-party.onrender.com` runs in
`latest-saved-authoring` session mode. Its Tools remain connected to the
template's durable authoring sources. A room snapshots the latest complete
saved flow, constants, stage/controller layouts, host audio, art manifest, and
art blobs when the room is created or a game returns to the lobby. Tool saves
and unsaved Tool drafts never rewind or replace a game already in progress.

Refreshing a browser hydrates the existing room and does not replay flow
actions. Quitting, completing a game, or creating a new room starts a fresh
session from the latest saved authoring snapshot. If that snapshot is missing
or invalid, the new session stops with a runtime diagnostic instead of using
the preceding room pin or the packaged starter content.

Generated games do not inherit this reference-only preview behavior. They use
immutable published release pins by default and opt into newer exact
`@pop-party/engine` versions independently.

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
