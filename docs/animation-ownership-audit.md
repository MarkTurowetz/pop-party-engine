# Stage animation ownership audit

This audit defines the boundary between authoritative game facts and optional,
game-owned presentation. The engine owns state and action completion. Layout,
Art Manager compositions, plugin renderers, and their timelines own visuals.

## Required ownership contract

1. The server owns gameplay facts only: player/session identity, VIP status,
   input eligibility and submissions, answers, correctness, scores, votes,
   timers, and Flow state.
2. Every player and input action remains valid when a game authors no player
   Art, avatar, roster, answer bubble, score popup, or controller identity UI.
3. A game that wants player visuals exposes only the necessary public model
   through an ordinary Stage plugin renderer and binds it to game-owned Layout
   and Art Manager objects. Private controller models use a Controller renderer.
4. Recurring reconciliation injects data and silently selects authored setup
   defaults. It does not translate changed data into lifecycle commands.
5. Flow actions are the command authority for lifecycle presentation.
6. Semantic state uses `stopAtComponent` / `gotoAndStop`; lifecycle motion uses
   `playComponent` / `gotoAndPlay`.
7. No server payload, rerender, CSS class, content nonce, or saved visibility
   override may synthesize a second animation for the same fact.
8. An E+ action waits only for the exact objects it commanded. An S+ action
   starts its command without accepting its callback and advances from its
   authored start-relative delay.
9. Missing targets, labels, or callbacks fail closed. Player authority never
   creates fallback Art or timer-based visual completion.

## Game-owned player presentation boundary

The engine has no player-widget, avatar, roster-item, answer-bubble, or point-
popup presentation ABI. Those are example designs in the reference game only.

A game may copy those example compositions, replace them completely, or ship
no player visuals. It creates an ordinary Layout collection, instantiates its
own player composition by stable player ID, and binds public fields such as
name, score, VIP, displayed answer, or `needsInput`. Choosing animations such
as `Choosing Start` and `Choosing End` are game-authored renderer state choices,
not engine behavior. Controller identity and avatar selection follow the same
game-owned Layout/plugin-input pattern.

Private input/view data must never be projected onto Stage merely to drive an
effect. A game explicitly selects a safe public field when a public effect is
desired. With no renderer or Art target, the underlying action still completes.

## Stable reconciliation

`ArtObjectView.update` reapplies the active timeline frame after static child
reconciliation. This preserves a stopped semantic state and a running timeline
without restarting or teleporting it. Plugin renderer collections reconcile by
stable semantic keys so unchanged DOM nodes, Art renderer instances, nested
collections, and timelines survive model updates.

Presentation-only Art/Layout hot reload replaces the active authoring content
pin and reconciles the Stage without restarting Flow. Gameplay-affecting Flow
or constants changes remain session-boundary data.

## Voting-card path

| Gameplay fact | Stage selector | Authored timeline | Status |
| --- | --- | --- | --- |
| Cards shown/hidden | group/card/answer lifecycle calls | voting-card MC timelines | Waits only for directly commanded targets. |
| Authors revealed | author child lifecycle | `prefab-voting-card-author-mc` | Exact target callbacks only. |
| Votes revealed | voters parent, voter, and count lifecycle | voter/count MC timelines | Authored choreography; no code-side stagger. |
| Winner revealed | correctness semantic selection | authored correctness state | Semantic frame selection only. |
| Card data rerender | keyed renderer reconciliation | none | Data only; no lifecycle restart. |

Voting cards are retained engine presentation for the built-in voting feature.
They are unrelated to generic player identity and do not make player Art
mandatory.

## Completion-event rules

The timeline engine invokes `complete` at the directly selected timeline's
authored stop/end. Nested commands may start child timelines, but their duration
does not satisfy the parent's callback. Explicit timeline `emit` commands remain
available for an authored completion beat that differs from the terminal stop.

- E+ visual actions return Promise-based target barriers; there is no estimated
  duration fallback.
- S+ actions suppress target callbacks and use only the start-relative timer.
- Layout Game Objects, arbitrary game-owned objects, timer, wipe, and voting
  presentations use exact callbacks.
- Rejected or interrupted target barriers fail closed.

## Regression coverage

Automated coverage must prove:

- core player join, input, answer, score, VIP, and Flow actions work with zero
  player Art or player Layout elements;
- the reference game's optional player collection is implemented through the
  same ordinary renderer ABI available to every game;
- game-owned player items retain keyed DOM/renderer/timeline identity;
- Controller-private changes do not trigger an unrelated Stage apply;
- static reconciliation preserves active semantic and lifecycle frames;
- E+ waits for its exact target while S+ ignores the callback;
- missing authored visual targets fail closed only for explicitly visual Flow
  commands, never for the underlying player/input authority.
