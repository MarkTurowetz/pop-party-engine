# Plan Review Log: Separate editable Shapes from image-backed Sprites
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

## External review status

The required separate Codex CLI review was attempted twice in read-only mode. The execution environment denied transmission of the private plan/repository to the external model service, including after the user explicitly approved it. No repository content was transmitted. Cross-model review could not be completed and was not bypassed.

## Local adversarial fallback — Codex

1. **Migration completion was underspecified.** Content inference alone could rerun or skip partial migrations.
   - Fix: add explicit top-level `artComponentSchemaVersion: 1` metadata plus an idempotent shared migration.
2. **Tint inference could change existing full-color output.** Legacy rendering only treated `currentColor` as a mask tint, while the plan proposed treating any non-empty tint as Tinted.
   - Fix: infer Tinted only for `imageTint === "currentColor"`; validate arbitrary tint colors only for newly explicit Tinted records.
3. **Sprite initial sizing was not deterministic.** “Sensible default” could diverge across editor code and tests.
   - Fix: define a bounded canvas-relative longest-side formula with an explicit unreadable-dimensions fallback.
4. **The avatar-frame special case could misclassify mixed Sprite timelines.** A Sprite may select `avatar-frame` only on one keyframe.
   - Fix: classify native-background migration from the component's base source, not timeline-frame sources.
5. **Current-version corrupt records could be silently reinterpreted.** Always auto-converting Shape+image would hide bugs after migration.
   - Fix: auto-migrate only legacy/unversioned data; reject Shape image fields in current-version manifests.
6. **Arbitrary Sprite tint behavior was not explicit.** Runtime currently special-cases only `currentColor`.
   - Fix: validate CSS tint colors, apply them directly in Tinted mode, and ignore-but-preserve tint in Original mode.

All six findings were incorporated into `PLAN.md`. No additional material flaw was found in the revised local plan.

LOCAL VERDICT: APPROVED
