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

Node applications can own their router while delegating initialization,
binding, cleanup scheduling, and shutdown to
`@pop-party/engine/server/web-service`. Bundle-backed games should compose that
router through `@pop-party/engine/server/game-service`: the engine validates and
pins the complete active release, creates the request handler from that exact
snapshot, and only then binds the service port. A failed readiness check or
invalid handler leaves the port closed and exposes a structured failed state;
there is no fallback request handler. Browser applications use the
side-effect-free `@pop-party/engine/client/text` and
`@pop-party/engine/client/qr-code` rendering primitives; compatibility globals
belong only in a game adapter.

Public releases are manual, protected-environment GitHub Actions runs using npm
trusted publishing, OIDC, and provenance. No npm token is accepted by the
release design.
