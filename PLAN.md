# Plan: Rebuild Art Manager prefab timelines around instance ownership
_Locked via grill — by Codex + Mark_

## Goal

Make Art Manager prefab nesting behave like Flash/Animate movie clips: a prefab's timeline owns animation of the component instances placed directly within that prefab, a referenced prefab appears as one independent instance lane, and double-clicking that instance enters the referenced prefab's shared definition timeline. A newly placed prefab instance is static and has a blank lane until the author explicitly creates keyframes. The migration deliberately removes the existing Art Manager keyframe data while preserving composition-level timeline structure, labels, and commands, and capitalizes the six built-in lifecycle animation names without breaking existing flow or layout data.

## Approach

1. **Define and centralize the new timeline and lifecycle contracts.**
   - Add shared constants for the canonical lifecycle labels: `Park`, `On`, `Off`, `Appear`, `Update`, and `Disappear`.
   - Add a boundary normalizer that accepts only the six legacy lowercase aliases and maps them to the canonical labels. Custom labels remain exact and case-sensitive.
   - Replace scattered lifecycle string literals in shared defaults, Art Manager, stage/layout runtime, Flow Tool defaults, visual-object state handling, and code-authored timelines with the shared contract.
   - Regenerate/check the committed shared JavaScript counterparts required by the repository's TypeScript/JavaScript freshness rules.

2. **Make composition timelines the only authored timeline owners.**
   - Persist one authored timeline per `ArtComposition`; components no longer persist independent timelines.
   - A composition timeline's tracks target component instances within that composition exclusively by composition-wide unique stable component ID.
   - Ordinary containers are structural only and do not create timeline scopes.
   - Reference components create prefab boundaries: the parent timeline may target the reference instance but may not expose or directly target the referenced prefab's internals.
   - Remove the hydration logic that migrates composition tracks into component timelines and remove the display-only recursive merging of component/reference timelines into a parent timeline.
   - Split reference rendering structurally into an outer instance wrapper and an inner prefab-content renderer/player. Parent tracks affect only the wrapper; the referenced composition timeline affects only the inner content, so their snapshots cannot compete for the same transform target.

3. **Introduce an explicit three-part component identity.**
   - Keep the existing stable component `id` as internal persisted identity and command storage identity.
   - Keep a human-readable display `name` for Layers and inspectors.
   - Add a persisted `instanceLabel` for command authoring, such as `answerBubble`.
   - Require `instanceLabel` to be a non-reserved lower-camel JavaScript identifier and unique across the entire current prefab definition. Reference boundaries start a new label namespace.
   - Generate deterministic labels for legacy components from their display names, suffixing collisions (`answerBubble2`, etc.). New components receive a valid suggested label and the editor rejects invalid or duplicate values with a suggested correction rather than silently rewriting input.
   - Persist command targets by stable ID. Render and parse action script using the current readable `instanceLabel`, so renaming a label updates displayed script without breaking stored commands.
   - Enforce composition-wide uniqueness for stable component IDs during migration, validation, and save. Repair duplicate legacy IDs deterministically before resolving commands/tracks, and update every resolvable same-composition reference to the repaired ID.
   - Use one canonical persisted target identity for both commands and tracks: the composition-wide unique immutable component ID. Structural/runtime instance paths are derived from renderer/navigation context and are never persisted as command or track targets.

4. **Implement the one-time Art Manager architecture migration.**
   - Add a persisted per-composition timeline architecture version because Art Manager compositions are saved independently.
   - Treat legacy/unversioned compositions as migration candidates; new compositions start at the new version.
   - Build the preflight graph with the same provenance-aware merge used by runtime: code-defined default compositions plus sparse durable overrides plus any saved custom compositions. Validate this effective graph so inherited references/components are included, but retain source provenance for every field.
   - Determine migration candidacy from durable-field provenance, not the effective composition's inherited version. Any durable authored timeline/component override without its own co-located new-version stamp is legacy and must be migrated even when the code-defined default composition already carries the new architecture version.
   - Store/interpret the architecture version at the same durable override boundary as the timeline/component fields it governs; never let a default version mask an unversioned authored override.
   - Run a read-only preflight over that effective graph before mutating any composition. Validate reference cycles, duplicate IDs, label canonicalization collisions, command targets, reference-boundary rules, and generated instance-label uniqueness.
   - Classify duplicate IDs as repairable only when structural location plus every existing track/command reference yields one unambiguous target. Repair those IDs deterministically and rewrite uniquely attributable references before other migration steps. If any reference is ambiguous, quarantine the composition without mutation.
   - Quarantine any invalid composition: leave its source data and old version untouched, exclude it from the migration batch, and report every blocking issue/cycle path for manual repair. Never stamp a version onto invalid data.
   - For every preflight-clean legacy Art Manager composition:
     - remove every timeline track/keyframe from the composition timeline;
     - preserve `fps`, `frameCount`, composition-level labels, and composition-level commands;
     - rename exact legacy lifecycle labels to their canonical capitalized names;
     - rewrite exact lifecycle animation references in `gotoAndPlay`, `gotoAndStop`, `playComponent`, and `stopComponent` commands to canonical names;
     - remove component-local timelines completely, including their generated labels/commands/tracks;
     - generate and validate component `instanceLabel` values;
     - set the new architecture version.
   - Detect collisions such as both `appear` and `Appear` before lifecycle canonicalization. Block that composition with a resolution error rather than merging or dropping a label.
   - Migrate command targets deterministically: resolve each legacy ID, scoped path, display name, or instance label within the current composition and without crossing a reference boundary; convert exactly one match to the canonical stable target identity. If resolution is missing or ambiguous, preserve the original command unchanged, quarantine the composition, and require manual repair.
   - Keep the migrated projection and architecture version in a separate pending-migration state rather than replacing the ordinary editable/saved composition state. Do not publish pending migrated data through session drafts, dirty snapshots, autosave-like paths, or ordinary composition saves.
   - Enter an explicit migration-review mode that allows inspection of the dry-run result but blocks ordinary Art Manager editing until the user commits or dismisses/reloads the migration. This prevents ordinary edits from mixing with destructive pending state.
   - Show a dry-run migration summary/banner with source revision, affected/quarantined composition counts, IDs repaired, labels renamed, commands converted, and exact tracks/keyframes scheduled for deletion.
   - Require explicit confirmation immediately before the destructive save and create a downloadable/source-of-truth backup of the pre-migration manifest. For local storage, also use the existing backup mechanism; for GitHub storage, record the source commit/SHA and resulting migration commit/SHA.
   - Persist all migrated compositions through a new revision-checked batch migration endpoint, not sequential per-composition saves. The server reloads the latest manifest, verifies the supplied source revision, rebuilds the effective graph, validates every changed composition plus its reference dependency closure, applies/merges the whole migration atomically, and performs one local write or one GitHub commit. A revision mismatch aborts without writing and requires a fresh preflight.
   - Grandfather revision-matched defects in unchanged quarantined compositions so one legacy cycle/ambiguity does not block the clean batch or unrelated saves. Reject any changed composition that introduces, depends unsafely on, or worsens an invariant violation. Record the grandfathered baseline issues by composition/revision and require a fresh comparison after concurrent changes.
   - For local storage, implement the batch write with a same-directory temporary file, file flush/sync, atomic rename, and retained pre-migration backup; never overwrite the manifest directly. GitHub storage uses one revision-checked content commit.
   - Persist only provenance-aware intentional deltas: migration metadata, transformed authored timeline/command fields, necessary identity fields, and explicit empty/tombstone values needed to suppress legacy authored overrides. Never serialize the fully hydrated effective graph back into durable overrides or freeze unrelated code defaults.
   - Update code-defined default Art Manager compositions to the new architecture in source so their effective timelines/component shapes no longer depend on a durable full-copy migration. Sparse overrides remain sparse after migration.
   - Stamp the in-memory version, replace editor state, and clear any legacy Art Manager session draft only after the atomic batch commit succeeds. On failure, leave the original ordinary state/draft and pending migration report intact without treating the migration as saved.
   - If the user closes without saving, migration safely reruns on the next load. Once saved, the version prevents the reset from ever running again.
   - Do not clear keyframes from code-authored/non-Art-Manager timelines. Those timelines adopt the canonical lifecycle labels but retain their motion data for a later dedicated migration.
   - Update every whitelist/normalization boundary to preserve `instanceLabel`, the architecture version, and canonical command target fields: client types/serialization, draft publication/hydration, server public/save normalization, local/GitHub manifest storage, response shaping, and reload. Add round-trip tests at each boundary.

5. **Make timeline lanes stop at prefab boundaries.**
   - Build lanes from all components authored in the current composition, including descendants of ordinary structural containers.
   - Represent each reference component as one instance lane and stop traversal there.
   - Do not resolve a reference's source components when constructing lanes, timeline targets, selection overlays, or the current display timeline.
   - Use composition-wide unique component IDs for lane/track identity. Renderer-local instance paths distinguish repeated prefab renderings at runtime without entering persisted timeline targets.
   - A new reference has no authored track; its lane therefore contains no keyframes while it renders from base properties.

6. **Separate base-property editing from explicit keyframe authoring.**
   - When the selected lane has no track anywhere, canvas/inspector edits update base component properties and do not create a track.
   - Once a track exists, editing at a frame without a keyframe is blocked from changing base properties; the editor prompts the author to create/select a keyframe. This prevents an interpolated display state from disagreeing with a hidden global base edit.
   - Creating a keyframe is an explicit action. The new keyframe captures a complete snapshot of position, size, scale, rotation, opacity, and visibility.
   - When a keyframe exists at the current frame, canvas/inspector edits update that keyframe.
   - Removing the last keyframe removes the now-empty track and returns the lane to its static/base-property behavior.
   - Tween creation continues to require suitable explicit keyframes and operates only within the active composition timeline.

7. **Preserve and harden nested command semantics.**
   - Parent timelines control nested prefabs explicitly with instance-label syntax such as `child.gotoAndPlay("Appear")`; no same-name animation is implicitly cascaded into children.
   - The script editor resolves the instance label to a stable ID when saving commands and resolves that ID back to the current label when displaying commands.
   - `playComponent`/`stopComponent` (and instance-label `gotoAndPlay`/`gotoAndStop` syntax) may target reference components only, because only referenced compositions own nested authored timelines. Ordinary structural/leaf components are animated by the current composition's tracks and are not nested playback targets.
   - Parent commands may not cross a reference boundary to a grandchild. The referenced prefab controls its own internals from its own timeline.
   - Preserve all existing composition commands verbatim except the exact lifecycle-name capitalization migration.
   - Add editor validation for missing targets, duplicate labels, boundary-crossing targets, and missing/case-mismatched animation labels on the target prefab. Validation reports errors; it never silently deletes or retargets commands.
   - Remove or rewrite tests whose only purpose is to endorse parent-to-grandchild reference paths.
   - Move command/graph/label validation into shared pure modules consumed by both the editor and server. The server rejects the complete save/migration atomically when any ID, label, cycle, boundary, command-target, or animation-label invariant fails; API callers cannot bypass editor checks.
   - Replace label lookup's current frame-0 fallback with an explicit found/missing result. Invalid playback commands and external inputs are ignored and surfaced through validation/diagnostic hooks instead of executing frame 0.

8. **Make prefab navigation an explicit editor scope.**
   - Single-click selects an instance without changing timeline scope.
   - Double-click enters only a referenced prefab's shared composition; ordinary containers never open independent timelines.
   - Display a breadcrumb containing the parent prefab, instance label, and nested prefab chain.
   - Support outward navigation through “Back to Parent Timeline,” breadcrumb clicks, and double-clicking empty canvas.
   - Store navigation entries by stable composition/instance IDs and restore parent frame, selected instance, playhead/window position, and relevant timeline selection when returning.
   - Editing a nested prefab edits the shared definition and updates every instance preview.

9. **Prevent recursive prefab graphs.**
   - Before adding or changing a reference, traverse the composition reference graph and reject direct or transitive cycles.
   - Apply the same validation to drag/drop and inspector prefab selection.
   - Surface a clear editor error naming the cycle path.
   - Keep defensive visited/depth guards in preview/runtime traversal even though invalid graphs cannot be newly authored.
   - Validate the full existing graph before migration or ordinary save. Legacy cycles are quarantined and reported without being mutated/versioned.

10. **Align editor preview, persistence, and runtime behavior.**
    - Preview only the active composition timeline; do not synthesize recursively merged child tracks.
    - Parent timeline snapshots animate the placed reference wrapper through its stable instance path.
    - Explicit child commands resolve the referenced prefab's composition timeline and animate its internal contents.
    - A blank instance lane renders continuously from base properties, while the referenced prefab initializes to its own default state (`On` unless configured otherwise).
    - Verify that parent wrapper animation and child internal animation can run together without one overwriting the other.
   - Keep reference definition lookup shared between Art Manager preview and stage runtime so the two surfaces resolve the same source timeline.
   - Add runtime diagnostics for missing component targets, missing animation labels, and rejected boundary crossings so failures do not silently degrade to frame 0 or the wrong object.
   - Resolve canonical lifecycle labels across architecture versions by normalizing both the requested name and each stored built-in label through the exact six-name compatibility table before comparison. Require exactly one normalized stored match; zero or multiple matches are reported and ignored without playback. Custom labels remain exact/case-sensitive.
   - Treat a migrated command that depends on a quarantined child with ambiguous normalized lifecycle labels as an unsafe dependency: quarantine the parent command/composition rather than claiming compatibility.

11. **Roll lifecycle capitalization through dependent tools compatibly.**
    - Flow Tool defaults, autocomplete, summaries, and newly edited/saved lifecycle actions use canonical capitalized labels.
    - Existing saved flow animation names remain accepted through the six-name compatibility normalizer and are canonicalized only when the flow is deliberately saved; opening Art Manager does not dirty Flow data.
    - Apply the same compatibility behavior to layout/component `defaultAnimationState` values. Existing layout documents are not dirtied by the Art Manager migration; new/default/future-saved values use canonical names.
   - Keep custom animation labels case-sensitive and provide target-aware autocomplete/validation.
   - Define lifecycle recognition as exact canonical names plus the six exact all-lowercase legacy aliases only. Mixed-case forms such as `aPpear`, `OFF`, or `oFf` remain custom labels and receive regression coverage.

12. **Make every Art Manifest mutation revision-safe.**
   - Include a manifest revision token in Art Manager read responses and require it on migration, composition save, organization save, composition deletion, and asset replacement/deletion mutations.
   - Send explicit patch operations plus the client's base revision and base values/hashes for every touched field/record; do not send an ambiguous full replacement as the concurrency contract.
   - Define endpoint-specific patch schemas that whitelist allowed record roots, field paths, and operations. A composition endpoint can touch only its named composition override; organization and asset endpoints can touch only their owned records; migration can touch only the preflight-approved composition delta set and migration metadata.
   - Reject `__proto__`, `prototype`, `constructor`, empty/relative segments, unexpected array traversal, and any non-whitelisted path before reading or merging values. Operate on validated plain JSON data without prototype-bearing assignment helpers.
   - Enforce bounded patch operation count, path depth/length, and request/value payload sizes before three-way comparison to prevent resource-exhaustion or oversized mutation attacks.
   - On every mutation, reload the latest manifest and perform a three-way merge: for each patch path, compare the latest value with the supplied base value, apply the patch only when that path is unchanged, and return a structured per-path conflict otherwise. Treat arrays and destructive record operations atomically unless a narrower domain merge is explicitly defined.
   - Remove the existing “retry with latest SHA but same stale whole manifest” behavior. GitHub writes use the latest verified SHA and one merged content commit; local writes use revision comparison plus temp-file/flush/atomic-rename.
   - Serialize the entire reload/check/merge/write critical section. Local storage uses a process mutation queue/lock around revision verification and atomic rename. GitHub storage uses the content SHA as storage-level compare-and-swap; on SHA conflict it reloads and reruns the same three-way base checks, never blindly reapplies stale content.
   - Stage asset replacement bytes under a unique temporary/versioned filename before entering the manifest transaction. Under the mutation lock/CAS, commit the manifest reference only after the staged file is ready; on manifest failure delete the staged/new file and retain the old file/reference, and delete the old file only after manifest success. Cover crash leftovers with deterministic cleanup.
   - Return the new manifest revision after every successful mutation and update the client controller before allowing the next write.
   - Preserve sparse default overrides and unrelated asset/organization/composition records during every merge.

13. **Add focused migration, editor, runtime, and persistence tests.**
   - Migration tests: tracks removed; component timelines removed; labels/commands/settings preserved; lifecycle names canonicalized; collisions quarantine rather than merge; stable version prevents a second reset; pending migration is excluded from drafts/ordinary dirty state; review mode blocks ordinary edits; preflight counts are exact; revision mismatch writes nothing; one batch save creates one atomic manifest revision.
   - Identity tests: deterministic lower-camel label generation, reserved-word rejection, whole-prefab uniqueness, composition-wide stable-ID uniqueness, repairable-versus-ambiguous duplicate classification, ID-only track/command targets, stable command IDs across label renames, and namespace reset at reference boundaries.
    - Lane tests: new reference lane is blank; reference internals are absent; structural descendants remain; two instances of the same prefab have distinct target paths.
    - Editing tests: base edits do not create keys; explicit keys capture complete state; keyed edits update only the key; last-key removal restores a blank lane.
    - Navigation tests: single-click does not enter; double-click reference enters shared definition; ordinary container does not; breadcrumb/back/empty-canvas navigation restores frame, selection, and timeline window state.
   - Command tests: `child.gotoAndPlay("Appear")` resolves by label to stable ID, survives rename, plays the child's definition, rejects ordinary-component targets, rejects missing/case-mismatched custom labels, rejects grandchild boundary crossings, quarantines ambiguous legacy targets, supports canonical built-ins across legacy/new child versions, and never falls back to frame 0.
    - Cycle tests: direct and transitive reference cycles are rejected on drop and inspector changes; defensive traversal guards terminate on corrupt legacy input.
   - Runtime tests: static blank instances render; parent instance tracks animate outer wrappers only; child definition commands animate inner content only; both can coexist; missing/ambiguous normalized labels are ignored/reported; exact legacy lowercase lifecycle inputs still execute while mixed-case custom labels are not normalized.
   - Save/reload tests: migrated schema/version/labels/commands survive session-draft exclusion, server whitelist, provenance-aware sparse override persistence, local/GitHub storage, API response, and reload without source-prefab mutation, field stripping, default freezing, partial writes, lost concurrent updates, or repeated keyframe deletion; local interruption tests prove temp-file/flush/atomic-rename behavior and backup retention.
   - Server-validation tests: malformed direct API saves for duplicate IDs/labels, cycles, boundary-crossing commands, and missing targets are rejected atomically.
   - Quarantine tests: unchanged revision-matched legacy defects do not block a clean migration batch or unrelated save, while any new/worsened defect or unsafe dependency does.
   - Manifest concurrency tests: explicit base-value patches for every mutation type merge disjoint record/field changes safely or return per-path conflicts; simultaneous same-revision requests are serialized/CAS-protected; no retry can overwrite a newer unrelated manifest change.
   - Patch-security tests: every endpoint rejects cross-record/root mutations, unapproved operations, prototype-pollution segments, excessive count/depth/path length, and oversized values before merge/write; valid patches cannot escape their owned manifest record.
   - Asset transaction tests: manifest conflict/write failure rolls back staged files and preserves the old active asset; success switches the manifest then cleans the old file; crash-leftover cleanup is safe.
   - Effective-graph tests: inherited default references participate in cycle/target validation, while migrated writes contain only intended sparse deltas/tombstones and continue inheriting future untouched default changes.
   - Provenance tests: a new-version code default plus an unversioned durable timeline override is still migrated; only a version stamp co-located with the governed durable override suppresses rerun.

14. **Validate proportionally before handoff.**
    - Run focused Art Manager, timeline model/player, stage art renderer, layout runtime, Flow Tool, shared freshness, typecheck, and lint tests during implementation.
    - Run the repository's full `npm run check` before completion.
    - Exercise the exact browser workflow manually: create parent prefab, add child prefab, confirm blank instance lane, author an instance keyframe, issue a label-based child command, enter/edit/exit nested prefab, create a second instance, save/reload, and verify stage runtime behavior.
   - Confirm the migration dry-run counts, backup artifact, confirmation gate, source revision, atomic batch result, and quarantine report against a representative copy of the durable Art Manager manifest before using it on source-of-truth data.

## Key decisions & tradeoffs

- **Parent-owned instance animation:** Instance keyframes live in the containing composition timeline. This matches the runtime root timeline and Animate's symbol model, at the cost of replacing the recent component-owned timeline implementation.
- **Prefab-only timeline boundaries:** Ordinary containers stay structural. This makes navigation and command scope predictable but removes independent inline-container timelines.
- **Intentional clean keyframe reset:** All persisted Art Manager tracks are discarded once. This sacrifices current animation motion to avoid carrying flawed ownership data into the new architecture; composition labels and commands are retained.
- **Composition-only preservation:** Component-local timelines are removed rather than migrated because they have no owner in the locked architecture. Available default/durable data contains no authored component commands.
- **Explicit nested playback:** Parent and child animation labels do not implicitly cascade. Authors use instance commands, which prevents accidental coupling between shared lifecycle/custom names.
- **Stable IDs plus readable labels:** Commands persist IDs but render lower-camel instance labels. This adds schema/UI complexity while making renames safe and scripts readable.
- **ID-only persisted target identity:** Composition-wide unique stable IDs are the sole command/track target form; runtime instance paths are contextual. This removes path/ID ambiguity while keeping repeated prefab instances distinguishable through renderer ownership.
- **Canonical PascalCase lifecycle contract with narrow aliases:** New data uses capitalized built-ins, while only the six historic lowercase forms remain compatible. This avoids breaking existing flows/layouts without weakening case-sensitive custom labels.
- **One visible global save:** Migration is automatic in memory but never silently persisted. The user performs one global Save, balancing convenience with durable-data safety.
- **Atomic revision-checked migration:** The destructive reset uses one batch manifest commit after preflight, backup, and confirmation. This adds a dedicated endpoint but prevents partial migration and lost concurrent edits.
- **Pending migration isolation:** Destructive projections never enter ordinary drafts or saved editor state before confirmed commit. Migration review is temporarily read-only, trading editing convenience for a trustworthy recovery gate.
- **Revision-safe manifest-wide persistence:** Every Art Manifest mutation carries a revision and merges only owned records/fields. This expands scope beyond timelines but closes the existing whole-manifest lost-update path exposed by the migration.
- **Explicit three-way patches plus CAS:** Clients send touched paths and base values; local writes serialize the critical section and GitHub uses SHA compare-and-swap. This adds protocol complexity but removes stale full-record guessing and TOCTOU lost updates.
- **Schema-authorized safe patches:** Each endpoint owns a narrow patch surface with dangerous-segment and resource-limit enforcement. This prevents the concurrency protocol from becoming a cross-record mutation or prototype-pollution primitive.
- **Effective validation, sparse persistence:** Validation sees default-plus-override reality, while writes preserve provenance and store only deltas/tombstones. This avoids missing inherited defects or freezing code defaults.
- **Shared server-enforced invariants:** Editor feedback remains immediate, while the server independently rejects invalid graphs/targets/labels. This prevents alternate API clients from bypassing the architecture.
- **Grandfathered quarantine baseline:** Clean compositions can migrate even when unchanged legacy data remains invalid, but changed/new violations are rejected. This avoids a global deadlock without normalizing corrupt data as valid.
- **Outer wrapper versus inner prefab content:** Parent and child players never write the same transform layer. This adds a DOM/runtime boundary but makes nested animation ownership enforceable rather than conventional.
- **Hard reference boundaries and cycle rejection:** Parent timelines cannot reach through prefab instances, and cyclic graphs cannot be authored. This reduces flexibility intentionally in exchange for deterministic ownership and traversal.

## Risks / open questions

- The durable GitHub Art Manager manifest should be re-read immediately before implementation validation because the local `origin/game-data` reference may not reflect unsaved browser drafts or newer remote edits.
- Stable-ID command persistence requires a serialization shape that remains compatible with any legacy string-target consumers; implementation should introduce a single resolver/normalizer instead of parallel code paths.
- Capitalizing lifecycle names touches a broad runtime surface. The compatibility normalizer must sit at every external boundary (flow actions, layouts, default states, direct runtime play calls) until all durable data is naturally resaved.
- The migration deliberately removes animation tracks. Validation must use a copy/fixture of durable data first and report exact composition/track/keyframe counts before and after.
- Navigation restoration currently tracks only part of the timeline UI state. The implementation must define a serializable navigation snapshot rather than relying on component-local React state that resets on remount.
- A legacy composition with lifecycle-label collisions, ambiguous command targets, duplicate IDs that cannot be repaired safely, or reference cycles will be quarantined rather than included in the global batch. The preflight report is the manual repair queue.
- Sparse durable overrides must retain provenance through client/server normalization; losing provenance would either miss inherited graph defects or cause hydrated defaults to be persisted accidentally.
- Architecture-version provenance is part of migration safety: inherited default metadata never exempts an unversioned durable authored override.

## Out of scope

- Re-authoring any discarded Art Manager animation keyframes.
- Migrating code-authored/bespoke visual timelines into Art Manager; their existing keyframes remain intact.
- Automatically rewriting or saving unrelated durable Flow Tool or Layout Tool documents when Art Manager is opened.
- Supporting direct parent commands to descendants inside a referenced prefab.
- Supporting implicit same-name animation playback across parent/child prefab boundaries.
- Supporting circular prefab references.
- Implementing the plan before the user signs off after adversarial review.
