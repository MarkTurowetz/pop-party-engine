# Party Game Template Architecture

This project began as a fast prototype with most behavior inside `server.js` and `index.html`.
The long-term direction is to keep the same simple deployment model while moving stable
concepts into focused modules.

## Current Module Boundaries

- `server.js`
  - HTTP routing, room lifecycle, game runtime orchestration, and persistence wiring.
  - This is still the largest file and should keep shrinking over time.
- `server/`
  - Server-only helpers that do not need browser access.
  - `app-version.js` owns build/version lookup.
  - `art-assets-runtime.js` owns Art Manager manifest handling, art replacement validation,
    and art file responses.
  - `github-storage-runtime.js` owns generic GitHub JSON content reads/writes.
  - `http-utils.js` owns JSON responses, request body parsing, and content type lookup.
  - `local-draft-runtime.js` owns unsaved tool draft storage endpoints and room refreshes.
  - `save-handlers-runtime.js` owns common tool save endpoint handling and response shaping.
  - `static-files-runtime.js` owns app shell rendering and browser module file responses.
- `shared/`
  - Data and schema-like constants shared by server runtime and tools.
  - `game-data.js` owns action type metadata, default layouts, default constants, prompts,
    avatar metadata, and art manifest metadata.
- `index.html`
  - Browser runtime for stage, controller, and tools.
  - This still needs a future split into stage/controller/tools modules.
- `client/`
  - Browser-side modules served directly by the Node server without a build step.
  - `client/stage/visual-object.js` owns the generic CSS visual object animation contract
    used by stage text and player answer bubbles.

## Refactor Order

1. Move static data and pure helpers into `shared/`.
2. Move server-only utilities into `server/`.
3. Extract server flow/runtime logic into modules such as `server/flow-runtime.js`,
   `server/room-state.js`, `server/voting.js`, and `server/persistence/`.
4. Split browser code into static client modules under `client/`, keeping the current no-build
   Render deployment until a bundler becomes worth the complexity.
5. Only after the boundaries are stable, introduce classes for concepts that carry behavior,
   such as visual game objects, flow actions, controller views, and layout documents.

## Rules Of Thumb

- Game-authored data stays in JSON data files or GitHub-backed tool storage.
- Runtime code can change without overwriting tool-authored game data.
- New action metadata belongs in `shared/game-data.js`.
- New server behavior should avoid growing `server.js` when it can live in a focused module.
- Large UI changes should eventually land in `client/tools/`, `client/stage/`, or
  `client/controller/`.
