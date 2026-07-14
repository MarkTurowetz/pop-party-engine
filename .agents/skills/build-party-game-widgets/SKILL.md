---
name: build-party-game-widgets
description: Construct and review layered Art Manager prefabs for Party Game Template using separate visual-state, lifecycle-animation, and compound-widget timelines. Use when creating, refactoring, migrating, wiring, or debugging text fields, voting cards, player widgets, MC-style prefab hierarchies, child timeline commands, semantic states, reveal animations, or other reusable game objects in this repository.
---

# Build Party Game Widgets

## Apply the ownership hierarchy

Separate orthogonal behavior into three levels:

```text
Compound Widget MC
└── Animated Component MC
    └── Base Visual/State Prefab
        ├── Background
        └── Content (for example, Text)
```

Treat the current authored Voting Card Answer Text → Voting Card Answer → Voting Card Widget MC hierarchy as the canonical example. Treat Voting Card Vote Count as the parallel example. Inspect the current Art Manager data before reproducing them because authored timelines may evolve.

### Base visual/state prefab

Own content, styling, geometry, and semantic variants here.

- Put text and its optional background on separate layers.
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

Remove runtime code that assigns presentation visibility, opacity, scale, color, or motion. Runtime code decides what state to select and when to animate; authored timelines decide how it looks.

## Construction workflow

1. Inventory required content, semantic states, lifecycle animations, and possible group choreography.
2. Split those concerns across the three ownership levels.
3. Build and verify the base visual/state prefab first.
4. Wrap it in an animated MC and reproduce the standard lifecycle labels and commands.
5. Add animated MCs to a compound widget with unique lower-camel instance labels.
6. Wire runtime code to semantic state selection and explicit lifecycle calls.
7. Verify nested previews, frame-zero bounds, layer order, timeline commands, and runtime transitions.

## Validation checklist

- Confirm child source edits appear immediately in every parent preview.
- Confirm referenced width and height follow the child frame-zero bounds.
- Confirm semantic state frames stop and contain no lifecycle hide commands.
- Confirm `Off` hides and stops the animated wrapper.
- Confirm `On` persists without falling into another animation.
- Confirm `Appear`, `Update`, and `Disappear` finish at authored stop frames.
- Confirm compound `On` does not reveal children that remain `Off`.
- Confirm game code contains no competing CSS/class visibility or animation assignments.
- Confirm animation labels start uppercase and instance labels start lowercase.
- Preserve existing authored data and avoid migrations or saves outside the requested widget scope.

## Reject these anti-patterns

- Duplicating child art or styling across animation keyframes.
- Combining semantic variants with lifecycle animation names.
- Hiding a base state prefab that should be controlled by its wrapper.
- Revealing all compound children implicitly from the top-level `On` state.
- Driving timeline-owned visuals through runtime CSS or direct opacity/visibility writes.
- Referencing descendants by unstable generated ids.
- Freezing parent reference dimensions so child source changes cannot propagate.
