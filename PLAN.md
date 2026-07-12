# Plan: Separate editable Shapes from image-backed Sprites
_Locked via grill — by Codex + Mark_

## Goal

Make Art Manager component semantics literal and predictable: a Shape is always native editable geometry whose style, fill, gradient, border, and radius directly define the visible artwork, while a Sprite is SVG/bitmap artwork whose bounds, source, fit, render mode, and tint are edited independently. Migrate every existing image-backed Shape automatically, convert all shared avatar-frame artwork into genuine full-bounds native Shapes, preserve authored layout/timeline identity, and keep editor preview and stage runtime behavior identical.

## Approach

1. **Define one shared component-kind contract.**
   - Add `sprite` to the shared supported and creatable component kinds in both the TypeScript source and required JavaScript counterpart.
   - Keep `shape`, `container`, `badge`, `text`, and `reference` behavior unchanged except that Shapes no longer accept or render image fields.
   - Add top-level durable `artComponentSchemaVersion: 1` metadata and an `ART_COMPONENT_SCHEMA_VERSION` constant. Use an idempotent shared migration function for server reads, saves/imports, local data, tests, and the one-time live data rewrite; never infer completion solely from component contents.
   - Preserve the existing flat image source fields (`imageAssetId`, `imageDataUrl`, `imageName`, `imageMimeType`, and `imageObjectFit`) to avoid needless asset-system churn, but make them valid only for `kind: "sprite"`.
   - Add `spriteRenderMode: "original" | "tinted"`; retain `imageTint` as the Sprite-only tint value so existing timeline asset/tint fields can migrate without losing behavior.

2. **Give Sprite explicit, non-Shape rendering semantics.**
   - Original mode renders the authored SVG/PNG/JPG/WEBP colors with object-fit behavior and source transparency.
   - Tinted mode uses the source alpha/silhouette as a mask and fills it with a validated CSS color from `imageTint`, including `currentColor` for player colors. Original mode preserves but ignores the inactive tint value.
   - Sprites have no Shape Style, fill, gradient, border, radius, or implicit shaped clipping.
   - Sprite width/height are its editable stage bounds, not a second styled canvas. Transparent source pixels remain transparent, while selection and transform handles continue to use the rectangular bounds.
   - Keep explicit shaped clipping/masking out of scope; add it later as a distinct mask/container relationship if needed.

3. **Separate the Art Manager inspector and creation workflows.**
   - Add Sprite to the component creation controls with an appropriate default layer name and lower-camel instance label.
   - For Shapes, show only geometry/style controls: Shape Style, fill color, fill gradient, border color/width, and radius.
   - For Sprites, show only image controls: library asset, file upload, Render Mode, Object Fit, and Tint (Tint visible/enabled only when useful in Tinted mode).
   - Populate the library picker from the existing Art Assets response and store shared asset IDs rather than embedding duplicates.
   - New Sprites default to Original mode, Contain fit, and an inactive `currentColor` tint.
   - When the first source is assigned to a new empty Sprite, read its intrinsic aspect ratio and set its longest side to `clamp(32, min(180, 0.5 * min(canvasWidth, canvasHeight)), 180)` stage units, deriving the other side from the aspect ratio. If dimensions cannot be read, keep the empty Sprite's existing default bounds and report a non-blocking warning. Replacing a source on an existing Sprite preserves bounds, position, scale, rotation, origin, visibility, and timeline keys.
   - Validate uploads with the existing supported MIME/size rules and preserve current embedded-image support.

4. **Make serialization and server normalization kind-aware.**
   - Update client hydration, editing snapshots, draft publication, save serialization, server public shaping, server save normalization, and reload so Sprite fields round-trip and Shape records cannot retain image fields.
   - Normalize stale clients/imports safely: a legacy Shape carrying a valid image source is migrated before Shape-only field stripping occurs. A current-version manifest containing a Shape with image fields is rejected as invalid instead of silently changing meaning.
   - Reject invalid Sprite records without a usable shared asset or supported embedded image at authoring/save boundaries, while allowing an explicitly empty new Sprite in unsaved editor state.
   - Update component labels, organization items, clipboard/copy-paste, prefab extraction, reference bounds, swap operations, undo/redo, and multi-selection logic to recognize Sprite as a first-class component.

5. **Keep Sprite properties keyframeable and stepped where required.**
   - Continue keyframing `imageAssetId`, `imageObjectFit`, and `imageTint`; add `spriteRenderMode` to the allowed timeline property set.
   - Treat image source and render-mode changes as held/stepped values. Never interpolate string/enumeration properties.
   - Preserve ordinary tweening for x, y, width, height, scale, rotation, and opacity.
   - Migrate legacy image-backed keyframes by preserving transform/visibility/opacity fields, preserving image source/fit/tint fields, adding the inferred render mode, and removing Shape-only style fields from Sprite tracks.
   - Ensure the six-frame `Avatars` prefab remains one Sprite layer with held asset changes for Rex, Stego, Trike, Raptor, Bronto, and Cleo.

6. **Render identically in editor preview and game runtime.**
   - Split the current Shape/image branch in `ArtPreviewRenderer` into explicit Shape and Sprite branches.
   - Split runtime DOM/class/CSS generation similarly: Shape uses native fill/gradient/border/radius; Sprite Original uses an image element/background with object fit; Sprite Tinted uses mask plus tint.
   - Update live timeline application so asset, fit, tint, and render-mode changes refresh the correct Sprite presentation without leaving stale mask/image classes or URLs.
   - Keep reference rendering, nested timelines, currentColor propagation, locking, visibility, transforms, and intrinsic composition bounds working for Sprite layers.
   - Remove misleading `has-image-mask`/`is-shape` coupling where practical; use Sprite-specific classes and helpers with temporary compatibility aliases only where rollout safety requires them.

7. **Apply an automatic, exhaustive migration.**
   - Migrate every persisted/default component recursively, including children inside legacy containers and custom prefabs.
   - Classify migration from the component's persisted base source, not from a transient timeline frame. A Shape whose base source is an avatar frame becomes the native background; another image-backed Shape remains a Sprite even if one of its timeline frames temporarily selects `avatar-frame`.
   - For every image-backed Shape other than a component whose base source is the shared avatar frame:
     - change `kind` to `sprite`;
     - infer Tinted mode only when legacy rendering actually treated it as tinted (`imageTint === "currentColor"`); otherwise infer Original so migration cannot alter previously full-color output;
     - preserve component ID, name, instance label, order, transform, bounds, origin, lock/visibility flags, source, fit, tint, timeline targets, and commands;
     - remove Shape-only fields from the component and its Sprite keyframes.
   - For every component using `imageAssetId: "avatar-frame"`:
     - keep/change it to `kind: "shape"`;
     - remove all image fields;
     - use full component bounds with `shapeStyle: "rounded"`, fill `#fff6d8`, border `#17131f`, approximately 6px border, and approximately 13px corner radius;
     - preserve its component ID, instance label, order, transform, bounds, and timeline identity.
   - Update the built-in avatar/player-object defaults and both TS/JS generated counterparts so fresh installs never recreate the legacy representation.
   - Rewrite the live `game-data/art-manifest.json` once after compatible code is deployed, including top-level schema version metadata, the new `Avatars` Sprite, and native `Player Avatar MC` background.
   - Require no per-composition manual save. Re-running migration on already-versioned/current data must produce a byte-equivalent semantic result.

8. **Use a compatibility-first rollout.**
   - First ship main-branch code that can read both legacy image-backed Shapes and new Sprites, migrates legacy data in memory, and saves only the new schema.
   - Verify/deploy that code before writing `kind: "sprite"` to the live game-data branch so the old production normalizer cannot downgrade unknown kinds to Shape.
   - Then migrate and push the durable game-data manifest in one commit based on the latest remote revision; abort/rebase if the branch advanced.
   - Keep the registered `avatar-frame` asset available for backward imports and intentional Sprite use, but remove it from built-in/native background components.
   - Preserve a source commit/backup reference and produce a migration report with counts by rule, changed composition IDs, and any rejected records.

9. **Test the contract at every boundary.**
   - Shared schema tests: kind normalization, Sprite defaults, render-mode inference, Shape field stripping, recursive/idempotent migration, and invalid source handling.
   - Client model/editor tests: create Sprite, library selection, upload aspect sizing, replacement property preservation, inspector field separation, serialization/draft/undo/clipboard round trips, and prefab/reference bounds.
   - Timeline tests: held asset swaps, mode/tint/fit keys, removal of legacy Shape fields, non-interpolation, copy/paste, and `Avatars` frame switching.
   - Preview tests: native Shape circle/fill/gradient/border behavior; Sprite Original and Tinted output; no Shape clipping of Sprites; currentColor tint.
   - Runtime tests: stage DOM/CSS parity, timeline source changes, nested prefab rendering, and stale-class cleanup when modes/assets change.
   - Server tests: legacy read migration, current-schema round trip, stale-client save migration, recursive components, built-in defaults, and idempotence.
   - Data validation: enumerate all live image-backed Shapes before/after; expect zero remaining, expected Sprites for dinosaur/cursor art, and native Shapes for every avatar frame.
   - Run focused Vitest suites, the full test suite, build/type checks, and a browser smoke test in Art Manager plus stage runtime before live data migration.

## Key decisions & tradeoffs

- The new type is named **Sprite**, matching the Flash/Animate mental model and supporting both SVG and bitmap sources.
- Sprite supports **Original** and **Tinted** render modes. Tinted is explicit rather than inferred during ordinary rendering.
- Shape and Sprite inspectors are mutually exclusive; image assignment is never available on Shape.
- Existing image field names are retained internally for compatibility, but are legal only on Sprite. This avoids a high-risk asset/timeline rename with no user-facing benefit.
- Sprite source, mode, fit, and tint are keyframeable; source and mode are stepped values.
- Avatar Background becomes a full-bounds native Shape rather than preserving the legacy SVG’s transparent margin.
- All current and legacy compositions migrate automatically, not only the new player prefab chain.
- Shaped Sprite clipping is deferred to a future explicit mask system.
- Rollout is code-first, data-second to prevent an older server from coercing unknown Sprite kinds back to Shape.

## Risks / open questions

- Production deployment state must be confirmed before the live manifest receives Sprite records; the staged rollout and compatibility reader are mandatory.
- Browser image intrinsic-dimension loading is asynchronous and needs deterministic fallback/error behavior for malformed SVGs or unavailable library assets.
- Embedded image data can make manifests large; this plan preserves current limits but does not redesign asset storage.
- Native CSS border/radius rendering will be semantically editable but may differ by a few pixels from the old SVG; the agreed priority is full-bounds, honest Shape geometry.
- Existing custom image-backed Shapes not present in the current manifest will migrate on future import/load; fixtures should cover unusual tint and timeline combinations.

## Out of scope

- Arbitrary vector-path editing or converting complex SVG paths into native geometry.
- Shaped Sprite clipping, alpha-mask graphs, or parent/child masking relationships.
- A new external asset-storage service or changes to current upload size/type limits.
- Reworking prefab timeline ownership, command syntax, player selection runtime wiring, or legacy player-object removal beyond the component-kind migration required here.
- Visual redesign of the dinosaur silhouettes, cursor artwork, player layout, or lifecycle animations.
