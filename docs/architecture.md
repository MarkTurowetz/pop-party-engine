# Party Game Template Architecture

This project began as a fast prototype with most behavior inside the root server and `index.html`.
The long-term direction is to keep the same simple deployment model while moving stable
concepts into focused modules.

## Current Module Boundaries

- `server.js`
  - Compatibility launcher only; it invokes the explicit application startup factory exported by `apps/reference/server.js`.
- `apps/reference/server.js`
  - Thin game-owned wrapper around `@pop-party/engine/server/application`.
  - Supplies only the reference game definition and its independent content/workspace roots.
- `apps/reference/game.config.js`
  - Bundle-mode application definition with no embedded runtime data.
- `apps/reference/server/`
  - Compatibility exports for older local imports. Canonical application and authoring behavior lives in the engine package.
- `packages/engine/src/server/game-application-runtime.js`
  - Owns the complete public generated-game application used by `pop-party start` and `pop-party dev`.
  - It validates and pins the complete active release before the service port opens.
  - Stage, controller, room lifecycle, and authenticated core tools are engine-owned and render game-owned bundle content.
  - Optional game plugin contributions are additive; generated games do not recreate core routes or browser applications.
- `packages/engine/src/server/authoring-session-content-runtime.js`
  - Provides the explicit reference-app `latest-saved-authoring` session mode.
  - Builds one validated bundle snapshot from the same durable sources used by the Tools.
  - Keeps an active room immutable, then atomically installs the cached latest saved snapshot at a lobby/session boundary.
  - Missing data, blobs, or release validation stop the new session; the prior pin is never used as a fallback.
  - Generated games remain on the default `published-release` mode unless their application explicitly opts in.
- `packages/engine/src/server/live-prototype-workspace-runtime.js`
  - Provides the opt-in single-service `live-prototype` authoring mode.
  - Builds one complete memory-only working snapshot from every Tool draft and atomically installs only valid snapshots into the project's rooms.
  - Resets rooms to the lobby when the working revision changes while retaining joined-player identity.
  - Rejects destructive second-tab replacement and lets a still-open editor re-establish its session after a restart or heartbeat-lease expiry.
  - Treats heartbeat expiry, page exit, and unchanged session recovery as editor-lease bookkeeping: they never re-enter an existing Lobby, replay `Start Moment`, or restart widget animations. Cleanup queues the Git baseline for the room's next session boundary; only an explicit Restore from Git resets the current preview.
  - Validates and serializes the complete JSON-and-binary working snapshot as a browser IndexedDB checkpoint before Save returns; this local checkpoint is the refresh/restart recovery boundary.
  - Restores that checkpoint before Tool editors mount, including content-addressed art/audio blobs, and rejects automatic recovery if its Git baseline conflicts with a newer active release.
  - Synchronizes the latest local checkpoint to Git asynchronously through one release-ref compare-and-swap. Edits made while an older checkpoint is syncing remain installed and queue the newer checkpoint next.
  - Exposes explicit `Sync Now` and destructive `Restore from Git` actions. A normal refresh preserves local work, while Restore discards the checkpoint and reloads the Git baseline.
  - Reuses unchanged Git blob ids from the active content commit, uploads only changed blobs with bounded concurrency, and marks mounted Tools saved after the local checkpoint instead of waiting for Git or forcing a browser reload.
- `packages/engine/src/server/content-migration-runtime.js`
  - Resolves only explicit namespaced game-plugin migrations, requires a contiguous one-level path, and rejects downgrades.
  - Runs every step twice against the same immutable source and blocks output when the resulting revisions differ.
  - Produces a new snapshot with parent-revision metadata; it never mutates or publishes the source snapshot.
- `packages/engine/src/tooling/game-migration-runtime.js`
  - Validates the complete migrated snapshot as a candidate release and optionally writes it atomically to a new game-local directory.
  - Refuses traversal, workspace replacement, and non-empty destinations.
- `packages/engine/src/tooling/development-workspace-runtime.js`
  - Seeds ignored `.pop-party/content` once from the configured immutable release and validates it as an independent local bundle.
  - Existing development content is reused rather than silently refreshed from production.
  - The generated game config accepts the scoped `POP_PARTY_CONTENT_ROOT` override only when it resolves inside that game's workspace; the loader restores the process environment immediately after config evaluation.
- Generated game deployment
  - `render.yaml` owns exactly one manually scaled Node web service (`numInstances: 1`) with engine build/start commands and `/health` readiness.
  - `DEPLOYMENT.md` records the single-replica in-memory-room constraint and keeps provider/OAuth credentials out of source.
- Reference application deployment
  - The persistent Preview service is the everyday code-testing lane. A successful `main`
    check deploys its exact commit without publishing npm packages or changing production.
  - The Production service retains the immutable npm/GitHub/content release tuple and its
    protected manual approval. A production release refreshes Preview after coordinating a
    new engine version so the two services cannot remain engine-incompatible.
  - `/api/health` exposes the non-secret application version, commit, branch, and deployment
    channel used by exact-commit preview verification.
- `server/`
  - Server-only helpers that do not need browser access.
  - `action-completion-runtime.js` owns action completion timing and callback/start-timer guard rules,
    using `shared/flow-action-registry.js` for input cleanup metadata.
  - `action-effect-state-runtime.js` owns room action-effect id tracking.
  - `app-version.js` owns build/version lookup.
  - `controller-input-payload-runtime.js` owns controller choice/vote/text input payload setup.
  - `controller-submit-handlers-runtime.js` owns controller choice/vote/text answer submission endpoints.
  - `countdown-runtime.js` owns countdown timer clearing and starting-phase countdown scheduling.
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
  - `layout-sync-runtime.js` owns syncing saved stage/controller layout states to the active flow.
  - `lobby-control-handlers-runtime.js` owns lobby fetch and quit-to-lobby endpoints.
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
  - `stage-test-config-handler-runtime.js` owns stage test-flow override endpoint handling.
  - `start-handlers-runtime.js` owns VIP start/cancel-start endpoint handling.
  - `static-files-runtime.js` owns app shell rendering and browser module file responses.
  - `tool-data-read-runtime.js` owns read-side tool data endpoint responses.
  - `tool-github-sources-runtime.js` owns compatibility GitHub JSON source wrappers. Stale SHA
    conflicts fail visibly and are never reloaded and retried as an overwrite.
  - `github-git-data-runtime.js` owns immutable Git blob/tree/commit operations and compare-and-swap
    branch updates for the revisioned content provider.
  - `github-content-bundle-store.js` persists complete bundle snapshots on content/draft refs and
    advances a separate active-release record only through expected-revision compare-and-swap.
    Atomic workspace commits reuse unchanged content blobs and upload changed blobs with bounded
    concurrency. Its draft, publish, and rollback idempotency records survive server restarts.
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
  - `controller-layout-states.js` owns the semantic controller layout ids and the choice/text
    input-to-layout routing shared by the server, controller runtime, and Layout Tool.
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
  - `client/runtime/stageWipeController.ts` owns the global wipe action routing.
    `Wipe Widget MC` is only an `On`/`Off` gate; the controller explicitly invokes
    `Appear` or `Disappear` on its labeled `Wipe Art MC` child and waits only for
    that child's authored callback. No CSS fallback motion runs alongside it.
  - The global presentation click prompt is owned exclusively by the active
    `Present Text` action. Every new primary flow node silently clears the prompt
    before its action runs, and End Moment/quit cleanup clear it again as a
    boundary safeguard, so it cannot leak into later nodes or moments.
  - `Set Timer Shown` targets the placed `craftingtimer` layout GameObject, so its
    `Crafting Timer Widget MC` owns `Appear`/`Disappear` and the action callback.
    `CraftingTimerController` only updates the nested authored `timerValue` content
    and inherited `--timer-progress` value; it never plays lifecycle animations or
    writes to a legacy timer label DOM element.
  - Controller input views select semantic controller layouts rather than reusing their current
    stage phase. Layout placements start in their authored `On`/`Off` state; response-driven
    controls such as validation banners and completion messages may then be toggled fire-and-forget.
    A server-accepted, completed `submitOnce` choice or written-text answer routes through the
    Presentation layout as a buttonless submission confirmation (`You answered: …` or
    `You wrote: …`). Voting, voice capture, microphone permission, continuous selection, and
    unfinished inputs do not enter that confirmation state. The active input payload and the
    player's serialized `done` answer are the sole authority for this routing; it is not a game-flow
    action and cannot advance the flow.
    A controller with no active input or stage-click action uses the Presentation layout with one
    waiting message. It never falls back to an older moment-specific layout, because those retained
    authoring states may contain multiple historical controls that are not valid simultaneous runtime UI.
    Controller layout syncing adds Join, Lobby, and the semantic controller layouts without deleting
    any previously authored layout state. Runtime selection still uses semantic controller layout ids
    (or an explicit `Set Controller Layout` target), but Tool reads and saves are lossless: an older
    moment-specific or temporarily unreferenced layout remains editable and cannot disappear merely
    because the current flow does not select it.
  - Selector-backed Join and Lobby controls begin `controller-layout-hidden`. The active controller
    layout removes that gate only after it has positioned the host and attached authored art, so
    native HTML labels, inputs, and buttons cannot flash during initial load or room entry. Joining
    a room delegates directly to the controller state renderer without prematurely showing Lobby.
    Native `input`, `textarea`, and `select` children are always transparent interactive overlays
    above their host's pointer-transparent authored art. The native control exclusively owns its
    editable value, caret, focus, and hit testing; decorative field art must not duplicate or cover
    that runtime state.
  - Controller Layout Tool configuration tags are per-placement authoring metadata scoped to one
    controller view. The editor derives each view's searchable configuration list from its local
    elements and uses the selected tag only to filter the authoring preview. Tags do not change the
    runtime `On`/`Off` initial-state contract or switch controller state until a future explicit
    runtime action adopts that responsibility.
  - Controller button visuals use four authored prefab layers: the lifecycle wrapper owns
    `Off`/`On`/`Appear`/`Update`/`Disappear`; its interaction child owns
    `Default`/`Down`/`Up`/`HoverIn`/`HoverOut`; the next child owns the stopped `Default` and
    `Disabled` states; and the deepest prefab owns the actual button art. Pointer input may play
    interaction labels fire-and-forget, but CSS classes, timers, and controller reconciliation do
    not animate button transforms, opacity, filters, colors, or lifecycle state. Choice and vote
    grids reconcile native buttons by action/option identity across heartbeat renders instead of
    replacing their DOM nodes. The native button remains the pointer hit target while its authored
    art ignores pointer events, so `Down`/`Up` geometry cannot cancel a click in progress.
  - Controller states own selector-backed local action containers. Join, Lobby, Presentation, Paused,
    Text Input, Voice Input, and Microphone Access spawn a single `Controller Primary Button`
    instance inside the active container and dispose the prior state's instance before another
    controller layout mounts. `starting` reuses the Lobby container and updates that one instance
    from Start Game to Cancel; it never layers two button renderers on one host. A container positions
    the button but does not resize or clip it: the button keeps its authored composition dimensions,
    and lifecycle motion may extend beyond the container bounds. Voice recording is cancelled before
    its local button is disposed. Input views prepare their state-owned button before selector
    resolution so both migrated container placements and older button selectors resolve in the same
    layout pass. The
    Global Controller Layout must not own action messages or action buttons; it is reserved for
    genuinely persistent controller art.
  - Active writing controllers save revision-ordered text drafts as the native field changes.
    Drafts are scoped to the current game session and input visit, are never broadcast as submitted
    answers, and are cleared with the input lifecycle. When the authoritative crafting timer emits
    `timerEnd`, the server promotes each active player's latest nonblank draft through the normal
    stored-answer path before clearing the input; an empty field remains unanswered.
  - Selector-backed controller art fails closed. If its authored composition is unavailable, the
    native host stays `controller-layout-hidden` instead of exposing legacy HTML styling. A missing
    player always selects the authored Join layout, even while an older room snapshot still names a
    different controller layout.
  - `client/stage/action-runners.js` owns client-side stage action dispatch.
    Controller-held input actions use one shared non-completing stage runner. Multiple choice,
    trivia, text, voice, microphone permission, and answer voting remain active until an
    authoritative controller/server input event selects their authored exit target; the stage
    neither advances them nor treats their intentionally idle renderer as a missing runner.
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
- Lifecycle MCs with an authored `Off` label are constructed at `Off`. Semantic/base prefabs
  without `Off` initialize at their authored default state and are gated by their animated parent;
  the renderer must not synthesize a legacy CSS `Off` for them. Rendering and reconciliation may
  inject dynamic content, colors, and data, but must not infer or assign lifecycle state,
  visibility, opacity, scale, or motion. The owning game object must explicitly play `Appear`,
  `On`, `Update`, `Disappear`, or `Off` after its content is ready; authored timeline commands are
  the sole authority for how those lifecycle states look and when their component trees become visible.
  Timeline `setVisible` commands are instantaneous state boundaries: generic CSS opacity/scale
  transitions must not continue before or after the authored timeline's callback.
  `.art-runtime-object` has no default CSS transition or update keyframe; Art Manager objects cannot
  acquire legacy opacity, scale, filter, exit, or update motion outside their authored timelines.
- Layout reconciliation is data/setup only. A new renderer may silently `stopAt` its authored
  default label, and a removed renderer may be removed immediately, but reconciliation never plays
  `Appear`, `Disappear`, `On`, `Off`, `Update`, or a semantic reveal. Heartbeats, server snapshots,
  layout changes, and stage-event renders are not animation commands.
- Runtime visibility flags are snapshot data, not persistent animation instructions. A later
  reconciliation pass must never replay a prior show/hide action or override the frame selected by
  an explicit flow action.
- Room snapshots are revision ordered. Stage reconciliation ignores duplicate or stale revisions so
  an HTTP response or SSE delivery cannot re-render and interrupt the timeline owned by the active
  flow action. Explicit asset reloads may force a same-revision reconciliation without replaying that action.
- Server-backed stage text sources initialize their fields once per moment visit and write again only
  when the source value actually changes. An unchanged room snapshot must not overwrite text set by a
  later authored `Display Text` action; an explicit `Start Moment` may reapply the moment defaults after
  reconstructing its layout.
- `End Moment` immediately retires every moment-owned layout entity and clears its transient visual
  content. `Start Moment` then initializes every incoming moment-owned entity from its authored default
  lifecycle label; selector-backed structural and text hosts without a lifecycle label use their
  authored `hidden` value. Global layout entities are outside this boundary and retain their own
  lifecycle. Reconciliation may perform the same silent initialization for a newly placed target, but
  it never replaces these authored boundary actions for a repeated moment visit.
- Every flow-driven game-object command carries `commandSource: "flow-action"`. Missing targets,
  missing authored labels, and interrupted target callbacks fail closed; they do not manufacture a
  callback or fall back to a duration estimate.
- E+ visual actions advance from an action-scoped barrier containing only the directly invoked
  targets, then apply the separately authored E+ delay. S+ visual actions fire immediately,
  ignore all animation callbacks, and advance only from their start-relative timer (including S+0).
- S+ sub-actions are scheduled against their parent action's start but remain valid after the
  primary flow advances to later nodes. Stage visuals and authoritative room effects both retain
  that schedule for the current game session; Quit/reset cancels every outstanding sub-action.
- Child component animations may be started by a parent timeline, but they cannot delay or satisfy
  that parent's completion callback. Returned animation durations never advance game flow.
- When a flow action explicitly invokes a labeled child component, that exact child becomes the
  action's callback target. The parent may be placed in an immediate `On` setup state, but it does
  not duplicate the child's animation or contribute a second completion signal.
- Three deliberately fire-and-forget runtime command sources are allowed. A newly spawned dynamic
  player may play `Appear` on its avatar MC, name MC, and VIP MC; input-state changes may play
  `ChoosingStart` or `ChoosingEnd` on avatar behavior; Show Points may start its popup animation.
  None of these animations contributes to an action barrier or advances game flow.
- `Show Points` uses the direct `pointPopupContainer` child of Player Widget MC as an authored
  position anchor. The popup itself is spawned into an overflow-visible roster overlay at the
  live rendered container's center. Runtime must not project an older composition snapshot, infer
  this point from the avatar, or synthesize an entity from a similarly named DOM node. If the
  awarded player's live authored container is unavailable, the popup is rejected and the stage
  reports a game-object diagnostic. Each popup plays only the top-level 1.5-second Player Point Popup `Popup` timeline. Its
  terminal callback removes only that popup; it never joins or completes the Show Points action.
  Pause, quit, and moment teardown cancel the timeline and remove the popup immediately without
  waiting for cleanup. CSS supplies centering only and owns no popup motion.
- Composite reveal widgets follow the same ownership model as Player Widget MC. Voting Card MC
  owns labeled `cardArt`, `answer`, `author`, `voters`, and `voteCount` child prefabs; runtime code
  reveals those children through their timelines. `cardArt` owns the deeper stopped
  `correctnessState` (`Neutral`/`Correct`) instead of runtime code assigning presentation colors.
  `Set Voting Cards Shown` owns exactly one completion target per card: the background-bearing
  `answer` child that receives `Appear` or `Disappear`. Author, voter, and vote-count companions
  may animate fire-and-forget, and the compound card gate switches `Off` only after that primary
  child completes; nested companions never satisfy or delay the flow action.
- `Park` remains a compatibility label for older authored timelines, but runtime defaults and
  immediate hides use `Off`. A newly rendered object stays hidden until an explicit reveal call.
- Art Manager compositions are prefab/source assets. Stage layout entries are placed
  instances of those prefabs. Runtime visibility actions should target the layout
  instance identity (`targetLayoutScope` plus `targetLayoutElementId`), not the
  source art composition id.
- Art composition coordinates use a top-left canvas origin while every component's `x`/`y`
  stores its center point. A base child centered in a `W` by `H` parent is authored at
  `W / 2`, `H / 2` with `transformOrigin: Center`; `0,0` intentionally puts the child's
  center on the parent's top-left corner. Runtime and preview renderers use the authored
  canvas directly and must not crop, translate, or resize references from child content bounds.
- A prefab or Game Object owns its canvas and all values authored inside it. A parent reference
  does not copy, synchronize, or keyframe that child canvas width or height. The child canvas is
  resolved as the reference's intrinsic geometry at render time; the parent owns only its placed
  `x`/`y` plus uniform `scale`, rotation, opacity, brightness, and visibility. These transforms
  accumulate with the child's internal transforms instead of rewriting them. Existing legacy
  reference boxes migrate once into uniform parent scale, after which reference width/height
  fields and keyframes are removed. F8 conversion may still rebase selected artwork into a new
  tightly sized child canvas at authoring time.
- The Art Manager's `Stage` and `Controller Stage` are persistent local assembly
  workspaces, not compositions and never runtime assets. Converting contiguous sibling
  layers with F8 creates one library composition and atomically replaces those layers
  in the active workspace or parent composition with a single reference instance.
- Art composition `surface` is organizational metadata, not a rendering or reference boundary.
  Stage and Controller tabs retain their surface-specific folders and workspaces; the All tab is
  a read-through view of the complete shared composition library. Any game object or prefab may
  reference or swap to a composition from either surface, subject only to cycle prevention.
- Workspace conversion preserves the active editing context and unrelated parent
  timeline data. It removes only selected parent tracks, refuses conversions that
  would orphan a targeted child command, and keeps source timelines of nested prefab
  references intact.
- `Set Game Object Shown` targets placed layout game objects by instance identity,
  including prefab art instances, text fields, and selector-backed widgets.
- Placed layout game object targets are resolved through the shared layout target resolver
  in `client/layout-runtime.js`. Stage and controller surfaces should plug into that
  resolver rather than building separate visibility/action lookup paths.
- Placed layout entities should be registered through the shared registration helper
  in `client/layout-runtime.js` so stage and controller GameObjects carry the same
  `isArt`, `isDynamic`, `isGlobal`, and `visibilityKey` semantics.
- Layout prefab instances let the placed layout entity own park/appear/disappear. The internal art
  tree is prepared at its authored setup state; only `Set Game Object Shown` or another explicit
  flow action may play its lifecycle timeline.
- Dynamic layout art entities should carry their `ArtObjectTreeRenderer` on the same
  registered GameObject entity that owns the placed instance host.
- Layout art entities expose their renderer to the placed GameObject so an authorized flow action
  can address the exact placed instance and receive that instance's callback.
- Art Manager compositions carry a `surface` field (`stage` by default, `controller`
  for controller-oriented sorting) while sharing one composition schema and reference graph.
- New flow action metadata and shared action shaping behavior belongs in
  `shared/flow-action-registry.js`.
- New server behavior should avoid growing `server.js` when it can live in a focused module.
- Large UI changes should eventually land in focused `client/` modules such as
  `client/stage/` or `client/controller/`. Avoid adding a literal `tools/` directory
  unless `.gitignore` is adjusted first.
- Cross-tool affordances such as undo/redo should live in shared tool primitives, then each
  tool should plug in its own snapshot/restore functions instead of owning bespoke stacks.
