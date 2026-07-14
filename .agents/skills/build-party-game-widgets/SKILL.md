---
name: build-party-game-widgets
description: Construct and review layered Art Manager prefabs for Party Game Template using separate visual-state, lifecycle-animation, compound-widget, and dynamic-collection responsibilities. Use when creating, refactoring, migrating, wiring, or debugging text fields, voting cards, player widgets, MC-style prefab hierarchies, layout containers, runtime-spawned item prefabs, child timeline commands, semantic states, reveal animations, or other reusable game objects in this repository.
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
- Use stopped, first-letter-capitalized state labels such as `Default`, `Correct`, and `Incorrect`.
- Use `stop()` on state frames so the timeline cannot fall through.
- Omit lifecycle visibility commands such as `visible = false`; the animated parent owns visibility.
- Make universal visual changes here so every parent instance receives them.
- Treat width and height as intrinsic source geometry. Resize parent instances with `scale`, not copied width or height overrides.

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

- In a base prefab, place foreground information such as text and icons above filled backgrounds and backplates.
- In a compound widget, place small overlays such as `author`, `voteCount`, badges, and status indicators above children whose rendered content includes a large opaque background.
- Judge stacking by the child's complete rendered footprint, including nested shapes. A child named `answer` may still function as the card backplate when its base prefab contains a large filled background.
- For the current voting-card structure, use `author` and `voteCount` above the background-bearing `answer` child unless the authored design explicitly requires another order.
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

## Construction workflow

1. Inventory required content, semantic states, lifecycle animations, dynamic item counts, and possible group choreography.
2. Split those concerns across the three ownership levels.
3. Build and verify the base visual/state prefab first.
4. Wrap it in an animated MC and reproduce the standard lifecycle labels and commands.
5. Add animated MCs to a compound widget with unique lower-camel instance labels and deliberate top-to-bottom visual stacking.
6. For variable-length groups, add a distribution container and spawn uniquely identified Item MC references into it at runtime.
7. Wire runtime code to dynamic data, semantic state selection, and explicit lifecycle calls.
8. Verify nested previews, frame-zero bounds, layer order, distribution/reflow, timeline commands, and runtime transitions.

## Validation checklist

- Confirm child source edits appear immediately in every parent preview.
- Confirm referenced width and height follow the child frame-zero bounds.
- Confirm semantic state frames stop and contain no lifecycle hide commands.
- Confirm `Off` hides and stops the animated wrapper.
- Confirm `On` persists without falling into another animation.
- Confirm `Appear`, `Update`, and `Disappear` finish at authored stop frames.
- Confirm compound `On` does not reveal children that remain `Off`.
- Confirm foreground text, icons, counts, author labels, and badges remain visible when every intended background is shown.
- Confirm large filled children are below the smaller overlays they could otherwise cover.
- Confirm data-driven text and fill colors target labeled base components without competing with lifecycle animation properties.
- Confirm a dynamic container positions its children without runtime-authored per-item coordinates.
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
- Assuming creation order produces the correct visual stack without checking the fully composed preview.
- Hard-coding positions for repeated runtime items that belong in a distribution container.
- Animating the whole collection when each spawned item must appear or disappear independently.
- Adding an unnecessary collection MC around a container that belongs directly to one compound widget.
- Driving timeline-owned visuals through runtime CSS or direct opacity/visibility writes.
- Referencing descendants by unstable generated ids.
- Freezing parent reference dimensions so child source changes cannot propagate.
