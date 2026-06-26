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

## Flow Tool Selector Extraction

The next Flow Tool model slice moved pure lookup/name helpers into TypeScript:

```txt
client/tools/flow/flowSelectors.ts
client/tools/flow/flowSelectorsAdapter.ts
client/tools/flow/flowSelectors.test.ts
```

The extracted selectors cover:

- state lookup.
- action, sub-action, and decision-branch lookup.
- legacy Flow ID normalization.
- action type display names.
- duplicate-safe action naming.

Vite Flow entries install `window.PartyGameFlowSelectors` before loading the
legacy scripts. The legacy functions still contain their original fallback
logic, so classic routes continue to work without a build while Vite mode uses
the typed selector module.

The selector module now also owns small option-list builders used by Flow
inspectors:

- action target options.
- next-moment state target options, with legacy route-target extension hook.
- controller layout options.

The selector module also owns layout game-object target helpers now:

- placed layout element filtering for moment/global scopes.
- target labels and serialized target values.
- target option lists that preserve missing legacy selections.
- target-name lookup across current moment, global layout, and other moments.

These helpers take `stageLayouts` and `selectedFlowStateId` explicitly so they
can be tested without reaching into the legacy Flow Tool globals.

## Flow Tool Decision Helper Extraction

Decision-branch model helpers now live in TypeScript:

```txt
client/tools/flow/flowDecision.ts
client/tools/flow/flowDecisionAdapter.ts
client/tools/flow/flowDecision.test.ts
```

The extracted helpers cover:

- decision variable display labels.
- decision branch id generation.
- legacy branch normalization into hit/code/no-match rows.
- branch lookup, display names, and wire labels.

Vite Flow entries install `window.PartyGameFlowDecision` before loading the
legacy scripts. The legacy functions keep inline fallbacks for classic routes.

## Flow Tool Action Factory Extraction

Default Flow action creation has moved into a typed module:

```txt
client/tools/flow/flowActions.ts
client/tools/flow/flowActionsAdapter.ts
client/tools/flow/flowActions.test.ts
```

The extracted factory preserves the current legacy defaults for top-level
actions and sub-actions, including ID shape, timing mode, default text fields,
and `subActions: []`. Vite Flow entries install `window.PartyGameFlowActions`
before loading the legacy scripts; classic routes keep the inline fallback.

The same action module now owns `ensureActionTiming`, including legacy timing
normalization for standard actions, input actions, and sub-actions. `FlowTiming`
accepts loose `seconds` values at the TypeScript boundary because the normalizer
is responsible for coercing saved/browser data to non-negative numbers.

## Flow Tool Mutation Helper Extraction

The first mutation-oriented Flow Tool slice now lives in TypeScript:

```txt
client/tools/flow/flowMutations.ts
client/tools/flow/flowMutationsAdapter.ts
client/tools/flow/flowMutations.test.ts
```

This covers additive model changes only:

- create and append default game states.
- insert default top-level actions after the selected primary action.
- insert default sub-actions after the selected sub-action.

The legacy UI still owns history, selection, collapsed state, rendering, and
save behavior. Vite Flow entries install `window.PartyGameFlowMutations`; classic
routes keep inline fallbacks so the default no-build route remains compatible.

The same module now also owns action-list delete helpers:

- flatten top-level action, sub-action, and decision branch ids.
- remove selected top-level actions, sub-actions, and decision branches.

State deletion, layout cleanup, route-node deletion, and render/selection side
effects still remain in the legacy Flow Tool while the model layer is extracted
incrementally.

## Flow Tool Name And History Helper Extraction

Two more small Flow Tool dependencies now route through typed modules in Vite
mode:

- state and action target display-name helpers live in the selector module.
- undo/redo history snapshot creation and parsing live in the serialization
  module.

`client/flow-tool.js` and `client/flow-node-view.js` delegate to the temporary
Vite adapters when they are present, while classic routes keep inline fallbacks.
The history snapshot helper uses the same compatible save shape as the Flow save
serializer, including route-node serialization through the legacy graph helper.

## Flow Tool Delete Mutation Extraction

The mutation module now owns the pure model pieces behind Flow deletes:

- protected-state delete filtering.
- state removal with next-selection calculation.
- layout state pruning for deleted Flow states.
- route branch removal with `noMatch` branch protection.
- route-node removal from the current moment graph list.

The legacy Flow Tool still owns history timing, UI selection, graph target
cleanup, rendering, and layout-tool refreshes. Vite mode delegates the data
mutations through `window.PartyGameFlowMutations`; classic routes keep inline
fallbacks for the same behavior.

## Tool Context And Flow API Bridge

Vite tool entries now install the explicit tool app context for legacy scripts:

```txt
client/app/context/toolContextAdapter.ts
```

`/flow` and `/tools` expose `window.PartyGameToolContext` before booting the
legacy scripts. Flow Tool load, save, and local-draft publishing use the typed
Flow API wrapper from that context when available, while classic routes keep the
raw `getJson`/`postJson` fallback path.

The Flow API wrapper also has separate validation for the smaller save response
returned by `POST /api/game-flow`, so migrated code validates the server's
actual read and save contracts instead of assuming both endpoints return the
same payload shape.

## Flow Tool Reorder Mutation Extraction

The mutation module now owns the pure drag/drop reorder operations for Flow
lists:

- move Flow states before or after a target state.
- move top-level actions within a state.
- move sub-actions within their parent action.

The legacy Flow Tool still owns drag event parsing, history snapshots, selection
updates, collapsed-state behavior, and rerendering. Vite mode delegates the
splice/reorder work through `window.PartyGameFlowMutations`; classic routes keep
inline fallbacks.

## Flow Tool Editor Mutation Extraction

The mutation module now also owns small editor commands that were previously
inline in the legacy Flow editor:

- rename Flow states while preserving protected legacy IDs.
- update next-moment, entry-action, and voting-source fields.
- refresh an action name through the existing action-type name resolver.

History capture, form controls, rerendering, and publish behavior remain in the
legacy Flow Tool. This keeps the current UI stable while giving the later React
editor store explicit mutation commands to call.

## Flow Tool Route Graph Model Extraction

The route graph now has a typed model helper module:

```txt
client/tools/flow/flowRouteGraph.ts
client/tools/flow/flowRouteGraphAdapter.ts
client/tools/flow/flowRouteGraph.test.ts
```

The extracted helpers cover:

- moment-entry node creation.
- route-action node creation.
- clearing Flow state, route node, decision-branch, and route-action target
  references when a target is deleted.

Vite Flow entries install `window.PartyGameFlowRouteGraph` before loading the
legacy graph scripts. The legacy `moment-route-graph.js` still owns graph
queries, target option labels, serialization, and rendering-facing behavior, but
delegates the pure model mutations to the typed helper when available.
