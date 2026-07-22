# Plan Review Log: Extract Pop Party Engine and Create Flip 7
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

## External review status

The environment initially blocked the external Codex session because it could transmit `PLAN.md` and repository contents to an external model service. No repository content was transmitted before Mark explicitly approved that review. Review then began read-only with reviewer model `gpt-5.6-sol` on `codex-cli 0.145.0-alpha.18`.

## Round 1 — Codex

### Material findings

1. **Publishing the renamed repository exposes historical game data.** The plan preserves the full history while making the repository public, but reachable history already contains `game-flow.json`, layouts, constants, audio metadata, and art manifests—contradicting Flip 7's private ownership boundary.
   - Fix: Create the public engine from an audited, filtered history while retaining the original repository as the private forensic archive, then scan every public ref for secrets, game content, and licensing problems.
2. **The baseline export is not a coherent snapshot.** Recording branch heads before separately exporting production, remote, generated, and local-only sources allows authoring changes during the export and can produce a state that never existed.
   - Fix: Freeze authoring, resolve each provider to one immutable revision first, read Git files by that SHA, and separately snapshot any deployed filesystem assets under the same migration record.
3. **“One `game-data` commit” is not implemented by the current storage mechanism.** Each GitHub Contents API `PUT` creates its own commit, and conflict retry currently reloads and blindly overwrites.
   - Fix: Publish through Git blobs/tree/commit creation followed by a compare-and-swap ref update against the expected head, rejecting stale bases and making retry requests idempotent.
4. **Draft and publish races remain even with one administrator.** Two browser tabs, duplicate requests, a retry after timeout, or two server instances can overwrite the shared draft or publish out of order; deferring multi-user drafts does not solve these races.
   - Fix: Give every draft snapshot a revision token, require `expectedRevision` on every mutation and publish, and return `409` without automatic last-writer-wins retries.
5. **The bundle manifest is recursively unhashable.** `content-bundle.json` is inside the bundle while purportedly recording every logical file's hash, so its own hash depends on itself.
   - Fix: Explicitly exclude the manifest from its file table and define a canonical serialization plus a root hash computed only over sorted non-manifest entries.
6. **Portable paths lack a containment contract.** Hash and MIME validation does not prevent `../`, absolute paths, Unicode/case collisions, duplicate logical entries, symlinks, or a local provider resolving outside its workspace.
   - Fix: Define normalized POSIX-relative paths, reject traversal/absolute/control-character/case-colliding entries and symlinks, and verify the resolved path remains beneath the provider root.
7. **Public gameplay has no actor-authentication design.** Currently player IDs are client-selected or generated with `Math.random()`, while every lobby payload exposes both VIP identity and `startToken`; an attacker can therefore impersonate players or the VIP.
   - Fix: Issue cryptographically random, per-controller capabilities on join and a separate stage capability, require them on every player/stage mutation, and never serialize either capability in shared lobby state.
8. **Anyone can create rooms and control stage-only operations.** Both lobby reads and joins call room-creating helpers, while pause, quit, test-flow, action-effect, and completion routes accept only a short room code.
   - Fix: Add explicit stage-authorized room creation, make controller joins require an existing room, and require the stage capability on SSE plus all stage-control endpoints.
9. **The “capability-limited” plugin boundary is not a security boundary.** Game plugins execute reviewed JavaScript in the engine's Node process, so they can access environment variables, the filesystem, network, and engine objects regardless of package `exports`.
   - Fix: Either describe plugins as fully trusted code and expose only engine-wrapped declarative route contributions, or isolate untrusted plugins in a separate process with a narrow IPC protocol.
10. **GitHub username allowlisting is mutable.** Authorizing `MarkTurowetz` by login name can fail after a rename and can authorize the wrong account if a name is later reassigned.
    - Fix: Bind authorization to the immutable GitHub numeric user ID, verify the OAuth identity server-side on login, and use a separate GitHub App credential for content writes.
11. **Same-origin uploaded SVG becomes an authenticated stored-XSS surface.** SVG uploads are accepted and served from the application origin without a restrictive CSP; once OAuth cookies exist, a malicious SVG can act as the authenticated origin.
    - Fix: Serve user blobs from a cookieless isolated origin, or sanitize SVG and return an asset-specific sandboxing CSP plus `nosniff` and attachment headers.
12. **Revision pinning starts too late and lacks a request protocol.** Lobby layouts and art are needed before “game session starts,” so publishing during a lobby can still mix versions unless every runtime fetch is tied to the room's revision.
    - Fix: Pin and validate the content SHA at room creation, include it in every runtime payload, resolve all JSON and blob requests through that SHA, and never consult provider HEAD for an existing room.
13. **Rollback can combine an old app with incompatible new content.** Restoring an engine package and separately republishing content is not atomic, so the rolled-back process may boot against a schema it cannot read.
    - Fix: Deploy and roll back an explicit tested release tuple of app build, exact engine version, and published content SHA, with readiness failing before traffic if the tuple is incompatible.
14. **The ephemeral-room decision omits required deployment constraints.** Multiple replicas, rolling overlap, or routine deploys split rooms/SSE across processes or destroy active sessions even though persistence is declared out of scope.
    - Fix: Enforce one runtime replica, disable autoscaling, add an active-room drain/maintenance gate for deploys, and document that any forced restart terminates all rooms.
15. **Prompts are not concretely migrated into game ownership.** They currently live as executable engine data in `shared/game-data.ts`, while the proposed fixed bundle has no required prompts path and permits only unspecified game datasets.
    - Fix: Add a named prompts dataset to the bundle schema, migrate every prompt into Flip 7 content, and remove all engine/runtime prompt defaults and fallback selection.
16. **Observability lacks an immutable administrative audit trail.** Correlation IDs and version logging do not establish who saved, validated, migrated, published, or rolled back which revisions, nor provide alarms for repeated validation or authorization failures.
    - Fix: Add structured append-only audit events with actor ID, request ID, base/result SHA, operation, outcome, and timestamps, plus readiness metrics and alerts for auth, publish, migration, and runtime-fault failures.
17. **The migration verifies raw hashes where representation necessarily changes.** Moving root JSON into normalized bundle paths and applying migrations will change bytes, so checksum equality cannot prove semantic parity for migrated files.
    - Fix: Preserve raw source hashes only for the forensic archive, then verify migrated content with canonical semantic comparisons and golden runtime/DOM behavior fixtures.

VERDICT: REVISE

### Claude's response

Accepted findings 2–17 and revised `PLAN.md` to add: a frozen multi-provider snapshot; atomic Git tree/commit/CAS publication; optimistic draft revisions and idempotency; canonical non-recursive bundle hashing; strict portable-path containment; cryptographic stage/player capabilities; trusted-plugin wording; immutable GitHub user-ID authorization with separate writer credentials; isolated asset serving; room revision pinning at creation; release tuples; single-replica/drain deployment rules; an explicit prompts dataset; append-only audit events/alerts; and semantic parity checks for transformed JSON.

Finding 1 correctly identified a mandatory public-history audit, but its proposed filtered-history architecture conflicts with the user's locked decision to rename in place and preserve history. The plan now makes publication contingent on a complete all-ref/object security, privacy, content, and licensing audit. If it fails, implementation stops for Mark to reopen the history-publication mechanism; it does not silently expose history or silently discard the locked decision.

## Round 2 — Codex

Most prior findings are now addressed, but the revision introduces or leaves six material issues.

1. **Security is sequenced after remote publishing.** Milestone 4 adds draft/publish endpoints, while authentication and runtime capabilities arrive in milestone 5; because milestones are described as releasable, production could expose unauthenticated publication.
   - Fix: Implement authentication before remote mutations, or keep every draft/publish endpoint disabled by a fail-closed feature gate until the security milestone lands.
2. **The published-content authority is contradictory.** New rooms adopt the “then-current” revision, but deployment supposedly pins a tested content SHA and never reads provider HEAD; these models produce different behavior after content-only publication.
   - Fix: Make every content publication update an explicit release tuple, and require room creation to read only that tuple's SHA—not `game-data` HEAD.
3. **The GitHub writer cannot be permission-scoped to one branch as claimed.** GitHub App `Contents: write` is a repository permission; the refs API targets a branch but does not limit the credential to that branch.
   - Fix: Use a dedicated content repository, or explicitly protect every non-content ref with rules the writer cannot bypass and acknowledge that the credential remains repository-scoped.
4. **Controller capability storage is unsafe for the Controller Spawner.** “Controller-local storage” is ambiguous; `localStorage` is shared by all same-origin controller windows, so one spawned player can overwrite or inherit another player's credential.
   - Fix: Require per-window in-memory or `sessionStorage` capability storage, prohibit credentials in URLs and shared storage, and test simultaneous same-origin spawned controllers.
5. **Cookieless assets do not cover authenticated draft previews.** Published blobs may be public, but an admin preview must load unpublished draft blobs without making them public or relying on the application's OAuth cookie.
   - Fix: Define revision-bound, short-lived signed draft-asset URLs—or authenticated fetch-to-blob URLs—with strict expiry, logging redaction, and no public draft enumeration.
6. **The public-history gate still lacks an objective privacy criterion.** Reachable history is already known to contain flows, layouts, constants, and art manifests, yet the plan does not say whether any Flip 7-owned historical artifact automatically fails the audit; “safe to publish” can therefore pass licensing checks while violating the private-game boundary.
   - Fix: Define Flip 7-specific code/content in reachable history as an automatic audit failure and pre-authorize either filtered history or a new public repository when found.

VERDICT: REVISE

### Claude's response

Accepted all six findings. `PLAN.md` now orders security before any enabled remote mutation; models publication as an atomic content commit followed by compare-and-swap advancement of an explicit active release tuple; acknowledges the GitHub App's repository-wide permission and requires non-content ref protection that it cannot bypass; restricts controller capabilities to per-window memory or `sessionStorage`; defines short-lived revision-bound draft-asset access; and gives the history audit automatic failure criteria for Flip 7-specific, private/personal, secret, unlicensed, or unclassified content.

For finding 3, retained the locked same-repository `game-data` branch and chose protected refs rather than a separate content repository. For finding 6, did not pre-authorize destructive history rewriting because that contradicts the locked preserve-history choice; an audit failure still stops implementation for Mark's explicit decision.

## Round 3 — Codex

All six prior findings are adequately addressed:

- Security now precedes remote publication.
- The active release tuple is authoritative instead of branch HEAD.
- Repository-scoped GitHub permissions and protected refs are acknowledged.
- Controller capabilities are isolated per window.
- Draft assets use scoped, temporary access.
- The history audit has objective failure criteria and stops safely for a decision.

I found no new material security, concurrency, schema, deployment, or observability flaw. The remaining open items are appropriately guarded implementation/provisioning decisions.

VERDICT: APPROVED

### Claude's response

Accepted. The plan converged after three rounds. No further revision was required.

## Act 3 — Build

Mark approved implementation on 2026-07-22. Codex is implementing the reviewed plan in staged, deployable milestones. The optional `codex-build` skill named by the planning workflow is not installed in this environment, so implementation proceeds directly under the project and Ponytail guardrails.
