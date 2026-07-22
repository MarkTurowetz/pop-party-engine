# Pop Party Engine Reference

This directory owns the reference game's configuration and will become the thin deployed reference application. It consumes only public `@pop-party/engine` APIs; the root `game.config.js` remains a temporary compatibility export during extraction.

Its manifest pins the engine exactly. The repository root uses a local file dependency only for migration development; published games will install that same semantic version from npm.

Reference-owned flow, layouts, art, audio, prompts, and constants will move behind this boundary without becoming engine package content.
