# @pop-party/engine

Public, game-neutral runtime and authoring infrastructure for Pop Party stage/controller games.

Games own their flow, layouts, prompts, art, audio, constants, plugin registrations, deployment, and exact engine dependency. The engine supplies versioned contracts and does not read assets from the reference application.

Package runtime source lives canonically under `src`; legacy monolith paths are temporary compatibility exports to this package. The packed-artifact contract installs the npm tarball outside the repository and rejects generated `dist` copies or game-owned content.

The package check also rejects any relative source import that escapes the engine
package directory. Reference-app adapters may import engine APIs, but engine code
cannot reach back into the reference app or repository-root compatibility files.

Consumers must pin an exact released version.

`pop-party build` loads the game-owned `game.config.js`, verifies the exact
engine/plugin/active-content release tuple and the complete semantic-role graph,
then writes `dist/pop-party-build.json`. Invalid content does not produce a
build manifest, and the manifest pins the immutable content revision that was
actually validated.

`pop-party start` reads the configured active store. `pop-party dev` seeds
`.pop-party/content` once from that store's immutable active revision and then
loads only the game-local copy; it never rewrites or continually resynchronizes
the source. Both commands use the same release gate before binding the
application port. The installed package supplies the complete stage,
controller, room lifecycle, and authenticated core authoring applications.
Those applications render and edit the consuming game's validated bundle; they
never borrow reference-app content or require game-owned bootstrap renderers.
Optional plugin renderers and tool panels are additive to the engine-owned
application rather than replacements for its core routes.

## Game plugin actions and renderers

Plugin contribution ids are namespaced (`my-game.actionName`) and are validated
when the game definition loads. Invalid fields, outputs, renderer bindings,
reserved ids, and duplicates stop application boot.

An action contribution declares its Flow inspector fields and optional named
outputs, then executes synchronously on the server:

```js
registry.actions("my-game.increment", {
  name: "Increment Counter",
  fields: [
    { key: "amount", label: "Amount", control: "integer", min: 1, default: 1 },
    { key: "resultVariable", label: "Result Variable", control: "text", default: "counter" }
  ],
  outputs: [
    { id: "count", name: "Count", variableField: "resultVariable", defaultVariable: "counter" }
  ],
  execute(context, action) {
    context.state.count = Number(context.state.count || 0) + Number(action.amount);
    context.outputs.set("count", context.state.count);
  }
});
```

`context.state` is isolated to the registering namespace and resets with the
game session. The context also exposes read-only public player/actor snapshots,
the current subroutine's read-only `local` values, VIP capability,
deterministic `random` helpers, Flow `outputs`, and an explicit
`broadcast.request()`. It never exposes the generic room object or lifecycle
internals. A bare authored output variable such as `counter` remains available
to a Decision as `flowVariables.counter`; `g.counter` writes the global Flow
scope and `l.counter` writes the current subroutine's local scope.

Game-owned controller barriers use `registry.inputs`. The engine authenticates
the submitting controller, selects recipients on the server, derives a private
JSON-safe view model separately for each recipient, validates the declared
payload, and invokes the synchronous game callback with only its namespaced
state:

```js
registry.inputs("my-game.turnChoice", {
  name: "Turn Choice",
  fields: [
    { key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" },
    { key: "resultVariable", label: "Result Variable", control: "text", default: "turnChoice" }
  ],
  outputs: [{ id: "choice", name: "Choice", variableField: "resultVariable" }],
  submission: [{ id: "choice", type: "choice", optionsSource: "options" }],
  controller: {
    layoutStateId: "my-game-turn-choice",
    bindings: [
      { id: "left", kind: "choice", layoutElementId: "left-choice", field: "choice", optionIndex: 0, autoSubmit: true },
      { id: "right", kind: "choice", layoutElementId: "right-choice", field: "choice", optionIndex: 1, autoSubmit: true }
    ]
  },
  recipients(context) {
    return [context.state.currentPlayerId];
  },
  view(context) {
    return {
      prompt: `Choose for ${context.viewer.name}`,
      options: [{ id: "hit", label: "Hit" }, { id: "stay", label: "Stay" }]
    };
  },
  submit(context, payload) {
    context.state.lastChoice = { playerId: context.actor.id, choice: payload.choice };
    context.outputs.set("choice", payload.choice);
  }
});
```

Submission fields support private-view-model choices and bounded integers.
Controller bindings support Art/Layout-backed text, choice hotspots, bounded
integer fields, and submit hotspots. They refer only to authored Controller
Layout element and Art component ids; plugins cannot inject JavaScript or CSS.
Integer bindings render their current local value with an explicit readable
font and caret even when the containing Art host suppresses inherited text.
Their initial value may be supplied as `viewModel.<field>.initial` and is
clamped to the registered bounds. Choice bindings expose local selection as
`aria-pressed`, `.is-selected`, and
`data-game-plugin-input-selected="true|false"` on both the control and its Art
host. Art compositions may author top-level `Default` and `Selected` labels to
provide custom visual states; the engine also supplies a visible generic
selected-state fallback. These local values and states survive normal lobby
heartbeat rendering until submission, while a reload or new input visit starts
from the server-provided private view model.
Inputs declare `completion` (`allRecipients`, `anyRecipient`, or `manual`),
`disconnect` (`wait`, `completeRemaining`, or `fault`), and an optional
authored timeout field. Every submission carries the room session, action, and
input visit identity. Stale visits are rejected and each recipient is applied
at most once. `context.actor` is always the authenticated submitting player,
not an authored id. Entering a new game-owned input visit also emits a distinct
lobby revision after recipient state is installed, so each eligible
controller's next heartbeat can render its private `gamePlugin.input` without
being mistaken for a duplicate lobby payload. A game input's declared custom
`layoutStateId` is also selected ahead of the room's ordinary controller phase
layout for that input visit; built-in semantic input layouts remain compatible.

## Typed subroutine interfaces

Nested Flow subroutines may declare typed inputs and outputs in the Flow Tool.
Each input copies a caller expression such as `g.currentPlayerId` or
`l.roundBonus` into a fresh child-local property. Child Code Nodes, Decisions,
plugin contexts, and plugin output fields can read or write that isolated
`l` object. When the child returns, only its declared outputs are type-checked
and copied from each child `l.name` to the same `l.name` in the parent. Every
declared output must be assigned by the child before it returns. The parent can
rename a result or promote it to `g` in a following Code Node.

```json
{
  "type": "subroutine",
  "inputs": [
    {
      "name": "playerId",
      "valueType": "string",
      "source": "g.currentPlayerId"
    }
  ],
  "outputs": [
    {
      "name": "choice",
      "valueType": "string"
    }
  ]
}
```

For that declaration, the child writes `l.choice`; after return, the parent
reads `l.choice`. A following parent Code Node can use
`l.turnChoice = l.choice` or `g.lastChoice = l.choice` when another name or
scope is desired.

Supported interface types are `string`, `integer`, `number`, `boolean`, and
JSON-safe `json`. A nested call never inherits its parent's entire local
object. Invalid input coercion or output assignment fails closed with a
structured runtime fault instead of leaking partial values across scopes.

Use the standard `Log Value` Flow action to inspect a `g.*` or `l.*` value
without adding a Code Node. Set its **Variable / Value** field to an expression
such as `l.bidResponse`. The server evaluates it against the current Flow scope
and keeps the formatted result visible in the stage's existing global debug
alert while later actions continue. A missing path displays `undefined`;
malformed expressions display an evaluation error without halting the game.

Stage and Controller renderers are declarative view-model bindings to existing
Tools-authored Layout elements and Art components:

```js
registry.stageRenderers("my-game.counter", {
  name: "Counter Widget",
  target: { layoutElementId: "counter-widget", layoutScope: "moment" },
  bindings: [
    { id: "label", kind: "text", source: "label", targetComponentId: "counter-text" }
  ],
  select(context) {
    return { label: String(context.state.count || 0) };
  }
});
```

The selector runs on the server against a read-only snapshot. The browser
receives only JSON-safe values and applies them through the engine Art renderer.
Controller selectors additionally receive the authenticated `viewer` snapshot;
their view model is produced only in that controller's private response and is
never included in Stage broadcasts.
Controller renderers can target a named persistent Controller Layout layer with
`target: { layoutElementId, layoutScope: "layer", layoutLayerId }`. Plugin inputs
can declare `controller.submitted: { layoutStateId, bindings }` to move only the
submitting recipient to a distinct authored confirmation layout while other
recipients remain on the active input.
Plugins cannot bind position, dimensions, layout scale, or arbitrary CSS; those
remain owned by Stage/Controller Layout and Art Manager content.

`pop-party migrate` loads the active immutable snapshot and follows only the
game plugin's explicit, one-level-at-a-time migration registrations. The default
operation is a read-only preview. `--output <new-directory>` writes an isolated
bundle only after determinism and full release validation pass; source content
and the active release are never rewritten or published by this command.

Bundle-mode games do not supply a parallel `game-data.js`. Readiness
materializes flow, constants, layouts, audio, prompts, art, avatar choices, and
transition metadata from the same pinned snapshot after hash and semantic-role
validation. Missing runtime fields fail with `BUNDLE_GAME_DATA_INVALID`; the
engine never fills them from reference or starter defaults.

Room creation independently materializes that room's runtime data from its
immutable content pin. The room's flow resolver prefers this pinned flow over
process-global drafts or legacy files, and teardown drops the release tuple,
snapshot, and materialized data together. A snapshot that cannot produce a
complete room dataset fails room creation with
`ACTIVE_CONTENT_GAME_DATA_INVALID`. Runtime decisions, scoring defaults,
countdown/crafting durations, player colors, and avatar choices likewise resolve
through that room's pinned dataset. Trivia selection and host-audio action
resolution also use the room-owned prompt and audio collections, never a newer
process-global authoring draft.

The engine application also exposes an explicit
`sessionContentMode: "latest-saved-authoring"` option for a trusted reference
authoring service. In that mode, the service assembles and validates a complete
snapshot from the same saved sources used by its Tools. Running rooms remain
immutable; a room adopts the cached latest snapshot only when a new room or
lobby game session begins. Tool saves and unsaved drafts do not reset active
rooms. Generated games default to `published-release`, so this authoring
preview mode is never inherited accidentally.
An authoring application may supply `authoringRepository` as its game-owned
default for GitHub persistence. Environment variables still take precedence,
and generated games do not inherit the reference application's repository.

For production single-service authoring, games use the revisioned GitHub App
store instead of `latest-saved-authoring`. Every engine Tool writes the same
game-owned draft bundle, including content-addressed art and Host Audio bytes.
Public rooms pin only published releases. Authenticated, CSRF-protected
`POST /api/admin/preview-rooms` requests explicitly create rooms pinned to the
latest complete draft. Both room kinds remain immutable after creation.

Prototype games may instead opt into `authoringMode: "live-prototype"` (or
`PARTY_GAME_AUTHORING_MODE=live-prototype`). Opening the authenticated Tools
surface creates one project-scoped, memory-only workspace from the active
release. Unsaved Flow, Constants, Stage Layout, Controller Layout, Host Audio,
Art composition, and binary art/audio edits immediately replace the complete
snapshot used by that service's stage and controllers and reset rooms to the
lobby without erasing player identity. Invalid intermediate bundles remain
visible as authoring errors and never replace the last valid working snapshot.
Another Tools tab cannot silently replace an active session. Closing the active
tab is enforced by a short heartbeat lease. A service restart or expired lease
clears the server copy, but a still-open editor can resume with the same session
id and must republish its dirty in-memory snapshots before Save.

In live-prototype mode, Save means publish. The full working bundle is
validated, its content and binary blobs are written, and one final expected-ref
compare-and-swap activates that exact revision. A failed write leaves the
previous release authoritative. This mode requires the game-owned revisioned
GitHub store, GitHub administrator authentication with CSRF protection, one
service instance, and game-specific provider configuration; the engine embeds
no repository or credential identity.

Stage and controller presentation is delivered through the same room pin.
Authenticated room routes expose that pin's stage layouts, controller layouts,
art manifest, and immutable art bytes. Browser clients defer their first
in-room render until those resources load, fetch private art with the room's
stage or player capability, and render from local blob URLs. Pre-join and
authoring views may load draft presentation data, but it is never reused as an
in-room fallback; missing or unauthorized pinned content stops activation.
Room creation also runs the service-readiness release validator against the
exact loaded snapshot before installing the pin. Tuple, schema, semantic-role,
and plugin-validation failures reject the room as one atomic operation; no
partially validated room data becomes observable.

Public runtime boundaries include `@pop-party/engine/server`,
`@pop-party/engine/tooling`, and `@pop-party/engine/testing`. Public art authoring
contracts are exposed through `@pop-party/engine/art/lifecycle`,
`@pop-party/engine/art/timeline`, and `@pop-party/engine/art/architecture`.
The generic component vocabulary and normalizers are available from
`@pop-party/engine/art/components`. Games should use these exported surfaces
instead of importing package-internal files.

`@pop-party/engine/semantic-roles` defines the required bridge from generic
engine behavior to game-owned art. A role target names a composition and may
continue through authored `instanceLabel` segments; it never names a legacy DOM
selector or a fallback object. Bundle readiness validates all required roles,
their stage/controller surface, and their terminal component kind against the
published art manifest before the game can become ready. In particular, the
player answer bubble and points origin are children of the mapped player widget,
while the popup art and voting-card widget are independent mapped prefabs.
Flow saves are complete replacements: omitted states and nested action arrays
are rejected instead of being recovered from an older save. Stage execution
likewise consumes the shared action registry and registered layout entities as
authoritative; it does not carry duplicate runner definitions or synthesize
game objects from static DOM nodes.

Generated games start the complete application through
`@pop-party/engine/server/application`. Lower-level Node applications may own
their router while delegating initialization, binding, cleanup scheduling, and
shutdown to `@pop-party/engine/server/web-service`. Bundle-backed custom
applications compose that router through
`@pop-party/engine/server/game-service`: the engine validates and pins the
complete active release, creates the request handler from that exact snapshot,
and only then binds the service port. A failed readiness check or invalid
handler leaves the port closed and exposes a structured failed state; there is
no fallback request handler. Browser applications use the
side-effect-free `@pop-party/engine/client/text` and
`@pop-party/engine/client/qr-code` rendering primitives; compatibility globals
belong only in a game adapter.

Public releases are manual, protected-environment GitHub Actions runs using npm
trusted publishing, OIDC, and provenance. No npm token is accepted by the
release design.
