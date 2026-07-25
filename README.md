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

## Durable Authoring

Production Tools write one revisioned, game-owned content bundle through a
repository-scoped GitHub App:

```text
PARTY_GAME_CONTENT_STORE=github
PARTY_GAME_REMOTE_AUTHORING=enabled
PARTY_GAME_CONTENT_GITHUB_REPO=MarkTurowetz/pop-party-engine
PARTY_GAME_ADMIN_AUTH_MODE=github
PARTY_GAME_RUNTIME_CAPABILITIES=required
```

The GitHub App exchanges its private key for rotating installation tokens; a
personal access token is neither accepted nor required by this mode. Flow,
constants, stage layouts, controller layouts, Host Audio, art compositions, and
content-addressed art/audio blobs are committed atomically. A failed ref update
leaves the previous complete draft authoritative.

### Template Session Preview

Public rooms always pin the immutable active release. Authenticated authors
create a draft preview room with `POST /api/admin/preview-rooms`; that room pins
the latest complete draft once and never changes underneath a running session.
New saves affect only later preview rooms. Publishing changes only new public
rooms. Generated games must configure their own repository and credentials.

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
