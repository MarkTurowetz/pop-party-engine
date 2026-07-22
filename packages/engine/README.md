# @pop-party/engine

Public, game-neutral runtime and authoring infrastructure for Pop Party stage/controller games.

Games own their flow, layouts, prompts, art, audio, constants, plugin registrations, deployment, and exact engine dependency. The engine supplies versioned contracts and does not read assets from the reference application.

Package runtime source lives canonically under `src`; legacy monolith paths are temporary compatibility exports to this package. The packed-artifact contract installs the npm tarball outside the repository and rejects generated `dist` copies or game-owned content.

The package check also rejects any relative source import that escapes the engine
package directory. Reference-app adapters may import engine APIs, but engine code
cannot reach back into the reference app or repository-root compatibility files.

Consumers must pin an exact released version.

Public runtime boundaries include `@pop-party/engine/server`,
`@pop-party/engine/tooling`, and `@pop-party/engine/testing`. Public art authoring
contracts are exposed through `@pop-party/engine/art/lifecycle`,
`@pop-party/engine/art/timeline`, and `@pop-party/engine/art/architecture`.
The generic component vocabulary and normalizers are available from
`@pop-party/engine/art/components`. Games should use these exported surfaces
instead of importing package-internal files.

Node applications can own their router while delegating initialization,
binding, cleanup scheduling, and shutdown to
`@pop-party/engine/server/web-service`. Browser applications use the
side-effect-free `@pop-party/engine/client/text` and
`@pop-party/engine/client/qr-code` rendering primitives; compatibility globals
belong only in a game adapter.
