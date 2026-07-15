# Stage animation ownership audit

This audit covers player widgets, player answer bubbles, player choosing/submission behavior, and voting cards. Its purpose is to keep gameplay code responsible for data and semantic selection while authored Art Manager timelines remain responsible for visual motion and appearance.

## Required ownership contract

1. The server owns gameplay facts only: who needs input, answer text, answer correctness, voting-card visibility, revealed authors/voters, and winners.
2. The stage translates a changed gameplay fact into one authored label call.
3. Semantic state uses `stopAtComponent` / `gotoAndStop` (`Default`, `Correct`, `Incorrect`, avatar species, voting correctness).
4. Lifecycle behavior uses `playComponent` / `gotoAndPlay` (`Off`, `On`, `Appear`, `Update`, `Disappear`, `ChoosingStart`, `ChoosingEnd`).
5. No server payload, rerender, CSS class, or content nonce may synthesize a second animation for the same fact.
6. Flow completion should come from the selected timeline's completion callback or an authored terminal event. Numeric duration guesses are compatibility behavior to remove.

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

## Player path

| Gameplay fact | Source | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- | --- |
| Player roster/data | `server/lobby-payload-runtime.js` | `applyStageState` → `renderStagePlayers` | none | Data only; recurring reconciliation is now frame-safe. |
| Avatar species | `player.avatar.shape` | `syncAvatarComponent` → `stopAtComponent("avatar", species)` | `avatars`: `Rex`, `Stego`, `Trike`, `Raptor`, `Bronto`, `Ankylo` | Semantic frame selection only. |
| Choosing | `publicPlayer.needsInput === true` | `syncAvatarBehaviorComponent` → `ChoosingStart` | `player-avatar-behaviors` | Timeline owns scale/brightness motion. |
| Submitted/finished choosing | `publicPlayer.needsInput === false` | `syncAvatarBehaviorComponent` → `ChoosingEnd` | `player-avatar-behaviors` | Timeline returns itself to `Default` through its authored `gotoAndPlay(Default)` command. |
| Player widget shown/hidden | `room.playersShown` | `setShown` → player avatar/name/VIP MC lifecycle labels | nested player MC timelines | Authored child lifecycles are primary. Outer tile/host CSS classes remain a layout/fallback mechanism. |
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
| Cards shown/hidden | `room.votingCardsShown`, per-card `hidden` | create/remove `VotingCardView` | voting-card group and child MC lifecycle labels | Timeline playback, with timer-based DOM removal afterward. |
| Authors revealed | `room.votingAuthorsRevealed` | author child `Appear` / `Off` | `prefab-voting-card-author-mc` | Timeline driven. |
| Votes revealed | `room.votingVotesRevealed` | voter/vote-count child lifecycle labels | voter and count MC timelines | Timeline driven, but reveal staggering is currently a code timer. |
| Winner revealed | serialized `card.isWinner` | correctness `stopAtComponent("Correct" / "Neutral")` | `prefab-voting-card-correctness-state` | Semantic frame selection only. |
| Card data rerender | recurring lobby payload | `renderArt` | current nested frames are now restored | Fixed by shared reconciliation change. |

`stageVotingCardVisuals.ts` still contains a legacy composition fallback that synthesizes the newer prefab hierarchy from the old `voting-card` composition if authored prefabs are missing. It is a data/prefab compatibility path, not a server animation call, but it should be removed after all supported projects are migrated.

## Remaining compatibility animation paths

These paths do not set answer correctness, avatar behavior, or voting correctness, but they still prevent the entire stage from being purely event-complete:

- `stageActionRunners.ts` completes most visual actions with `setTimeout(duration)`. The timeline player already supports a real `complete` callback, but most stage wrapper APIs reduce playback to a number before it reaches the action runner.
- Voting-card voter staggering uses `setTimeout`, and voting-card removal/layer hiding waits for returned numeric durations.
- The generic `CssVisualObject` retains CSS-class lifecycle fallbacks for targets without authored timelines.
- Player roster host/tile CSS transitions remain as fallback/layout concealment. Player widget parts use authored MC timelines when the prefab renderer is available.
- `stageVotingCardVisuals.ts` can construct voting prefabs from the legacy `voting-card` composition.
- The point popup still has a CSS-keyframe fallback when its authored prefab is unavailable; this is adjacent to the player audit but does not affect the requested answer/choosing states.

## Completion-event migration

The timeline engine already invokes a `complete` callback at the authored stop/end, including nested component-command duration. We should preserve that callback through `ArtObjectView`, `ArtObjectTreeRenderer`, roster/voting APIs, and `stageActionRunners` instead of returning only milliseconds.

Explicit timeline `emit` commands are also supported and dispatched as `party-game:timeline:<event>`. They are useful when completion must occur at a deliberate authored beat that is not the timeline's terminal stop. A dedicated event such as `action-complete` should be added only to those timelines; ordinary lifecycle segments can use their existing terminal stop callback.

Recommended migration order:

1. Introduce a `{ duration, completed }` or Promise-based playback result while retaining numeric duration compatibility.
2. Convert player visibility/answer lifecycle actions to await the actual timeline completion.
3. Convert voting-card reveal, stagger, removal, and layer hiding to authored completion/beat events.
4. Remove the CSS lifecycle and legacy voting-composition fallbacks after migration checks confirm no supported game depends on them.
5. Add a development warning whenever a stage action falls back to numeric duration or CSS lifecycle playback.

## Regression coverage

The automated tests now verify that:

- a `Correct` semantic frame is restored after static reconciliation overwrites its color/scale;
- nested timeline restoration occurs after child reconciliation;
- the reveal action selects `Correct` and `Incorrect` without playing `Update`;
- a correctness-only data change does not play the answer-content `Update` lifecycle;
- setting or clearing displayed correctness preserves the answer-content nonce;
- choosing continues to route only through `ChoosingStart`, `ChoosingEnd`, and authored return to `Default`.
