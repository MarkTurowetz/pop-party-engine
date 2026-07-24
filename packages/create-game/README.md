# @pop-party/create-game

This package powers `npm create @pop-party/game MyGame`. It creates an independent game directory, pins an exact `@pop-party/engine` version, and byte-copies the canonical CC0-1.0 starter content without symlinks or references to the engine repository.

Current npm initializer resolution maps `npm create @pop-party/game` to this
package, `@pop-party/create-game`, and executes its sole `create-game` bin. The
packed executable is part of the release gate. Unknown flags, missing flag
values, and ambiguous game names fail instead of falling back to defaults.

Generated games use `pop-party validate content` for content-only checks and
`pop-party build` for the full game/engine/plugin/content readiness gate. Build
output is game-local and records the exact immutable content revision.
Runtime game data is materialized from that same validated content snapshot;
the generator does not create a second empty or drifting game-data source.

Generated games run through `pop-party dev` locally and `pop-party start` in
production. The first development run seeds ignored `.pop-party/content` from
the configured immutable release; later runs keep that independent local copy.
Production never reads the development workspace. Both commands validate the
complete selected release before opening a port.

The resulting service immediately receives the engine-owned stage, controller,
room lifecycle, and authenticated core tools. Its `src/stage`,
`src/controller`, and `src/tools` folders begin as empty additive plugin
boundaries; they do not contain placeholder pages or copies of engine code.

`pop-party migrate` previews the registered, contiguous game migration path.
It writes nothing unless `--output <new-directory>` is supplied, never mutates
the source bundle, runs every migration twice to reject nondeterministic output,
and validates the complete result against the installed engine before writing.

Each generated game also owns a `render.yaml` and `DEPLOYMENT.md`. The Blueprint
declares one manually scaled Node web service, the engine build/start commands,
`/health`, and a 300-second graceful shutdown window. It contains no shared
engine deployment and no committed provider or administrator secrets.
