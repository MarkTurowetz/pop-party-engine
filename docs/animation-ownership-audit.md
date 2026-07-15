# Stage animation ownership audit

This audit covers player widgets, player answer bubbles, player choosing/submission behavior, and voting cards. Its purpose is to keep gameplay code responsible for data and semantic selection while authored Art Manager timelines remain responsible for visual motion and appearance.

## Required ownership contract

1. The server owns gameplay facts only: who needs input, answer text, answer correctness, voting-card visibility, revealed authors/voters, and winners.
2. The stage translates a changed gameplay fact into one authored label call.
3. Semantic state uses `stopAtComponent` / `gotoAndStop` (`Default`, `Correct`, `Incorrect`, avatar species, voting correctness).
4. Lifecycle behavior uses `playComponent` / `gotoAndPlay` (`Off`, `On`, `Appear`, `Update`, `Disappear`, `ChoosingStart`, `ChoosingEnd`).
5. No server payload, rerender, CSS class, or content nonce may synthesize a second animation for the same fact.
6. An E+ action owns a barrier containing only the objects it directly told to animate. It advances only after every target callback resolves, followed by the separately authored E+ delay.
7. An S+ action fires immediately and ignores visual callbacks. Its start-relative timer is the only completion source, including S+0.0.
8. Child animations started by a target's timeline do not delay or satisfy the parent's callback. Numeric animation durations never advance game flow.

The intended correctness call is effectively:

```js
player.playerAnswerBubbleMC.playerAnswerBubble.gotoAndStop("Correct");
```

The runtime equivalent is:

```ts
renderer.stopAtComponent("playerAnswerBubble", "Correct", { instant: true });
```

## Root interruption found and fixed

Every lobby/SSE payload calls `applyStageState`, which calls `renderStagePlayers` and `renderVotingCards`. The reusable art tree then calls `ArtObjectView.update` for existing components.

Before build 1.0.17.965, `ArtObjectView.update` reapplied the component's static x/y/size/scale/opacity/color/visibility defaults. It preserved the nested `TimelinePlayer` and its `currentFrame`, but it did not reapply that current frame afterward. Only the renderer-level root timeline was restored. This created all of the observed failure shapes:

- a stopped `Correct` or `Incorrect` answer bubble returned visually to the neutral authored component defaults;
- a choosing avatar jumped toward its default scale/brightness while its scheduled timeline frames continued;
- voting-card child timelines could be visually reset by a card-data rerender;
- running animations appeared interrupted or teleported even though their timeline player had not been stopped.

`CssVisualObject.reapplyTimelineFrame` now restores the active frame without stopping, restarting, or rescheduling playback. `ArtObjectView.update` invokes it after all children reconcile. The outer renderer still reapplies its root frame last, preserving the intended parent-over-child ordering.

A second interruption path was found after build 1.0.17.965. A single lobby payload could start an answer-bubble lifecycle during `renderStagePlayers`, request the same lifecycle again during answer visibility reconciliation, and then request it a third time from the action runner. Repeated `Disappear` calls restarted the timeline; repeated `Appear` calls could be converted to instant `On`, while the action runner advanced from an estimated duration. In addition, a timeline's own authored `visible = true` / `visible = false` command replaced that timeline's animation token and discarded its completion listeners.

Lifecycle playback is now joinable: a repeated request attaches its completion callback to the already-running timeline without changing its token or current frame. Authored visibility commands update visibility without cancelling the timeline that emitted them. Reconciliation reads the actual `appearing` / `disappearing` lifecycle state instead of an estimated end timestamp.

## Player path

| Gameplay fact | Source | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- | --- |
| Player roster/data | `server/lobby-payload-runtime.js` | `applyStageState` → `renderStagePlayers` | none | Data only; recurring reconciliation is now frame-safe. |
| Avatar species | `player.avatar.shape` | `syncAvatarComponent` → `stopAtComponent("avatar", species)` | `avatars`: `Rex`, `Stego`, `Trike`, `Raptor`, `Bronto`, `Ankylo` | Semantic frame selection only. |
| Choosing | `publicPlayer.needsInput === true` | `syncAvatarBehaviorComponent` → `ChoosingStart` | `player-avatar-behaviors` | Timeline owns scale/brightness motion. |
| Submitted/finished choosing | `publicPlayer.needsInput === false` | `syncAvatarBehaviorComponent` → `ChoosingEnd` | `player-avatar-behaviors` | Timeline returns itself to `Default` through its authored `gotoAndPlay(Default)` command. |
| Player widget shown/hidden | `room.playersShown` | prepare avatar species/behavior, then play avatar/name/VIP MC lifecycle labels | nested player MC timelines | Spawn and show call `Appear`; each player contributes only its `playerAvatarMC` callback to the action barrier. Name and VIP timelines are fire-and-forget. |
| Name/VIP changes | public player payload | `syncPlayerLabelComponents` | name/VIP MC lifecycle labels | Timeline driven. |

No server code calls an animation API for players. It exposes `needsInput`; `stagePlayerRoster.ts` is the only selector for the choosing behavior timeline.

## Player answer bubble path

| Gameplay fact | Source | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- | --- |
| Answer text/content | displayed answer record | runtime composition text injection | answer bubble text track | Data injection only. |
| Bubble shown/hidden | `room.playerAnswersShown`, hidden-player IDs | `syncAnswerBubbleComponent` | answer-bubble MC lifecycle | Timeline driven. |
| New/changed answer content | answer `nonce` or text | `syncAnswerBubbleComponent` → `Update` | answer-bubble MC lifecycle | Content changes only. |
| Correctness | answer record / reveal action's explicit player IDs | `stopAtComponent("playerAnswerBubble", label)` | `player-answer-bubble`: `Default`, `Correct`, `Incorrect` | Direct semantic selection only. |

Two legacy couplings were removed:

- `markDisplayedAnswersCorrectness` and `clearDisplayedCorrectnessForPlayers` no longer rewrite the answer-content nonce. Correctness therefore cannot masquerade as a new answer and trigger `Update`.
- `revealAnswerCorrectness` no longer plays the bubble MC `Update` lifecycle. It only selects `Correct`, `Incorrect`, or `Default` on `playerAnswerBubble`.

The reveal action still receives authoritative `correctPlayerIds` and `incorrectPlayerIds` in its public action payload. The server also persists the same fact into each displayed answer so subsequent SSE reconciliation selects the same semantic frame.

## Voting-card path

| Gameplay fact | Source | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- | --- |
| Cards shown/hidden | `room.votingCardsShown`, per-card `hidden` | create/remove `VotingCardView` | voting-card group and child MC lifecycle labels | The action waits for each directly targeted card group callback; DOM removal and layer hiding follow the same callbacks. |
| Authors revealed | `room.votingAuthorsRevealed` | author child `Appear` / `Off` | `prefab-voting-card-author-mc` | Timeline driven. |
| Votes revealed | `room.votingVotesRevealed` | voter/vote-count child lifecycle labels | voter and count MC timelines | Stagger timers decide when each voter starts; only each voter timeline callback satisfies the action barrier. Vote-count child motion is not part of that barrier. |
| Winner revealed | serialized `card.isWinner` | correctness `stopAtComponent("Correct" / "Neutral")` | `prefab-voting-card-correctness-state` | Semantic frame selection only. |
| Card data rerender | recurring lobby payload | `renderArt` | current nested frames are now restored | Fixed by shared reconciliation change. |

`stageVotingCardVisuals.ts` still contains a legacy composition fallback that synthesizes the newer prefab hierarchy from the old `voting-card` composition if authored prefabs are missing. It is a data/prefab compatibility path, not a server animation call, but it should be removed after all supported projects are migrated.

## Remaining compatibility presentation paths

These paths no longer advance the action from estimated animation duration, but remain compatibility presentation code:

- Voting-card voter staggering uses `setTimeout` to start each independently targeted voter. Those timers do not complete or advance the action.
- The generic `CssVisualObject` retains CSS-class lifecycle fallbacks for targets without authored timelines. Their completion observes the directly targeted element's own Web Animations promise rather than a duration estimate.
- Player roster host/tile CSS transitions remain as fallback/layout concealment. Player widget parts use authored MC timelines when the prefab renderer is available.
- The global Wipe is a `Wipe Widget MC` compound prefab. Its parent `Appear` and `Disappear` timelines command the nested colored-strip `Wipe Art MC`, and only the parent terminal callback may complete `Set Wipe Shown`.
- `stageVotingCardVisuals.ts` can construct voting prefabs from the legacy `voting-card` composition.
- A point popup without its authored prefab is shown statically; it does not create a timer-based animation completion substitute.

## Completion-event migration

The timeline engine invokes a `complete` callback at the directly selected timeline's authored stop/end. Nested component commands may start their own timelines, but their duration is deliberately excluded from the parent callback. `ArtObjectView`, `ArtObjectTreeRenderer`, roster/voting APIs, and `stageActionRunners` now preserve target callbacks through Promise-based action barriers.

Explicit timeline `emit` commands are also supported and dispatched as `party-game:timeline:<event>`. They are useful when completion must occur at a deliberate authored beat that is not the timeline's terminal stop. A dedicated event such as `action-complete` should be added only to those timelines; ordinary lifecycle segments can use their existing terminal stop callback.

Completed migration:

1. E+ visual actions now return Promise-based target barriers; action runners contain no duration-to-`setTimeout` advancement path.
2. S+0.0 and S+N fire the action but suppress its callback; the start-relative action timer owns advancement.
3. Display Text, players, answer bubbles, correctness, layout game objects, arbitrary game-object animations, timer, wipe, voting cards/reveals, and point popups use exact callbacks.
4. Voting-card and point-popup removal follows the directly targeted timeline callback instead of a returned duration.
5. Parent Art Manager timelines no longer include child component durations in their completion calculation.

## Regression coverage

The automated tests now verify that:

- a `Correct` semantic frame is restored after static reconciliation overwrites its color/scale;
- nested timeline restoration occurs after child reconciliation;
- the reveal action selects `Correct` and `Incorrect` without playing `Update`;
- a correctness-only data change does not play the answer-content `Update` lifecycle;
- setting or clearing displayed correctness preserves the answer-content nonce;
- choosing continues to route only through `ChoosingStart`, `ChoosingEnd`, and authored return to `Default`.
- repeated answer `Appear` / `Disappear` requests join the active timeline without restarting or snapping to `On` / `Off`;
- answer visibility actions complete only after every targeted bubble timeline reaches its authored stop.
- E+ runners wait for their exact target Promise, while S+0.0 and S+1.0 ignore that Promise completely;
- rejected/interrupted target barriers fail closed instead of advancing from a fallback timer;
- parent timelines finish at their own authored stop even when they start longer child animations;
- E+ server timing starts only after the target callback, while S+ accepts only its start-timer event;
- the shipped nested player-answer prefab passes a real-browser check for uninterrupted `Appear`, persistent `Correct`, uninterrupted `Disappear`, and completion at the authored stop.
