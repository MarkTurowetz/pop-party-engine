# Pop Party Engine Reference

This directory owns the reference game's configuration and will become the thin deployed reference application. It consumes only public `@pop-party/engine` APIs; the root `game.config.js` remains a temporary compatibility export during extraction.

Its manifest pins the engine exactly. The repository root uses a local file dependency only for migration development; published games will install that same semantic version from npm.

Reference-owned flow, layouts, art, audio, prompts, constants, semantic roles,
and runtime metadata now live in the self-verifying `content/` bundle. Those
files and content-addressed blobs are a physical game-owned copy: they are not
resolved from the engine starter and can evolve without changing generated
games or the engine package. The application validates this bundle before
constructing gameplay runtimes or binding its port. Legacy root sources remain
available only to the reference-owned authoring adapters until those tools move
fully onto draft-bundle APIs; public rooms never resolve through them.
