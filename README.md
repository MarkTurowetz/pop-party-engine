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

The reference app has two Render delivery lanes:

- Preview: `https://pop-party-preview.onrender.com`
- Production: `https://pop-party.onrender.com`

Both use:

- Build command: `npm ci --no-audit --no-fund && npm run build-info:next`
- Start command: `node server.js`
- Health check path: `/api/health`

The included `render.yaml` defines both services as a Render Blueprint.
`npm run build-info:next` rebuilds the Vite client assets before stamping
`build-info.json` at least one build beyond the committed branch stamp. This
keeps Render's shallow checkout identity aligned with the full-history release
workflow instead of reusing a stale build number.

Every successful compatible `main` check deploys its exact commit to Preview
without publishing npm packages. Public engine releases publish immutable npm
artifacts and opt the reference Preview into its isolated release coordinates;
games then choose when to pin that exact version. Production remains disabled
from automatic deployment and moves only when the protected `publish` workflow
is explicitly dispatched with Production promotion enabled. The health endpoint
reports the application channel and exact commit so both workflows verify what
Render is actually serving. Configure the private
hooks as `RENDER_PREVIEW_DEPLOY_HOOK_URL` and `RENDER_DEPLOY_HOOK_URL`; see
[docs/deployment-lanes.md](docs/deployment-lanes.md) and
[.github/RELEASE_SETUP.md](.github/RELEASE_SETUP.md).

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

The reference template additionally opts into:

```text
PARTY_GAME_AUTHORING_MODE=live-prototype
```

In this single-author mode, unsaved Tool changes immediately update and reset
the template stage/controllers from one valid memory-only snapshot. A second
Tools tab is visibly read-only while the active authoring lease is busy, then
reattaches automatically after that lease closes. If a service restart or
heartbeat-lease expiry clears the server copy, that lease
cleanup never restarts an existing room or replays its moment animations. The
browser restores the latest explicitly saved complete JSON-and-binary workspace
from IndexedDB before the editors mount. A stale heartbeat or draft mutation
uses one workspace-level reconnect, republishes only unsaved browser models in
one atomic draft, and retries the mutation once. Clean models remain owned by
the durable baseline, so lease recovery does not publish a new room revision or
restart Lobby Art; lease failures are never reported as invalid game content.
Save validates and checkpoints that
complete workspace locally first, so the author can continue immediately while
Git sync runs in the background. The dashboard distinguishes browser-local saves from
Git-synced saves and provides explicit `Sync Now` and `Restore from Git` actions.
Ordinary refreshes preserve the browser checkpoint; Restore from Git is the
destructive reset. The durable Git commit reuses unchanged blobs and uploads
only changed files with bounded concurrency. Browser-local work is scoped to one
browser/device until Git sync succeeds. Independent games must opt in separately
and provide their own GitHub App, repository, OAuth, and release refs.

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
