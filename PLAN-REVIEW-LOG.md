# Plan Review Log: Art Manager prefab timeline ownership
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

## Round 1 — Codex

Material problems remain:

1. **Command identity is ambiguous.** The plan stores command targets by component `id`, while tracks use scoped paths; the server only deduplicates IDs among siblings, so duplicate IDs in different containers can resolve unpredictably.
Fix: Enforce composition-wide ID uniqueness during migration/save, or persist immutable scoped target IDs everywhere.

2. **Critical validation is editor-only.** API callers can bypass cycle, `instanceLabel`, reference-boundary, and command-target checks and persist corrupt graphs.
Fix: Implement one shared validator used by both editor and server, with saves rejected atomically on any violation.

3. **“Global Save” is neither atomic nor concurrency-safe.** The controller saves compositions sequentially, while each endpoint rewrites the whole manifest; GitHub’s conflict retry refreshes only the SHA and can overwrite another user’s newer manifest.
Fix: Add a revision-checked batch migration endpoint that merges against the latest manifest and commits all migrated compositions atomically.

4. **The new fields will currently be stripped.** Client serializers and `server/art-assets-runtime.js` whitelist composition/component fields, so `instanceLabel` and the architecture version disappear unless every normalization boundary changes.
Fix: Explicitly enumerate and test round-tripping the new fields through client serialization, draft hydration, server normalization, durable storage, and reload.

5. **Lifecycle-label collisions are undefined.** A legacy timeline may contain both `appear` and custom `Appear`; capitalization creates duplicate labels, and normalization silently keeps one.
Fix: Detect canonicalization collisions before mutation and block migration with a composition-specific resolution error.

6. **Legacy command migration contradicts the new schema.** The plan says commands remain verbatim except capitalization, but also requires component-command targets to become stable IDs; legacy labels, names, IDs, and paths are not mapped.
Fix: Define a versioned command-target migration with deterministic resolution, and fail closed while preserving unresolved commands for manual repair.

7. **Base editing at any non-keyed frame is incorrect.** If a lane has keys elsewhere, editing base properties between those keys will not modify the displayed interpolation and produces surprising global changes.
Fix: Permit base-property editing only when the entire track is absent; otherwise require creating or selecting a keyframe.

8. **Parent and child animation ownership is not structurally separated.** The current runtime attaches a referenced composition timeline to the reference wrapper, while the parent also animates that wrapper; merely testing coexistence does not prevent competing snapshots.
Fix: Specify separate wrapper and inner-content transform/player layers, with parent tracks affecting only the wrapper and child timelines affecting only the inner renderer.

9. **Missing animation labels still fail silently.** Current timeline lookup falls back to frame `0`, so stale commands or external runtime inputs can execute the wrong state despite editor validation.
Fix: Make label lookup return an explicit miss and report/ignore invalid playback instead of coercing it to frame zero.

10. **Capitalization compatibility is broader than claimed.** Existing code uses case-insensitive checks such as `label.name.toLowerCase() === "off"`, which also treats custom `OFF` or `oFf` as lifecycle labels.
Fix: Centralize exact canonical-plus-six-lowercase matching and add mixed-case regression tests across normalization and playback.

11. **The destructive migration lacks a recovery gate.** A banner and Git history are insufficient when all keyframes are intentionally deleted and sequential saves may partially succeed.
Fix: Require a pre-save manifest backup/export, show exact deletion counts, obtain explicit confirmation, and record the source revision and migration result.

12. **Cycle handling is incomplete for already-corrupt durable data.** The plan rejects newly authored cycles but does not define whether migration versions or saves compositions containing legacy cycles.
Fix: Validate the full graph before migration, quarantine invalid compositions without versioning them, and report every cycle path.

VERDICT: REVISE

### Codex's response

Accepted all twelve findings. The plan now enforces composition-wide stable-ID uniqueness and one canonical target identity; moves invariants into shared client/server validation; replaces sequential saves with a revision-checked atomic batch migration; enumerates every schema whitelist/round-trip boundary; quarantines label collisions, ambiguous commands, and legacy cycles; restricts base edits to wholly trackless lanes; structurally separates reference wrappers from inner prefab players; makes missing labels explicit misses; narrows lifecycle aliases to exact canonical/lowercase forms; and adds preflight counts, backup, confirmation, and source/result revision recording.

## Round 2 — Codex

Most prior findings are addressed, but material contradictions remain:

1. **Quarantine deadlocks the batch.** The plan leaves invalid compositions unchanged yet says the server validates the complete graph and rejects any invariant violation, so one quarantined cycle or duplicate can prevent every migration and unrelated save.
Fix: Validate changed compositions and their dependency closure while grandfathering unchanged, revision-matched quarantined defects; reject only new or worsened violations.

2. **Target identity still has two canonical forms.** Sections 2, 3, and 5 alternate between stable IDs and scoped paths without defining when paths are required or how commands and tracks compare.
Fix: Persist composition-wide unique component IDs exclusively and derive runtime instance paths from renderer context, or formally specify one versioned scoped-address schema for both tracks and commands.

3. **Command target kinds are undefined.** `playComponent` may target “any component,” but component-local timelines are removed and animation-label validation refers to a target prefab; ordinary components have no authored timeline to play.
Fix: Restrict nested playback commands to reference components, or explicitly define the supported lifecycle-only behavior for ordinary components.

4. **Quarantined dependency compatibility is missing.** A migrated parent can rewrite `child.gotoAndPlay("appear")` to `Appear` while its referenced child remains quarantined with lowercase stored labels, causing cross-version playback failure.
Fix: Quarantine the full dependent reference closure or make lifecycle lookup canonicalize both requested and stored built-in labels across architecture versions.

5. **“Atomic local write” is not guaranteed by the existing storage.** `writeFileSync` writes directly to the manifest and can leave truncated JSON after interruption.
Fix: Implement local batch persistence with a same-directory temporary file, flush, atomic rename, and retained pre-migration backup.

6. **Duplicate-ID handling is internally inconsistent.** Preflight treats duplicates as invalid and quarantines them, while another step says migration repairs them before resolving targets.
Fix: Define a deterministic repairability test: repair only when every track/command is uniquely attributable; otherwise quarantine before mutation.

VERDICT: REVISE

### Codex's response

Accepted all six findings. The plan now grandfather-validates only changed compositions and dependency closures against a revision-matched quarantine baseline; uses composition-wide stable IDs as the sole persisted target identity; restricts nested playback commands to prefab references; canonicalizes both requested and stored built-in lifecycle labels across old/new architecture versions; specifies temp-file, flush, atomic-rename local persistence; and repairs duplicate IDs only when every affected reference is unambiguous.

## Round 3 — Codex

The six prior findings are addressed. Three new material issues remain:

1. **Session drafts can bypass the migration gate.** After in-memory migration, any ordinary edit publishes the entire version-stamped composition set as a draft; reopening can load that draft, skip migration, and preserve destructive changes without backup or confirmation.
Fix: Keep migrated data/version in a separate pending-migration state, exclude it from ordinary draft publication, and stamp/clear drafts only after the atomic batch commit succeeds.

2. **Ordinary manifest saves remain concurrency-unsafe.** Only the migration endpoint is revision-checked; subsequent composition, organization, deletion, or asset saves can still overwrite concurrent whole-manifest changes through the existing retry-with-new-SHA behavior.
Fix: Require revision tokens and latest-manifest field-level merging for every Art Manifest mutation, not only migration.

3. **Cross-version lifecycle lookup can be ambiguous.** A quarantined child may contain both `appear` and `Appear`; normalizing both stored labels makes a canonical request match two frames.
Fix: Require exactly one normalized lifecycle-label match and report ambiguity without playback; treat any dependent migrated command as an unsafe dependency.

4. **“Entire manifest” is not the effective composition graph.** Runtime compositions merge sparse durable overrides with code-defined defaults, so validating only stored JSON can miss inherited components/references, while writing the fully hydrated graph can unintentionally freeze defaults into overrides.
Fix: Preflight the effective merged graph but persist only intentional override deltas, migration metadata, and transformed authored timeline data.

VERDICT: REVISE

### Codex's response

Accepted all four findings. The plan now isolates migration projections from ordinary state/drafts and blocks edits during migration review; makes every Art Manifest mutation revision-aware and field/record merged; requires exactly one normalized built-in label match and quarantines unsafe cross-version dependencies; validates the effective default-plus-override graph while preserving provenance and writing only sparse deltas/tombstones rather than hydrated defaults.

## Round 4 — Codex

The four prior findings are addressed. Three material implementation gaps remain:

1. **Updated code defaults can mask legacy durable overrides.** If a code-defined composition now carries the new architecture version while its sparse durable override contains an unversioned legacy timeline, the effective merge may inherit the new version and skip required migration.
Fix: Determine migration candidacy from field provenance: any authored durable timeline/component override without its own new-version stamp remains legacy regardless of the code-default version.

2. **Conflict merging lacks a usable three-way protocol.** A revision token plus a full replacement record does not tell the server which fields the client changed, especially after the revision becomes stale.
Fix: Send an explicit patch with base values or the base record/revision, then perform a three-way merge; otherwise reject every stale revision rather than guessing.

3. **Revision checking still has a TOCTOU race.** Two requests can both reload and validate the same revision before either writes, and asset replacement mutates files separately from the manifest commit.
Fix: Serialize the complete reload/check/merge/write critical section with a manifest mutation lock or storage-level CAS, and stage asset files with rollback/cleanup around the committed manifest update.

VERDICT: REVISE

### Codex's response

Accepted all three findings. The plan now derives migration candidacy from co-located durable-field/version provenance; defines explicit base-value patch operations and per-path three-way conflict handling; serializes local manifest mutation critical sections, uses GitHub SHA CAS with revalidation, and stages/rolls back asset files transactionally around manifest commits.

## Round 5 — Codex

The three prior findings are addressed. One new security issue remains:

1. **The patch protocol lacks path authorization and prototype-safety rules.** A caller could submit paths outside the endpoint-owned record—or keys such as `__proto__`, `prototype`, or `constructor`—to mutate unrelated manifest data or trigger prototype pollution.
Fix: Whitelist endpoint-specific patch roots and operations, reject dangerous path segments, and enforce patch count/depth/payload limits before three-way merging.

VERDICT: REVISE

### Codex's response

Accepted the finding. The final plan now defines endpoint-owned patch schemas, rejects cross-record paths and prototype-pollution segments before merge, uses validated plain JSON operations, enforces patch count/depth/path/payload limits, and adds adversarial patch-security tests. MAX_ROUNDS was reached, so this revision did not receive a sixth reviewer confirmation and is not represented as approved.
