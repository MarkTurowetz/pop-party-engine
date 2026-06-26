# Frontend Migration Baseline

This document captures the Phase 0 safety baseline for the frontend migration.
It is intentionally descriptive: the first phase should preserve behavior and add
checks before Vite, TypeScript, route splitting, or React are introduced.

## Branch Policy

- `main` remains the source of truth for production work.
- Migration work starts from the local `frontend-migration` integration branch.
- Phase work should happen on short-lived branches such as
  `codex/frontend-migration-phase-0-safety`.
- Migration branches should pull from `main` regularly and should not push
  directly to `main`.
- Production Render should continue to track `main` unless a separate staging
  service is explicitly created.
- Migration testing should use local storage or isolated test storage, not
  production GitHub-backed JSON write paths.

Note: Git cannot keep both a branch named `frontend-migration` and branches named
`frontend-migration/<phase>` at the same time, because refs are path-like. Keep
`frontend-migration` as the integration branch and use non-conflicting phase
branch names.

## Current Route Behavior

The Node server still owns routing and serves `index.html` as the shared browser
shell for all non-API GET and HEAD requests.

- `/api/health` returns JSON with `{ ok: true, rooms }`.
- `/stage` serves the shared shell and the browser boot script activates the
  stage surface.
- `/controller` serves the shared shell and the browser boot script activates the
  controller surface.
- `/`, `/?tool=flow`, `/?tool=layout`, `/?tool=art`, `/?tool=constants`, and
  `/?tool=host-audio` serve the shared shell and tool dashboard.
- `/client/*` and `/shared/*` serve static browser scripts directly from the
  repository.
- `/api/game-flow`, `/api/stage-layouts`, `/api/controller-layouts`,
  `/api/art-assets`, `/api/game-constants`, and `/api/host-audios` are the
  baseline read-side endpoints for tool data.

## Current Script Load Order

The source `index.html` keeps the full legacy script list as a fallback during
the migration. The Node shell renderer now replaces that block per route using
`client/app/legacy/script-manifest.json`.

The original shared shell loaded 85 external browser scripts in this order:

```txt
/shared/color-utils.js
/shared/game-constants-schema.js
/client/utils.js
/client/stage/visual-object.js
/client/stage/game-object.js
/client/text-fit.js
/client/stage/stage-text-renderer.js
/client/layout-game-object-runtime.js
/client/layout-runtime.js
/shared/text-answer-action-config.js
/shared/microphone-access-action-config.js
/shared/choice-input-action-config.js
/shared/flow-action-registry.js
/shared/art-component-schema.js
/client/stage/action-runners.js
/client/stage/wipe-controller.js
/client/stage/visual-controllers.js
/client/stage/player-roster-renderer.js
/client/stage/debug-panel.js
/client/stage/art-object-visuals.js
/client/stage/widget-art-bindings.js
/client/stage/widget-art-renderer.js
/client/stage/voting-card-visuals.js
/client/stage/render-orchestrator.js
/client/qr-code.js
/client/stage-runtime.js
/client/controller-module-cache.js
/client/controller-text-renderer.js
/client/controller-view-state.js
/client/controller-avatar-view.js
/client/controller-microphone-access-view.js
/client/controller-recording-lifecycle.js
/client/controller-voice-input.js
/client/controller-choice-input-view.js
/client/controller-text-input-view.js
/client/controller-lobby-view.js
/client/controller-global-action-view.js
/client/controller-state-runtime.js
/client/controller-submit-api.js
/client/controller-setup-bindings.js
/client/controller-heartbeat-runtime.js
/client/controller-session-runtime.js
/client/controller-action-bindings.js
/client/controller.js
/client/tool-affordances.js
/client/color-control.js
/client/art-component-tree.js
/client/art-tool-ui.js
/client/art-sidebar-renderer.js
/client/art-component-editor.js
/client/editable-art-renderer.js
/client/art-tool.js
/client/tool-dashboard.js
/client/host-audio-tool.js
/client/tool-history.js
/client/flow/action-options.js
/client/flow/action-summary.js
/client/flow/action-defaults.js
/client/flow/form-controls.js
/client/flow/decision-controls.js
/client/flow/action-control-groups.js
/client/flow/action-inspector-registry.js
/client/flow/node-view-wires.js
/client/flow/node-wire-planner.js
/client/flow/node-view-minimap.js
/client/flow/node-graph-schema.js
/client/flow/node-branch-descriptors.js
/client/flow/moment-route-node-types.js
/client/flow/node-view-ports.js
/client/flow/node-view-child-sort.js
/client/flow/node-connection-planner.js
/client/flow/node-view-connections.js
/client/flow/node-view-drag.js
/client/flow/node-view-marquee.js
/client/flow/node-view-inspector.js
/client/flow/moment-route-graph.js
/client/flow/moment-route-renderer.js
/client/flow/moment-route-wires.js
/client/flow/action-node-renderer.js
/client/flow/action-node-wires.js
/client/flow-node-view.js
/client/flow-tool.js
/client/constants-tool.js
/client/layout-art-preview-renderer.js
/client/layout-tool.js
```

## Phase 0 Drill Tests

Run the current baseline checks with:

```bash
npm run check
```

That command runs:

- `npm run check-text-rendering`
- `npm run smoke:routes`

The route smoke test starts `node server.js` on a local ephemeral port, forces
local storage, only performs GET requests, and validates:

- `/api/health`
- `/stage`
- `/controller`
- main tool shell
- Flow Tool data through `/api/game-flow`
- Layout Tool data through `/api/stage-layouts` and `/api/controller-layouts`
- Art Manager data through `/api/art-assets`
- Constants Tool data through `/api/game-constants`
- Host Audio Tool data through `/api/host-audios`

## Phase 0 Done Criteria

- Local safety tag exists: `pre-frontend-migration-20260626`.
- Local integration branch exists: `frontend-migration`.
- Phase branch exists: `codex/frontend-migration-phase-0-safety`.
- Baseline route/tool-data smoke tests exist.
- Current shared shell and script order are documented.
- No storage format changes were made.
- No frontend architecture changes were made yet.

## Phase 2 Route Script Split

The first route-shell split keeps the shared HTML body but lets the server choose
the legacy script list by route:

- `/stage`: shared foundation + stage runtime + app shell.
- `/controller`: shared foundation + controller runtime + app shell.
- `/flow`: shared foundation + tool foundation + Flow Tool + app shell.
- `/tools`: full legacy dashboard payload + app shell.

Browser audit after the split:

```txt
/stage       27 scripts, stage runtime only, 0 fresh console errors
/controller  33 scripts, controller runtime only, 0 fresh console errors
/tools       86 scripts, full dashboard payload, 0 fresh console errors
/flow        46 scripts, Flow Tool only, 0 fresh console errors
```

Two hidden couplings were fixed while making this split:

- Controller layout text rendering now gets `layoutDefaultText` from
  `client/layout-runtime.js` instead of relying on `client/layout-tool.js`.
- Flow Tool `beforeunload` cleanup now checks optional dirty helpers before
  calling them, so direct `/flow` does not require Layout or Host Audio tool
  scripts.

## Phase 2 CSS Split

The legacy inline stylesheet has been extracted from `index.html` and split into
served CSS files:

```txt
client/styles/legacy/base.css
client/styles/legacy/stage-runtime.css
client/styles/legacy/controller-runtime.css
client/styles/legacy/tools.css
client/styles/legacy/responsive.css
```

The source shell keeps `/client/styles/legacy-shell.css` as a fallback marker,
and the Node shell renderer replaces it with route-specific stylesheet links:

```txt
/stage       base + stage-runtime + responsive
/controller  base + stage-runtime + controller-runtime + responsive
/flow        base + tools + responsive
/tools       base + stage-runtime + controller-runtime + tools + responsive
```

`stage-runtime.css` still contains shared player/avatar styles used by the
controller runtime. A later cleanup can split those into a smaller shared runtime
stylesheet once the route shells are fully separated.

Browser audit after the CSS split:

```txt
/stage       3 stylesheets, 27 scripts, 0 fresh console errors
/controller  4 stylesheets, 33 scripts, 0 fresh console errors
/tools       5 stylesheets, 86 scripts, 0 fresh console errors
/flow        3 stylesheets, 46 scripts, 0 fresh console errors
```

## Phase 3 API And Context Foundation

The first typed client API layer has been added without changing the legacy
runtime path:

```txt
client/types/game-data.ts
client/api/http.ts
client/api/gameDataApi.ts
client/api/flowApi.ts
client/api/layoutApi.ts
client/api/artApi.ts
client/api/constantsApi.ts
client/api/hostAudioApi.ts
client/app/context/createRuntimeContext.ts
client/app/context/createToolAppContext.ts
```

The Vite entries now construct explicit contexts for their surface:

```txt
stage/controller -> createRuntimeContext
tools/flow/layout/art/constants/host-audio -> createToolAppContext
```

This is intentionally additive. Legacy browser scripts still use the current
global helpers while future migrated entries can use typed API/context imports.

## Phase 4 JSON Boundary Validation Start

The typed client API layer now validates core response shapes before returning
data to migrated entries:

```txt
client/api/validators.ts
client/api/validators.test.ts
```

Validated read boundaries:

```txt
/api/health
/api/game-flow
/api/stage-layouts
/api/controller-layouts
/api/art-assets
/api/game-constants
/api/host-audios
```

Vitest has been added as the unit-test runner, and `npm run check` now runs:

```txt
tsc --noEmit
vitest run
node checks/check-text-rendering.js
node checks/smoke-routes.js
```

This is still dependency-light validation rather than a final schema system.
The validators are intentionally structural and focused on catching malformed
API boundaries before migrated tools consume them.

## Vite Build Asset Serving

The Node server can now serve Vite build output without switching legacy routes
over to bundled entries yet:

```txt
vite build -> dist/client/assets/*
/assets/<file> -> dist/client/assets/<file>
```

The `/assets/*` route is intentionally narrow:

- It serves only single-file asset names emitted inside `dist/client/assets`.
- Malformed nested asset paths return `404` instead of falling through to the
  app shell.
- Existing `/client/*`, `/shared/*`, `/art/*`, `/stage`, `/controller`, and tool
  routes keep their current behavior.

`npm run check` now builds Vite assets and runs `checks/check-vite-assets.js` to
confirm the server can serve an emitted chunk.

## Opt-In Vite Route Boot

Vite entries can now boot the existing legacy routes:

```txt
client/app/legacy/loadLegacySurface.ts
```

The bridge keeps current behavior by default:

```txt
/stage       -> classic route-specific script tags
/controller  -> classic route-specific script tags
/flow        -> classic route-specific script tags
/tools       -> classic route-specific script tags
```

Opt-in Vite boot is available in two ways:

```txt
/stage?vite=1
/controller?vite=1
/flow?vite=1
/tools?vite=1

PARTY_GAME_USE_VITE_ENTRIES=1 node server.js
```

In Vite mode, the server emits one built module entry from the Vite manifest.
That module then loads the legacy scripts sequentially and runs the same
`client/app/legacy/app-shell.js` boot layer. This gives the migration a real
module-entry path while preserving the current legacy runtime.

Browser audit with `PARTY_GAME_USE_VITE_ENTRIES=1`:

```txt
/stage       built stage entry, 27 legacy scripts loaded by bridge, 0 fresh console errors
/controller  built controller entry, 33 legacy scripts loaded by bridge, 0 fresh console errors
/flow        built Flow Tool entry, 46 legacy scripts loaded by bridge, 0 fresh console errors
/tools       built tools entry, 86 legacy scripts loaded by bridge, 0 fresh console errors
```

## Vite Route Shell Trimming

Vite mode now renders route-specific body markup while classic mode keeps the
full shared `index.html` body. This keeps the production-safe default unchanged
and gives migrated entries a smaller DOM boundary:

```txt
/stage?vite=1       stage screen only
/controller?vite=1  controller screen only
/flow?vite=1        Flow Tool screen only
/tools?vite=1       dashboard nav + tool screens
```

The same trimming applies when `PARTY_GAME_USE_VITE_ENTRIES=1` is enabled.
`checks/check-vite-assets.js` verifies both the built Vite entry script and the
expected route shell contents, including that legacy `/stage` still carries the
full shared body by default.

## Flow Tool Serialization Extraction

The Flow Tool migration has started with save-shape serialization, not UI
rewrites:

```txt
client/tools/flow/flowSerialization.ts
client/tools/flow/flowSerializationAdapter.ts
client/tools/flow/flowSerialization.test.ts
```

The TypeScript serializer preserves the current compatible saved shape:

- states are serialized with recursively serialized actions.
- each action gets a `subActions` array, matching legacy output.
- route nodes are delegated to the existing moment-route graph serializer.

Vite Flow entries install a temporary `window.PartyGameFlowSerialization`
adapter before loading the legacy Flow Tool scripts. Classic routes keep the
legacy fallback serializer in `client/flow-tool.js`, so default behavior remains
unchanged while Vite mode starts using an explicit module boundary.
