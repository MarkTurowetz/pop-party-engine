---
name: build-party-game-widgets
description: Construct and review layered Art Manager prefabs for Party Game Template using separate visual-state, lifecycle-animation, compound-widget, and dynamic-collection responsibilities. Use when creating, refactoring, migrating, wiring, or debugging text fields, voting cards, player widgets, MC-style prefab hierarchies, layout containers, runtime anchors or hitboxes, runtime-spawned item prefabs, child timeline commands, semantic states, reveal animations, or other reusable game objects in this repository.
---

# Build Party Game Widgets

## Apply the ownership hierarchy

Separate orthogonal behavior into three levels:

```text
Compound Widget MC
└── Animated Component MC
    └── Base Visual/State Prefab
        ├── Foreground content (top, for example Text)
        └── Background (bottom)
```

Treat the current authored Voting Card Answer Text → Voting Card Answer → Voting Card Widget MC hierarchy as the canonical example. Treat Voting Card Vote Count as the parallel example. Inspect the current Art Manager data before reproducing them because authored timelines may evolve.

### Base visual/state prefab

Own content, styling, geometry, and semantic variants here.

- Put text and its optional background on separate layers, with text above the background in the layer stack.
- Treat every background, backplate, full-widget fill, and decorative shape that functions as a
  background as the lowest visual layer in its owning prefab. In the Art Manager's top-first
  component list, this means every functional background belongs after every foreground component.
- Use stopped, first-letter-capitalized state labels such as `Default`, `Correct`, and `Incorrect`.
- Use `stop()` on state frames so the timeline cannot fall through.
- Omit lifecycle visibility commands such as `visible = false`; the animated parent owns visibility.
- Make universal visual changes here so every parent instance receives them.
- Treat the child composition canvas as intrinsic source geometry. Parent references do not store,
  synchronize, or keyframe child width/height; resize the placed instance with uniform `scale`.
  Parent transforms accumulate around the child without rewriting any child-authored value.

### Animated component MC

Own the lifecycle presentation of one logical visual/state prefab here.

- Use `Off`, `On`, `Appear`, `Update`, and `Disappear` labels.
- Put visibility, opacity, scale, rotation, and motion commands/keyframes here.
- Keep semantic state selection in the child prefab instead of duplicating it across lifecycle animations.
- Label the child with a lower-camel instance name so commands can address it.
- Preserve child source geometry and content; do not copy its art into this layer.

### Compound widget MC

Own assembly, child independence, and optional group choreography here.

- Compose labeled animated child MCs such as `answer`, `voteCount`, `author`, or `cardArt`.
- Use top-level `Off` and `On` as an overall gate.
- Do not make top-level `On` reveal every child. Keep each child initially `Off` until explicitly animated.
- Add parent-level position or tween choreography only when multiple children must move as a group.
- Keep child layers independently selectable, lockable, hideable, and sortable.

## Build dynamic collections with layout containers

Use a layout container when gameplay determines how many repeated items exist.

```text
Compound Widget MC
└── Layout Container
    ├── Spawned Item MC
    ├── Spawned Item MC
    └── Spawned Item MC
```

- Let the transparent container own horizontal or vertical distribution, spacing, alignment, and reflow.
- Spawn a uniquely identified Item MC reference into the container for each runtime item. Keep the Item MC's source width and height intrinsic.
- Set dynamic content and theme values on the spawned item's deepest base components, then play the Item MC's `Appear`, `Update`, or `Disappear` animation.
- Play `Disappear` before removing an item. Remove it after the animation completes so the container can reflow the remaining children.
- Keep the container at the correct layer in the compound widget; every spawned child inherits that position in the visual stack.
- Put the layout container directly in the compound widget when it only serves that widget. Add a separate collection MC only when the collection itself needs reusable state, animation, or group choreography.
- Use this pattern for player rosters, votes, answers, leaderboard rows, inventory items, notifications, badges, reactions, and other variable-length repeated elements.

For the voting card, put a horizontal voter container directly in `Voting Card Widget MC` and spawn `Voting Card Voter MC` references into it. Each voter controls its own lifecycle; the container controls only placement and reflow.

## Order visual layers deliberately

Treat the Art Manager layer list as a visual stack: layers nearer the top render above layers beneath them.

- Enforce one invariant at every composition level: functional background elements are always at
  the bottom of their owning layer stack. If a prefab has several background elements, keep all of
  them below every foreground element and order only that background subgroup as the design needs.
- Apply the invariant recursively. A nested child must keep its own backplate at its bottom, and a
  background-bearing child must remain below sibling overlays in the parent composition.
- In a base prefab, place foreground information such as text and icons above filled backgrounds and backplates.
- In a compound widget, place small overlays such as `author`, `voteCount`, badges, and status indicators above children whose rendered content includes a large opaque background.
- Judge stacking by the child's complete rendered footprint, including nested shapes. A child named `answer` may still function as the card backplate when its base prefab contains a large filled background.
- For the current voting-card structure, use `author` and `voteCount` above the background-bearing `answer` child.
- Do not rely on creation or insertion order. Review the nested preview with every intended child visible and reorder layers until no background obscures information.

## Avoid the state-animation cross product

Never create separate timelines such as `CorrectAppear`, `CorrectDisappear`, `IncorrectAppear`, and `IncorrectDisappear`.

Instead:

1. Set the base child to `Correct` or `Incorrect`.
2. Play `Appear`, `Update`, or `Disappear` on its animated parent.

Keep semantic appearance and lifecycle motion independently reusable.

## Wire runtime behavior through timelines

Prepare a widget from the inside out:

1. Set dynamic content on the deepest content component.
2. Select the leaf semantic state, such as `Default`, `Correct`, or `Incorrect`.
3. Put the compound widget in `On` when it should be available.
4. Explicitly play lifecycle animations on labeled direct children.
5. Play `Disappear` when an animated exit is required; use `Off` only for immediate reset or initialization.

Use labeled ownership paths rather than hard-coded component ids. Let each parent command its direct child, for example `answer.gotoAndPlay("Appear")`, and traverse deliberately when a deeper semantic state must be selected.

Allow runtime code to assign genuinely data-driven content and theme values on the deepest labeled base component. Examples include setting text, or assigning a background shape's `fillColor` from a player's selected color. Prefer a stopped semantic state when the color is a fixed authored variant such as `Correct` or `Incorrect`.

Remove runtime code that assigns lifecycle visibility, opacity, scale, rotation, motion, or animated color transitions. Runtime code supplies dynamic data, selects semantic states, and decides when to animate; authored timelines decide lifecycle presentation.

### Resolve runtime geometry from the active authored state

Treat a component's timeline-resolved properties as its authoritative runtime geometry.

- Resolve anchors, containers, hitboxes, and spawn points from the stopped state used in game, such as `On`, including inherited or held keyframes from earlier frames.
- Use the component's base `x`, `y`, `scale`, rotation, opacity, width, and height only when the active timeline state does not author that property.
- Read geometry from the target component itself. Never infer an anchor from a sibling such as an avatar, from a parent's stale canvas metadata, or from unrelated DOM bounds.
- Project the resolved point through each parent canvas and transform exactly once. Parent transforms accumulate outside the child; they do not rewrite or synchronize child-authored values.
- Keep timeline-owned geometry authoritative even when the Art Manager inspector value differs from the component's stored base value.
- Add a regression test in which the base position, active-state keyframe, and nearby sibling position are deliberately different. Assert that runtime uses the active-state keyframe.

## Construction workflow

1. Inventory required content, semantic states, lifecycle animations, dynamic item counts, and possible group choreography.
2. Split those concerns across the three ownership levels.
3. Build and verify the base visual/state prefab first.
4. Wrap it in an animated MC and reproduce the standard lifecycle labels and commands.
5. Add animated MCs to a compound widget with unique lower-camel instance labels and deliberate top-to-bottom visual stacking.
6. For variable-length groups, add a distribution container and spawn uniquely identified Item MC references into it at runtime.
7. Wire runtime code to dynamic data, semantic state selection, and explicit lifecycle calls.
8. Resolve runtime anchors and hitboxes from the active stopped timeline state, with base values as property-level fallbacks only.
9. Verify nested previews, frame-zero bounds, layer order, distribution/reflow, timeline commands, and runtime transitions.
10. Fail the widget review if any functional background is not bottommost in its owning prefab or
    if any background-bearing child sits above a sibling foreground overlay.

## Validation checklist

- Confirm child source edits appear immediately in every parent preview.
- Confirm every reference resolves its width and height from the child canvas at render time and
  that parent timelines contain no reference width/height keyframes.
- Confirm semantic state frames stop and contain no lifecycle hide commands.
- Confirm `Off` hides and stops the animated wrapper.
- Confirm `On` persists without falling into another animation.
- Confirm `Appear`, `Update`, and `Disappear` finish at authored stop frames.
- Confirm compound `On` does not reveal children that remain `Off`.
- Confirm foreground text, icons, counts, author labels, and badges remain visible when every intended background is shown.
- Confirm every functional background is last among visual components in its owning top-first Art
  Manager stack, including inside nested referenced compositions.
- Confirm large filled children are below the smaller overlays they could otherwise cover.
- Confirm data-driven text and fill colors target labeled base components without competing with lifecycle animation properties.
- Confirm a dynamic container positions its children without runtime-authored per-item coordinates.
- Confirm runtime anchors, containers, and hitboxes use the active state's resolved keyframes rather than stale base component values or sibling geometry.
- Confirm an automated test distinguishes the active-state position from both the base position and the nearest sibling position.
- Confirm every spawned item has an independent identity and lifecycle timeline.
- Confirm disappearing items finish their animation before removal and remaining items reflow correctly.
- Confirm game code contains no competing CSS/class visibility or animation assignments.
- Confirm animation labels start uppercase and instance labels start lowercase.
- Preserve existing authored data and avoid migrations or saves outside the requested widget scope.

## Reject these anti-patterns

- Duplicating child art or styling across animation keyframes.
- Combining semantic variants with lifecycle animation names.
- Hiding a base state prefab that should be controlled by its wrapper.
- Revealing all compound children implicitly from the top-level `On` state.
- Placing an opaque background-bearing child above text, counts, author labels, or other information it can obscure.
- Leaving a background or backplate anywhere except the lowest visual depth of its owning prefab,
  even when the current preview happens not to overlap foreground content.
- Assuming creation order produces the correct visual stack without checking the fully composed preview.
- Hard-coding positions for repeated runtime items that belong in a distribution container.
- Animating the whole collection when each spawned item must appear or disappear independently.
- Adding an unnecessary collection MC around a container that belongs directly to one compound widget.
- Driving timeline-owned visuals through runtime CSS or direct opacity/visibility writes.
- Referencing descendants by unstable generated ids.
- Reading base component geometry while an active timeline state overrides it.
- Positioning a runtime-spawned object from a sibling's geometry or a transparent element's stale DOM bounds instead of its authored anchor.
- Freezing parent reference dimensions so child source changes cannot propagate.
