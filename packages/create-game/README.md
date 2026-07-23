# @pop-party/create-game

This package powers `npm create @pop-party/game MyGame`. It creates an independent game directory, pins an exact `@pop-party/engine` version, and byte-copies the canonical CC0-1.0 starter content without symlinks or references to the engine repository.

Generated games use `pop-party validate content` for content-only checks and
`pop-party build` for the full game/engine/plugin/content readiness gate. Build
output is game-local and records the exact immutable content revision.
Runtime game data is materialized from that same validated content snapshot;
the generator does not create a second empty or drifting game-data source.
