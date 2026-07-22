# @pop-party/engine

Public, game-neutral runtime and authoring infrastructure for Pop Party stage/controller games.

Games own their flow, layouts, prompts, art, audio, constants, plugin registrations, deployment, and exact engine dependency. The engine supplies versioned contracts and does not read assets from the reference application.

Package runtime source lives canonically under `src`; legacy monolith paths are temporary compatibility exports to this package. The packed-artifact contract installs the npm tarball outside the repository and rejects generated `dist` copies or game-owned content.

Consumers must pin an exact released version.
