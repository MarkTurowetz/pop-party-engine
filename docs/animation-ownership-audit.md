# Stage animation ownership audit

This audit covers player widgets, player answer bubbles, player choosing/submission behavior, and voting cards. Its purpose is to keep gameplay code responsible for data and semantic selection while authored Art Manager timelines remain responsible for visual motion and appearance.

## Required ownership contract

1. The server owns gameplay facts only: who needs input, answer text, answer correctness, voting-card data, revealed authors/voters, and winners.
2. Recurring stage reconciliation injects data and silently selects authored setup defaults. It does not translate snapshot flags or changed data into lifecycle or reveal commands.
3. The flow action is the sole command authority for lifecycle and semantic presentation, except for the two non-waiting cases listed below.
4. Semantic state uses `stopAtComponent` / `gotoAndStop` (`Default`, `Correct`, `Incorrect`, avatar species, voting correctness).
5. Lifecycle behavior uses `playComponent` / `gotoAndPlay` (`Off`, `On`, `Appear`, `Update`, `Disappear`, `ChoosingStart`, `ChoosingEnd`).
6. No server payload, rerender, CSS class, content nonce, or saved visibility override may synthesize a second animation for the same fact.
7. An E+ action owns a barrier containing only the objects it directly told to animate. It advances only after every target callback resolves, followed by the separately authored E+ delay.
8. An S+ action calls the action immediately without accepting its callback, waits its start-relative delay, and then advances. This includes S+0.0.
9. Child animations started by a target's timeline do not delay or satisfy the parent's callback. Numeric animation durations never advance game flow.
10. Missing targets, missing authored labels, interrupted playback, and failed audio fail closed rather than creating a synthetic completion.

Two runtime command sources are intentionally fire-and-forget:

- Creating a newly spawned player may play `Appear` on `player-avatar-mc`, `player-name-mc`, and (for the VIP) `vip-mc`. The spawn operation does not wait, so E+ and S+ are equivalent for it.
- A `needsInput` transition may play `ChoosingStart` or `ChoosingEnd` on `player-avatar-behaviors`. Player input owns this behavior change and no callback is attached.

These exceptions cannot enter an action completion barrier and therefore cannot advance or trample a waiting flow action.

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

A second interruption path was found after build 1.0.17.965. A single lobby payload could start an answer-bubble lifecycle during `renderStagePlayers`, request the same lifecycle again during answer visibility reconciliation, and then request it a third time from the action runner. Repeated `Disappear` calls restarted the timeline; repeated `Appear` calls could be converted to instant `On`, while the action runner advanced from an estimated duration.

That coupling has been removed rather than joined. Reconciliation never calls answer-bubble lifecycle or correctness timelines. The explicit flow action starts a fresh command and waits only for the callback from the exact bubble MC or semantic child it targeted. Authored visibility commands update visibility without cancelling the timeline that emitted them.

## Player path

| Gameplay fact | Source | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- | --- |
| Player roster/data | `server/lobby-payload-runtime.js` | `applyStageState` → `renderStagePlayers` | none | Data/setup only; recurring reconciliation issues no lifecycle commands. |
| Avatar species | `player.avatar.shape` | `syncAvatarComponent` → `stopAtComponent("avatar", species)` | `avatars`: `Rex`, `Stego`, `Trike`, `Raptor`, `Bronto`, `Ankylo` | Semantic frame selection only. |
| Choosing | `publicPlayer.needsInput === true` | fire-and-forget `ChoosingStart` | `player-avatar-behaviors` | Allowed input exception; no callback. |
| Submitted/finished choosing | `publicPlayer.needsInput === false` | fire-and-forget `ChoosingEnd` | `player-avatar-behaviors` | Allowed input exception; no callback. |
| Newly spawned player | first creation of a player tile | fire-and-forget avatar/name/VIP `Appear` | nested player MC timelines | Allowed spawn exception; no callback or timing dependency. |
| Player widget shown/hidden | `Set Players Shown` flow action | avatar/name/VIP MC lifecycle labels | nested player MC timelines | Waits only for each directly commanded `player-avatar-mc`; name and VIP are ancillary fire-and-forget children of this action. |
| Name/VIP content | public player payload | runtime composition injection | none | Data only. |

No server code calls an animation API for players. It exposes `needsInput`; `stagePlayerRoster.ts` is the only selector for the choosing behavior timeline.

## Player answer bubble path

| Gameplay fact | Source | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- | --- |
| Answer text/content | displayed answer record | runtime composition text injection | answer bubble text track | Data injection only. |
| Bubble shown/hidden | `Set Player Answers Shown` flow action | `syncAnswerBubbleComponent` | answer-bubble MC lifecycle | Each directly targeted bubble supplies one callback. |
| New/changed answer content | answer `nonce` or text | runtime composition injection | none | Data only; content changes do not synthesize `Update`. |
| Correctness | answer record / reveal action's explicit player IDs | `stopAtComponent("playerAnswerBubble", label)` | `player-answer-bubble`: `Default`, `Correct`, `Incorrect` | Direct semantic selection only. |

Two legacy couplings were removed:

- `markDisplayedAnswersCorrectness` and `clearDisplayedCorrectnessForPlayers` no longer rewrite the answer-content nonce. Correctness therefore cannot masquerade as a new answer and trigger `Update`.
- `revealAnswerCorrectness` no longer plays the bubble MC `Update` lifecycle. It only selects `Correct`, `Incorrect`, or `Default` on `playerAnswerBubble`.

The reveal action receives authoritative `correctPlayerIds` and `incorrectPlayerIds` in its public action payload. Subsequent SSE reconciliation updates data only and cannot overwrite the selected semantic frame.

## Voting-card path

| Gameplay fact | Source | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- | --- |
| Cards shown/hidden | `Set Voting Cards Shown` flow action | group/card/answer lifecycle calls | voting-card MC timelines | Waits for only the child targets explicitly commanded by the action. |
| Authors revealed | `Reveal Authors` flow action | author child lifecycle | `prefab-voting-card-author-mc` | Exact target callbacks only. |
| Votes revealed | `Reveal Votes` flow action | voters parent, each voter, and count lifecycle | voter and count MC timelines | No code-side stagger timer; authored timelines own choreography. |
| Winner revealed | reveal flow action | correctness `stopAtComponent("Correct" / "Neutral")` | `prefab-voting-card-correctness-state` | Semantic frame selection only. |
| Card data rerender | recurring lobby payload | `renderArt` | none | Data only; no lifecycle or correctness selection. |

`stageVotingCardVisuals.ts` still contains a legacy composition fallback that synthesizes the newer prefab hierarchy from the old `voting-card` composition if authored prefabs are missing. It is a data/prefab compatibility path, not a server animation call, but it should be removed after all supported projects are migrated.

## Remaining compatibility presentation paths

These paths no longer advance the action from estimated animation duration, but remain compatibility presentation code:

- The generic `CssVisualObject` retains CSS-class lifecycle fallbacks for non-flow setup surfaces, but a flow action that requests a callback from a target without an authored label fails closed.
- Player roster host/tile classes are not flow completion sources. Player widget parts use authored MC timelines.
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
- reconciliation cannot issue a second answer `Appear` / `Disappear` request;
- answer visibility actions complete only after every targeted bubble timeline reaches its authored stop.
- E+ runners wait for their exact target Promise, while S+0.0 and S+1.0 ignore that Promise completely;
- rejected/interrupted target barriers fail closed instead of advancing from a fallback timer;
- parent timelines finish at their own authored stop even when they start longer child animations;
- E+ server timing starts only after the target callback, while S+ accepts only its start-timer event;
- spawn and choosing commands never carry completion callbacks;
- unauthorized layout commands and missing authored callbacks fail closed;
- the shipped nested player-answer prefab passes a real-browser check for uninterrupted `Appear`, persistent `Correct`, uninterrupted `Disappear`, and completion at the authored stop.
