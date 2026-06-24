# Party Game Template Architecture

This project began as a fast prototype with most behavior inside `server.js` and `index.html`.
The long-term direction is to keep the same simple deployment model while moving stable
concepts into focused modules.

## Current Module Boundaries

- `server.js`
  - HTTP routing, room lifecycle, game runtime orchestration, and persistence wiring.
  - This is still the largest file and should keep shrinking over time.
- `server/`
  - Server-only helpers that do not need browser access.
  - `action-completion-runtime.js` owns action completion timing and callback/start-timer guard rules,
    using `shared/flow-action-registry.js` for input cleanup metadata.
  - `action-effect-state-runtime.js` owns room action-effect id tracking.
  - `app-version.js` owns build/version lookup.
  - `controller-input-payload-runtime.js` owns controller choice/vote/text input payload setup.
  - `controller-submit-handlers-runtime.js` owns controller choice/vote/text answer submission endpoints.
  - `countdown-runtime.js` owns countdown timer clearing and starting-phase countdown scheduling.
  - `controller-layout-normalization-runtime.js` owns controller layout collection normalization.
  - `controller-layout-state-runtime.js` owns default controller layout state creation for flow states.
  - `art-assets-runtime.js` owns Art Manager manifest handling, art replacement validation,
    and art file responses.
  - `decision-action-normalization-runtime.js` owns decision branch/operator/value normalization.
  - `flow-action-public-runtime.js` owns public flow action serialization and room text interpolation.
  - `game-flow-normalization-runtime.js` owns flow, action, timing, and node-position normalization.
  - `flow-navigation-runtime.js` owns runtime flow lookup, action index lookup, and entry action selection.
  - `flow-state-kind-runtime.js` owns flow-state kind predicates and action-type scanning.
  - `flow-target-runtime.js` owns flow action target normalization for none/return/action-id targets.
  - `game-constants-runtime.js` owns game constants normalization.
  - `game-flow-merge-runtime.js` owns save-time flow merging that preserves existing sub-actions.
  - `github-storage-runtime.js` owns generic GitHub JSON content reads/writes.
  - `http-utils.js` owns JSON responses, request body parsing, and content type lookup.
  - `inactive-player-sweep-runtime.js` owns controller heartbeat timeout sweeps.
  - `input-state-runtime.js` owns shared choice/text input reset state and submission-completion checks.
  - `layout-normalization-runtime.js` owns shared layout state/element normalization and element deduping.
  - `layout-sync-runtime.js` owns syncing saved stage/controller layout states to the active flow.
  - `lobby-control-handlers-runtime.js` owns lobby fetch, quit-to-lobby, and present-hi endpoints.
  - `lobby-payload-runtime.js` owns lobby/stage snapshot payloads and debug action summaries.
  - `local-json-store.js` owns local JSON file read/write, backups, and mirror writes.
  - `local-draft-runtime.js` owns unsaved tool draft storage endpoints and room refreshes.
  - `network-urls-runtime.js` owns LAN URL discovery for startup logging.
  - `player-public-runtime.js` owns player serialization for lobby/controller payloads.
  - `player-session-handlers-runtime.js` owns join, heartbeat, avatar selection, and leave endpoints.
  - `player-state-runtime.js` owns player avatar helpers, active-player filtering, and VIP selection.
  - `room-action-effects-runtime.js` owns one-time room action-effect dispatch; effect behavior
    lives on descriptors in `shared/flow-action-registry.js`.
  - `room-state-runtime.js` owns default room construction and room lookup helpers.
  - `save-handlers-runtime.js` owns common tool save endpoint handling and response shaping.
  - `stage-action-handlers-runtime.js` owns stage action completion/effect callback endpoints,
    using registry metadata for stage-completable action types.
  - `stage-events-runtime.js` owns stage SSE connection setup, heartbeat, and cleanup.
  - `stage-layout-normalization-runtime.js` owns stage layout collection normalization and migration.
  - `stage-layout-state-runtime.js` owns default stage layout state creation for flow states.
  - `stage-test-config-handler-runtime.js` owns stage test-flow override endpoint handling.
  - `start-handlers-runtime.js` owns VIP start/cancel-start endpoint handling.
  - `static-files-runtime.js` owns app shell rendering and browser module file responses.
  - `tool-data-read-runtime.js` owns read-side tool data endpoint responses.
  - `tool-github-sources-runtime.js` owns GitHub JSON source wrappers and game-flow conflict retries.
  - `tool-source-readers-runtime.js` owns default/local JSON source loading for tool data.
  - `tool-source-stores-runtime.js` owns source-of-truth store object creation for tool data.
  - `trivia-content-runtime.js` owns trivia prompt cloning, random selection, and action content preparation.
  - `value-normalizers.js` owns reusable primitive value cleanup for ids, labels, colors, numbers, and text.
- `shared/`
  - Data and schema-like constants shared by server runtime and tools.
  - `flow-action-registry.js` owns flow action descriptors, including action type metadata,
    persisted action normalization, and public stage/controller serialization.
  - `game-constants-schema.js` owns shared custom game constant primitive/type
    normalization for the Constants Tool and server runtime.
  - `game-data.js` owns default layouts, default constants, prompts, avatar metadata,
    and art manifest metadata.
- `index.html`
  - Browser runtime for stage, controller, and tools.
  - This still needs a future split into stage/controller/tools modules.
- `client/`
  - Browser-side modules served directly by the Node server without a build step.
  - `client/stage/visual-object.js` owns the generic CSS visual object animation contract
    used by stage text and player answer bubbles.
  - `client/stage/game-object.js` owns the shared game-object wrapper that routes
    staged elements through a consistent visibility/default-state/animation API,
    including custom visual-object animation handlers for assets with bespoke motion.
    It also exposes `PartyGameVisualBridge.createVisualForTarget` and
    `PartyGameVisualBridge.playVisibilityForTarget`, the standard bridge for
    controllers/renderers that need a visual object backed by a game object with a
    legacy visual fallback.
  - `client/stage/art-object-visuals.js` owns rendered Art Manager component trees;
    each rendered component is backed by the shared game-object wrapper.
  - `client/stage/voting-card-visuals.js` owns voting card composition rendering and
    routes card groups, widgets, and voter badges through shared game objects.
  - `client/stage/wipe-controller.js` owns the global wipe as a game object with
    custom appear/disappear animation handlers.
  - `client/stage/action-runners.js` owns client-side stage action dispatch.
  - `client/tool-history.js` owns reusable undo/redo stack behavior for tools that
    can express state as a snapshot and restore function. Flow, layout, Constants,
    Host Audio, and editable Art compositions use this shared primitive instead of
    owning bespoke history stacks.
  - `client/tool-affordances.js` owns reusable tool UI affordances such as disclosure
    envelopes, collapse-all toggles, rectangle intersection, and marquee selection.
  - `client/tool-dashboard.js` owns the dashboard tool registry for labels, dirty checks,
    save behavior, screen hiding, and setup behavior.
  - `client/flow/action-control-groups.js` owns reusable Flow action inspector
    controls shared by List View and Node View, such as text, visibility, player-filter,
    bounded number, host-audio playback, and input-exit controls.
  - `client/flow/action-inspector-registry.js` owns action-specific Flow inspector
    composition so List View and Node View render from the same action control registry.
  - `client/flow/node-view-wires.js` owns Flow Node View SVG wire rendering,
    wire labels, preview wires, and graph-local pointer coordinate conversion.
  - `client/flow/node-view-minimap.js` owns Flow Node View minimap rendering,
    viewport positioning, minimap clicks, and minimap dragging.
  - `client/flow/node-view-ports.js` owns Flow Node View connection port DOM,
    dot metadata, and pending-connection arming callbacks.
  - `client/flow/node-view-child-sort.js` owns Flow Node View sub-action and
    decision-branch drag/drop ordering.
  - `client/flow/node-view-connections.js` owns Flow Node View pending connection
    state, preview redraw, command-create action creation, completion, and cleanup.
  - `client/flow/node-view-drag.js` owns Flow Node View node dragging, selected-group
    movement, axis locking, grid snapping, and drag-position persistence.
  - `client/flow/node-view-marquee.js` owns Flow Node View rectangle selection
    setup and selection-class synchronization.
  - `client/flow/action-summary.js` owns shared Flow Tool action summary text.

## Refactor Order

1. Move static data and pure helpers into `shared/`.
2. Move server-only utilities into `server/`.
3. Extract server flow/runtime logic into modules such as `server/flow-runtime.js`,
   `server/room-state.js`, `server/voting.js`, and `server/persistence/`.
4. Split browser code into static client modules under `client/`, keeping the current no-build
   Render deployment until a bundler becomes worth the complexity.
5. Move action behavior toward registry descriptors rather than scattered action-name
   conditionals. Server normalization, public serialization, room effects, stage-completion
  metadata, completion cleanup, and Flow Tool inspector fields now move through shared
  registries instead of separate action-name conditionals per surface.
6. Only after the boundaries are stable, introduce classes for concepts that carry behavior,
   such as visual game objects, controller views, and layout documents. Flow actions should
   usually stay as data plus registry strategy descriptors rather than large instantiated classes.

## Rules Of Thumb

- Game-authored data stays in JSON data files or GitHub-backed tool storage.
- Runtime code can change without overwriting tool-authored game data.
- New visible stage/controller elements should use `PartyGameVisualBridge.createVisualForTarget`
  or a registry-backed layout entity rather than calling `PartyGameVisualObject` directly.
  Direct visual-object creation should be limited to the bridge/core animation layer.
- Art Manager compositions are prefab/source assets. Stage layout entries are placed
  instances of those prefabs. Runtime visibility actions should target the layout
  instance identity (`targetLayoutScope` plus `targetLayoutElementId`), not the
  source art composition id.
- Placed layout art targets are resolved through the shared layout target resolver
  in `client/layout-runtime.js`. Stage and controller surfaces should plug into that
  resolver rather than building separate visibility/action lookup paths.
- Placed layout entities should be registered through the shared registration helper
  in `client/layout-runtime.js` so stage and controller GameObjects carry the same
  `isArt`, `isDynamic`, `isGlobal`, and `visibilityKey` semantics.
- Layout prefab instances should let the placed layout entity own park/appear/disappear.
  Their internal art tree is rendered into a ready `on` state by layout runtime so a
  parked source-root component does not make `Set Art Asset Shown` appear an empty host.
- Art Manager compositions carry a `surface` field (`stage` by default, `controller`
  reserved for controller-specific art) so future editor tabs can share the same
  composition schema rather than maintaining separate art systems.
- New flow action metadata and shared action shaping behavior belongs in
  `shared/flow-action-registry.js`.
- New server behavior should avoid growing `server.js` when it can live in a focused module.
- Large UI changes should eventually land in focused `client/` modules such as
  `client/stage/` or `client/controller/`. Avoid adding a literal `tools/` directory
  unless `.gitignore` is adjusted first.
- Cross-tool affordances such as undo/redo should live in shared tool primitives, then each
  tool should plug in its own snapshot/restore functions instead of owning bespoke stacks.
