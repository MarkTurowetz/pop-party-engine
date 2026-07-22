# Plan: Extract Pop Party Engine and Create Flip 7
_Locked via grill — by Codex + Mark_

## Goal

Turn the current Party Game Template monolith into a public, versioned game engine named `@pop-party/engine`, while creating a separate private Flip 7 game that consumes an exact engine version and owns all of its game-specific code, flow, art, layouts, audio, constants, and published content.

The split must preserve the current game exactly before either side evolves. Generic engine behavior must be reusable across future games, game content must never remain linked to the engine's starter content after generation, and invalid or missing data must stop with a useful diagnostic instead of activating legacy art, stale data, or fallback behavior.

The end state has three independently versioned things:

- the public engine package and repository: `MarkTurowetz/pop-party-engine`, npm package `@pop-party/engine`, beginning at `1.0.0`;
- the private game repository and application: `MarkTurowetz/flip-7`, app ID `@pop-party/flip-7`, beginning at `0.1.0`;
- each game's immutable published content revision, identified by its `game-data` Git commit SHA.

No implementation begins until this plan has passed adversarial review and Mark explicitly signs off.

## Approach

### 1. Preserve the source system before changing its boundaries

1. Freeze remote authoring for the export window, then record the current source commit, build `1.0.17.1047`, deployed service, environment configuration, and the exact immutable SHAs of `main` and `game-data`. Read Git-backed files by those SHAs rather than a moving branch head. Snapshot any deployed-filesystem and local-only assets separately under the same migration record so the export never claims that independently changing providers formed one atomic historical state.
2. Export every current content source that can affect a game:
   - default and live flow;
   - constants and prompts;
   - stage and controller layouts;
   - host audio metadata and binary audio;
   - art manifest, organization, compositions, prefabs, images, and other binary assets;
   - avatar definitions and semantic/runtime mappings.
3. Reconcile the known art path disagreement before extraction: the current remote branch stores `art-manifest.json` at its root while some code expects `art/art-manifest.json`. Choose one canonical portable bundle path and report any divergent copies rather than silently preferring one.
4. Produce a checksum inventory containing logical path, byte size, SHA-256 hash, source branch/commit, and whether the asset was tracked, generated, or local-only.
5. Tag or otherwise permanently identify the pre-split code and content commits. Keep a read-only forensic archive until the reference deployment and Flip 7 have independently passed parity checks and durable backups have been verified. Do not delete the archive afterward; retain it as migration evidence.
6. Before making the renamed repository public, scan every reachable ref and historical object for credentials, personal/player data, proprietary game content, and assets without public redistribution rights. Produce an auditable allow/block report. Preserving history remains the locked approach only if this gate proves that history is safe to publish; if the gate fails, stop for an explicit decision between history filtering and a new public repository rather than exposing or silently rewriting history.

### 2. Establish the target repository and package architecture

Convert the current repository in place so its history remains intact, then rename it to `MarkTurowetz/pop-party-engine`. Its target structure is:

```text
pop-party-engine/
  packages/
    engine/                 # @pop-party/engine
    create-game/            # @pop-party/create-game and npm create entry
  apps/
    reference/              # thin reference application using public APIs only
  starter/
    content/                # canonical starter bundle copied by the generator
    plugin/                 # minimal starter plugin copied by the generator
  fixtures/
  docs/
  LICENSE                   # MIT
  THIRD_PARTY_NOTICES.md
```

The private Flip 7 repository is intentionally thin:

```text
flip-7/
  game.config.ts
  src/
    plugin/
    actions/
    stage/
    controller/
    tools/
  content-seed/
  tests/
  package.json
  render.yaml
```

Flip 7 does not copy the engine server, router, runtime, shared renderer, core tools, or build implementation. It depends on one exact published version of `@pop-party/engine` and invokes engine-owned commands:

```text
pop-party dev
pop-party build
pop-party start
pop-party validate
pop-party migrate
```

The engine package declares explicit public entry points such as `@pop-party/engine/server`, `/client`, `/plugin`, `/schema`, `/tooling`, and `/testing`. Package `exports` block games from importing engine internals. Generated apps compile their plugin and UI contributions with the engine; production does not execute TypeScript or JavaScript stored on `game-data`.

### 3. Introduce a single typed game boundary before moving files

Add a `defineGame(...)` contract that supplies everything the current server imports as concrete defaults. At minimum it contains:

- stable `gameId`, display name, game version, and engine compatibility declaration;
- the game plugin entry point;
- content provider configuration;
- semantic-role mappings;
- game-specific validation and migration registrations;
- optional stage, controller, server-action, and authenticated tool contributions.

First adapt the monolith to this boundary while all existing files remain in place. The current application becomes the first game configuration. Each intermediate commit must still build, run, and deploy so extraction is staged rather than a big-bang rewrite.

The engine owns lifecycle contracts, schemas, flow execution, room/session behavior, rendering primitives, semantic-role definitions, authenticated tool chrome, undo infrastructure, validation, and migration orchestration. A game owns presentation and meaning: backgrounds, player widgets, avatars, answer bubbles, voting cards, point popups, timers, wipes, controller controls, audio, flow, prompts, constants, and game-specific actions.

### 4. Make the plugin API additive, namespaced, and capability-limited

Define a versioned plugin API with registries for:

- server actions and flow actions;
- stage and controller render contributions;
- game-specific state schemas and validators;
- content migrations;
- authenticated custom tool pages and panels;
- game-specific diagnostics.

Core registrations use reserved `engine.*` IDs. Flip 7 registrations use `flip7.*`. A plugin may add registrations but may not replace a core ID, core route, security policy, lifecycle transition, or content provider. Duplicate IDs and missing capabilities fail during startup validation.

Treat deployed game plugins as fully trusted application code, not a sandbox or security boundary: code executing in the engine's Node process can access process capabilities regardless of package exports. The registry limits extension shape and accidental overrides, while repository review, dependency policy, and deployment controls establish trust. Custom tool contributions are declarative or mounted through engine-owned wrappers that enforce authentication, authorization, CSRF, input limits, and content APIs. Supporting untrusted third-party plugins would require a separate process and narrow IPC protocol and is not part of this split.

Tool contributions use the common engine shell, authorization, content APIs, undo model, and validation. They edit structured content only. Arbitrary game logic belongs in reviewed plugin source on Flip 7's `main` branch and reaches production through the normal build/deploy process.

Keep Code Nodes as a restricted and versioned Flow Expression Language. Document its grammar and supported `g.*` assignment/arithmetic operators, validate expressions before execution, prevent access to unsafe object paths or host APIs, and record the expression-language version in flow content. Do not turn Code Nodes into arbitrary JavaScript.

### 5. Replace implicit presentation lookups with explicit semantic roles

Define engine semantic roles for every presentation object required by core behavior, such as the active background, player identity widget, answer bubble, voting card, points-popup container, timer, transition, and controller input/submit controls. Each game maps those roles to game-owned composition or prefab IDs in its content/configuration.

Validation checks the entire mapping and referenced object graph before a public room begins. At runtime:

- a missing mapping, missing object, incompatible component, or missing text binding produces a structured fatal diagnostic;
- the affected moment stops in a broken state visible to the host/admin;
- the engine never substitutes starter art, a legacy DOM control, an older player widget, stale answers, or invented content;
- starter assets are not runtime dependencies of generated games.

The engine's canonical starter content remains useful for the reference app and generator. The generator deep-copies it, assigns game-local IDs where required, and writes independent files and blobs. Editing a generated game's copy can never mutate or resolve back to the engine copy.

### 6. Define a portable, self-verifying content bundle

Replace the collection of loosely related root JSON files with one portable bundle contract:

```text
content-bundle.json
flow.json
constants.json
layouts/stage.json
layouts/controller.json
audio/host-audios.json
art/manifest.json
blobs/<sha256>.<extension>
prompts/prompts.json
game-data/<game-specific-dataset>.json
```

`content-bundle.json` records:

- bundle schema version;
- game ID;
- required engine content-schema range;
- Flow Expression Language version;
- parent/published revision metadata where applicable;
- every non-manifest logical file and blob hash;
- semantic-role mapping location;
- game migration level.

The manifest does not hash itself. Define canonical UTF-8 JSON serialization and compute the bundle root hash over a sorted table of normalized non-manifest logical paths, file hashes, and sizes. Require normalized POSIX-relative paths; reject absolute paths, traversal segments, empty or duplicate entries, control characters, Unicode-normalization or case-folding collisions, and symlinks. Local providers resolve paths and verify the final path remains beneath the workspace root.

Use content-addressed blob paths for images and audio so uploads are durable on the game's own `game-data` branch, deduplicated within that game, and verified by hash. A game's copied blob is physically owned by that game even when its bytes began in the engine starter. Validate MIME type from decoded bytes rather than trusting a client header, extension, size, hash, and manifest reference. Keep provider interfaces capable of adding object storage later, but use the game repository initially. Establish file and total-bundle limits with clear diagnostics before GitHub API limits become failures.

Prompts are a required, named game-owned dataset. Migrate every prompt currently embedded in `shared/game-data.ts` into `prompts/prompts.json`, remove engine/runtime prompt defaults, and fail validation when a referenced prompt is missing. The generic `game-data/` directory is reserved for additional schemas registered by a trusted game plugin.

Implement one content-store interface used by local and Git-backed providers. It covers loading an immutable published revision, reading/writing a draft bundle, publishing a validated draft, loading blobs, listing revisions, and rolling back by republishing a previous valid bundle. Engine runtime code must not know GitHub file paths directly.

### 7. Separate drafts, publication, and live rooms

Authoring has three explicit states:

1. **Local workspace:** `pop-party dev` creates an ignored local content workspace seeded from a chosen published revision. It requires no production credentials and never writes remotely without an explicit publish command.
2. **Private remote draft:** authenticated tool saves update a draft workspace that is not visible to public rooms. An admin preview room pins a complete draft snapshot, not a mixture of draft and published files. Every draft snapshot has an immutable revision token; every mutation supplies `expectedRevision` and returns a new token. Stale tabs, duplicate requests, and concurrent instances receive `409` and never trigger an automatic last-writer-wins retry. Mutations carry idempotency keys so a response lost after a successful save can be safely recognized. The initial single-admin implementation may use one game/environment draft ref; its API must permit later per-user or per-branch drafts without changing runtime consumers.
3. **Published revision:** publish validates the complete bundle, then uses the Git Data API to create blobs, one tree, and one commit before compare-and-swap updating the `game-data` ref against the caller's expected head. A stale head returns `409`; it is never blindly reloaded and overwritten. The publish operation is idempotent by draft root hash/idempotency key, and the commit becomes visible only after the ref update succeeds. It then validates and compare-and-swap advances a separate active release record containing the game build, exact engine/plugin versions, and new content SHA. If advancing that record fails, the prior release remains active and the unattached content commit is harmless. Partial multi-file saves never become public.

Every room pins and validates the content SHA from the active release record at explicit stage room creation—before the lobby renders. The pin includes all flow, layouts, art, audio, constants, prompts, and game datasets. Every runtime payload includes that SHA, and every JSON/blob lookup for the room resolves through it; room creation and existing rooms never infer authority from `game-data` HEAD. Publishing affects new rooms only after the active release compare-and-swap succeeds. Quitting or completing a game releases the pin; a new room adopts the then-active release tuple. A revision-aware cache may share immutable bundles between rooms but may not mutate them. Diagnostics display the complete pinned release tuple.

Room state remains deliberately ephemeral and in-memory: player identity for that session, submissions, votes, scores, dynamic `g.*` values, timers, and current moment are not recovered across a server restart/deploy. Within a game, only flow-authorized session data crosses moment boundaries. On quit or normal game completion, the session store and its capabilities are destroyed. The engine never uses controller-local or prior-room data to repair missing session data.

This choice imposes a deployment contract: production runs exactly one runtime replica with autoscaling disabled. Deploys first enter maintenance/drain mode, reject new room creation, allow a bounded period for active games to finish, and require an explicit operator decision before terminating remaining rooms. A forced restart is documented and surfaced as ending every active game; readiness prevents a second process from accepting room traffic accidentally.

### 8. Enforce public/runtime and private/authoring security boundaries

Keep `/stage`, `/controller`, and the minimum room/join transport public. Protect every tool page, draft endpoint, upload, export, migration, validation detail, and publish operation.

Initial production administrator authentication uses GitHub OAuth, authorized by Mark's immutable numeric GitHub user ID rather than mutable login name. Verify identity server-side at login. The implementation includes OAuth state validation, PKCE where supported, secure and HTTP-only same-site session cookies, CSRF protection for mutations, session expiry, upload limits, request validation, and rate limits. OAuth identifies the admin only; a separate least-privileged GitHub App installation credential performs content writes. GitHub `Contents: write` is repository-scoped, not branch-scoped, so protect every non-content ref with rules the App cannot bypass, permit the writer workflow to update only the designated content/release refs, audit attempted violations, and document the residual repository-level credential scope.

Public gameplay receives its own capability design. An explicit, rate-limited stage bootstrap establishes a per-window stage session; only that session can create a room and receive its cryptographically random room-specific stage capability. Joining requires an existing room and issues each controller a separate cryptographically random player capability bound to its player and room. Every stage mutation/SSE stream and every player mutation requires the appropriate capability. Shared lobby/state payloads never contain stage or player capabilities, VIP start tokens, or another player's credential. Store capabilities only in per-window memory or `sessionStorage`, never URLs, cookies shared across controller identities, or `localStorage`; the server invalidates them when the room/game ends. Test simultaneous same-origin Controller Spawner windows for credential isolation.

A development bypass is permitted only when all of these are true: an explicit development flag is set, the server verifies a loopback request, and the environment is not production. Starting production with the bypass enabled fails closed. Split public room routing from admin tooling routing so future game plugins cannot accidentally expose an admin handler publicly.

Do not serve authored SVG or other active content from the authenticated application origin. The preferred initial design serves immutable published blobs from a separate cookieless asset origin with strict CORS, `X-Content-Type-Options: nosniff`, a restrictive content security policy, and immutable hash-based caching. Admin previews load unpublished blobs through revision-bound, short-lived signed asset URLs issued only after authorization, with narrow audience/path claims, expiry, non-enumerable IDs, and query/token redaction from logs; authenticated fetch-to-local-blob URLs are an acceptable equivalent. If provisioning the isolated origin blocks the initial release, SVG must be sanitized with a proven allowlist and served through a sandboxed non-cookie response path; simply echoing uploaded SVG from `/tools` or the app origin is forbidden.

The Chrome Controller Spawner remains one engine-owned, game-agnostic extension. It detects the active app origin and opens that origin's `/controller`; games do not fork or embed separate copies.

### 9. Make incompatibility and migration observable and deterministic

The server never silently rewrites published content on boot. Each bundle declares its schema and compatibility versions. When incompatible content is encountered:

- stage/controller startup stops with a concise diagnostic code and correlation ID;
- admin tools enter a migration-only state with detailed validation output;
- no room is allowed to start on the invalid revision;
- no older content or starter content is substituted.

An upgrade workflow performs: compatibility preview, backup/reference commit, deterministic migration in an isolated workspace, complete validation, human-readable diff/report, and explicit publication. Migrations are versioned, idempotent, scoped to a known source/target version, and tested against fixtures. If any step fails, the source revision remains published and untouched.

Diagnostics and logs identify four separate versions on every app: engine package version, game application version, app build number, and pinned content revision. Errors also identify the game ID, room ID where safe, moment/node ID, semantic role or content path, and the validation rule that failed.

Emit append-only structured administrative audit events for login/logout, draft mutation, validation, migration, publish, rollback, and authorization failure. Each includes immutable actor ID, request/correlation ID, idempotency key where applicable, expected/base/result revision, operation, outcome, timestamp, and safe error code. Keep audit storage separate from mutable content and configure readiness metrics/alerts for repeated authorization failures, publish conflicts/failures, migration failures, runtime fatal diagnostics, content-cache misses, and room termination during deploy.

### 10. Extract and test the engine without depending on Flip 7

Move generic runtime, schemas, renderers, tool infrastructure, and tests into `packages/engine` only after the `defineGame` seam proves the current application works. Create `apps/reference` as a thin consumer of the package's public surface. It uses the canonical starter bundle and remains deployed as the **Pop Party Engine Reference** playground.

The public engine's CI cannot depend on the private Flip 7 repository. Its required checks include:

- unit tests for runtime, flow, session cleanup, validation, security boundaries, content stores, revision pinning, migrations, and plugin registration;
- contract tests for every public export;
- a production build of the thin reference app;
- packaging the exact npm tarball and installing it into a generated fixture outside the monorepo, ensuring undeclared workspace imports cannot pass;
- running a full generated-game build, server smoke test, and representative stage/controller flow against that tarball;
- reproducible starter-bundle hash and deep-copy isolation tests.

Keep TypeScript declarations and browser/server exports explicit. Ensure Vite and server builds consume the package the same way external games do, rather than resolving monorepo source aliases that would hide packaging errors.

### 11. Build the reusable game generator

Publish `@pop-party/create-game` so this command creates a new independent game:

```text
npm create @pop-party/game MyGame
```

If npm's package-name resolution requires a different physical package name or bin arrangement, preserve that user-facing command through the supported npm initializer convention and test it from the packed release artifact.

The generator:

- pins the exact selected `@pop-party/engine` version, never a range;
- deep-copies the starter content and blobs;
- creates a unique game ID, package/app metadata, config, plugin namespace, local content seed, scripts, tests, and deployment template;
- carries MIT licensing for generated code and CC0 notices for copied canonical starter art/content, plus third-party notices where applicable;
- produces no symlinks, workspace links, Git submodules, shared asset URLs, or runtime imports from the reference app;
- initializes a valid bundle that passes `pop-party validate`, build, and smoke tests before success.

Flip 7 is the generator's first real acceptance test, but engine CI also uses a public fixture so future package releases do not require access to the private game.

### 12. Establish public licensing and automated releases

Create the public GitHub repository `MarkTurowetz/pop-party-engine` and the public npm organization/scope `@pop-party`. License engine source under MIT and canonical starter art/content under CC0. Inventory third-party dependencies and assets, retain their required notices, and block publication if ownership or redistribution terms are unknown.

Use GitHub Actions with npm trusted publishing/OIDC and provenance rather than a long-lived npm token when supported. Protect `main`, require CI, and generate immutable Git tags/releases. Use a changeset/release workflow that makes version intent reviewable. The first clean engine release is `1.0.0`; historical build `1.0.17.1047` remains recorded as the monolith baseline, not republished as an engine semantic version.

Games pin exact versions in `package.json` and lockfiles. Engine upgrades occur only in explicit game commits that include:

- the engine version and lockfile change;
- compatibility/migration preview;
- any game plugin adaptations;
- regenerated validation reports where schemas changed;
- full game tests and deployment preview.

There is no atomic commit across repositories. For a cross-repository capability, validate a packed candidate engine against Flip 7 locally, merge and publish the engine release first, then open the separate Flip 7 upgrade commit. Treat deployment as a tested active release tuple: game build, exact engine version, game plugin version, and published content SHA. Readiness loads and validates the active record before traffic. Content-only publication creates the content commit first and advances this record only after compatibility validation; new rooms read the record, not content-branch HEAD. Rollback compare-and-swap selects a previously tested tuple so an old process is never briefly exposed to incompatible new content.

### 13. Create Flip 7 from the verified current snapshot

Create private repository `MarkTurowetz/flip-7`, mark its npm app private, and generate it using the released engine and generator. Replace the generic generated seed with a deep copy of the reconciled, checksummed current live snapshot. Copy every file and blob into Flip 7 ownership; do not point to the engine reference branch or asset URLs.

Create Flip 7's own private `game-data` branch, OAuth/provider configuration, Render service, and hostname. Its normal paths remain `/stage`, `/controller`, and `/tools`. Seed and publish the initial content as one validated commit, then record its hash beside the migration inventory.

Game-specific behavior begins in `flip7.*` plugin registrations. When a capability might later become generic, first prove it in Flip 7. Promotion is deliberate:

1. demonstrate the behavior and tests in Flip 7;
2. design a game-neutral engine contract;
3. implement and publish that engine capability with public tests/docs;
4. upgrade Flip 7 explicitly;
5. remove the local implementation only after parity passes.

Nothing is copied back into the engine automatically.

### 14. Prove parity and failure behavior before cutover

Run the reference app and Flip 7 independently through a migration acceptance matrix:

- checksum equality for every byte-preserved blob and raw forensic source; canonical semantic comparisons for JSON whose paths, schema, or serialization necessarily changed;
- route and deployment smoke tests for stage, controller, tools, and Controller Spawner;
- lobby, join, reconnect-within-session identity, start, full representative flow, quit, normal completion, and second fresh game;
- repeated/reused moments, controller state reset, voice/writing/crafting answer production, voting card generation, points-popup semantic attachment, and session cleanup;
- Art/Flow/Layout tool load, edit, undo, draft save, admin preview, validation, upload, publish, and rollback;
- public/admin authorization and CSRF tests;
- active-room revision pinning while a new content revision publishes;
- missing semantic role, empty required answer bucket, invalid flow expression, incompatible schema, missing blob, and corrupt manifest tests that confirm the game stops with a diagnostic and never falls back;
- install/build/run tests from the published `@pop-party/engine@1.0.0`, not local workspace links.

Use automated DOM/behavior contracts and targeted visual snapshots where presentation parity matters. Record accepted intentional differences. Do not retire or rename the transition deployment until both the Pop Party Engine Reference and Flip 7 independently pass this matrix.

### 15. Cut over in reversible stages

Execute the migration as a series of releasable milestones:

1. **Archive and inventory:** freeze authoring and identifiers, resolve immutable provider revisions, export/checksum content, scan all history intended for public release, and tag baseline code/content.
2. **Configuration seam:** introduce `defineGame`, provider interfaces, namespaced registries, and semantic validation in the existing repository without moving behavior.
3. **Local content seam:** move starter/live data behind the portable bundle, implement local durable blobs, and prove exact parity while all remote draft/publish routes remain absent or disabled by a production fail-closed feature gate.
4. **Security seam:** add admin OAuth, stage/player capabilities, isolated asset delivery, protected-ref policy, audit logging, and public/admin route separation before enabling any remote mutation.
5. **Remote publication seam:** add immutable release tuples and room revision pinning, optimistic draft/preview/publish, deterministic migrations, diagnostics, and fail-closed behavior; remove the remote-authoring feature gate only after security tests pass.
6. **Package extraction:** move generic code to `@pop-party/engine`, make the reference app consume public exports, and pass packed-tarball tests.
7. **Release infrastructure:** create the npm scope, licensing/notices, protected CI, provenance publishing, and release `1.0.0`.
8. **Generator:** release and verify the create-game workflow.
9. **Flip 7:** create the private repository/service, copy the verified snapshot, publish its own content revision, and pass parity/failure tests.
10. **Repository/service rename:** rename the original repository to `pop-party-engine`, designate its existing deployment as the reference playground, update remotes/secrets/docs, and preserve redirects where GitHub/hosting provide them.
11. **Retire transition paths:** remove compatibility scaffolding only after telemetry and parity evidence show neither deployed app uses it.

Every milestone lands as a focused commit or small commit series on `main`, passes its validation gate, and is pushed with an explicit build number. Data-branch publications are separate commits with reported content hashes. If a milestone fails, revert that milestone or redeploy the prior app build; do not mutate the archived source revision.

### 16. Document ownership and operating procedures

Publish engine documentation covering:

- public package APIs and compatibility policy;
- game/plugin/content ownership rules;
- semantic roles and fail-closed diagnostics;
- Flow Expression Language grammar;
- local authoring, remote drafts, publish, rollback, and session revision pinning;
- game generation and exact engine upgrades;
- engine release and cross-repository promotion workflow;
- OAuth/provider setup and production security checklist;
- content/blob limits, backups, and disaster recovery.

Add concise runbooks in both repositories. The engine runbook owns releases and the reference deployment. Flip 7's runbook owns its service, content branch, plugin deploys, content publishing, release tuples, drain-mode deploys, and rollback. Diagnostics and the immutable audit trail must make it possible to identify which of those layers and actors is responsible for a production failure.

## Key decisions & tradeoffs

- The engine is a public, versioned npm dependency rather than vendored source. Games receive generic improvements only through reviewed version bumps.
- Existing `pop-party` history is preserved by converting and renaming the repository in place only if the objective public-history audit passes.
- Flip 7 is private and deploys as one independent web service with its own private content branch.
- All player-facing art and presentation is game-owned. Starter content is deep-copied; it is never a shared live dependency.
- Engine core and game plugins are separated by a typed, namespaced, additive API. Games cannot override core IDs or security/lifecycle behavior, but deployed plugins are explicitly trusted same-process application code rather than a sandbox.
- Structured authored content lives on each game's `game-data` branch; custom executable code lives on the game's normal source branch.
- Content publication is an optimistic-concurrency, compare-and-swap operation at the bundle/commit level. Rooms pin immutable revisions at creation, so authoring can never alter a room in progress.
- Runtime room/session state is intentionally in-memory and disposable. Identity persists only inside the active game session and is rejected after that session ends.
- Invalid data stops the affected game with explicit diagnostics. There are no legacy-art, stale-answer, prior-room, or starter-content fallbacks.
- Code Nodes remain a safe expression language; they do not become an arbitrary scripting escape hatch.
- Git is the initial binary content store for simplicity and versioned rollback. A provider boundary and explicit size limits preserve a future object-storage path.
- The existing Controller Spawner remains one engine-owned, origin-aware extension.
- Engine code uses MIT; canonical starter art/content uses CC0. Third-party licensing remains explicit.
- Extraction is staged and continuously deployable. The old system remains recoverable until both new deployments pass parity.

## Risks / open questions

- Creating/renaming GitHub repositories, creating the `@pop-party` npm organization, configuring trusted publishing, creating the GitHub OAuth app, and provisioning the Flip 7 Render service require external-account authority and secrets. Implementation must stop for those approvals at the relevant milestone.
- The public license decision covers code and assets Mark owns. The asset inventory may reveal third-party material that cannot be released under CC0; such assets must be replaced, excluded, or distributed under their actual terms before the public release.
- GitHub branch storage is suitable for the current asset scale but not unbounded binary growth. The bundle must enforce measured limits and document when to switch the content-provider implementation.
- The current production/local/default content sources may have diverged, particularly the art-manifest path. Reconciliation must freeze and report each immutable source, then obtain an explicit chosen source when hashes differ materially; no precedence rule should hide them.
- Preserving the original Git history while making the repository public is contingent on a complete history/ref/object security and licensing audit. Classify the approved baseline starter snapshot explicitly; any reachable Flip 7-named or Flip 7-specific artifact, player/personal data, secret, unlicensed material, or unclassified non-engine/non-starter content is an automatic failure. A failed audit reopens only the history-publication mechanism, not the engine/game ownership model.
- Git rename redirects and npm initializer naming need confirmation in a dry run before public documentation is finalized.
- OAuth callback URLs and service hostnames depend on final Render/domain configuration. Route contracts are locked, but exact hostnames can be filled in during provisioning.
- A single remote draft ref is sufficient for the initial sole administrator but will need a conflict/ownership design before multiple simultaneous authors are allowed.
- In-memory rooms deliberately disappear on deploy. If future games require high availability or resume-after-restart, that is a separate engine capability and must not be smuggled into this split.

## Out of scope

- Building Flip 7-specific gameplay or new art beyond copying and proving the current snapshot.
- Automatically propagating starter content changes into an existing game.
- Automatically promoting Flip 7 code back into the engine.
- Supporting arbitrary JavaScript in Code Nodes or executable code on `game-data`.
- Multi-region or multi-replica room persistence, process-restart recovery, or shared live-room databases.
- Isolation or safe execution of untrusted third-party game plugins.
- Multi-admin collaborative drafts beyond preserving an extensible draft-provider boundary.
- Moving binary assets to a separate object-storage/CDN service during the initial split.
- Redesigning the current stage/controller/tool visuals during parity migration.
- Retaining legacy runtime art, legacy DOM buttons, stale data fallbacks, or compatibility behavior after cutover evidence permits their removal.
