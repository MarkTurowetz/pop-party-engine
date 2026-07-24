# Pop Party Engine Reference

This directory owns the thin deployed reference application. It consumes the
same public `@pop-party/engine/server/application` boundary as generated games;
the root `game.config.js` remains a temporary compatibility export.

`game.config.js` is a true bundle-mode definition and contains no runtime
`gameData` object. Runtime and authoring data are materialized from the
reference-owned content bundle through the engine application.

Its manifest pins the engine exactly. The repository root uses a local file dependency only for migration development; published games will install that same semantic version from npm.

Reference-owned flow, layouts, art, audio, prompts, constants, semantic roles,
and runtime metadata now live in the self-verifying `content/` bundle. Those
files and content-addressed blobs are a physical game-owned copy: they are not
resolved from the engine starter and can evolve without changing generated
games or the engine package. The application validates this bundle before
constructing gameplay runtimes or binding its port. The application server
contains no reference-only room, router, or tools implementation.
