# Security boundaries

The engine separates public game traffic, stage authority, player authority, and administrator tools. The strict controls are implemented behind explicit compatibility switches so an existing deployment can be migrated without silently changing its protocol.

## Administrator tools

`PARTY_GAME_ADMIN_AUTH_MODE` accepts:

- `legacy-open`: compatibility only. Tool pages and mutations are not authenticated.
- `local`: loopback-only development access with CSRF checks. The server refuses to start with this mode when `NODE_ENV=production`.
- `github`: GitHub OAuth with state, PKCE, an HTTP-only same-site session cookie, expiry, mutation CSRF checks, and authorization by immutable numeric GitHub user ID.

GitHub mode requires all of:

- `PARTY_GAME_GITHUB_OAUTH_CLIENT_ID`
- `PARTY_GAME_GITHUB_OAUTH_CLIENT_SECRET`
- `PARTY_GAME_GITHUB_OAUTH_CALLBACK_URL`
- `PARTY_GAME_ADMIN_GITHUB_USER_ID`

OAuth authenticates the administrator. It must not be reused as the credential that writes game content. Content publication uses a separately provisioned, least-privileged GitHub App credential.

The writer exchanges a short-lived signed GitHub App JWT for a cached installation token. It refreshes before expiry, coalesces concurrent refreshes, and fails closed when GitHub refuses or returns an expired credential. The private key is supplied only through deployment secrets and is never written to game content or logs.

## Public runtime capabilities

`PARTY_GAME_RUNTIME_CAPABILITIES` accepts:

- `legacy`: compatibility mode; credentials are issued but existing uncredentialed runtime routes continue to work.
- `required`: a stage explicitly creates its room and receives a room-scoped capability. Each player receives a separate player-and-room-scoped capability. Stage and player mutations require the matching capability. Stage event streams use short-lived, one-use tickets so capabilities are never put in URLs.

Strict mode refuses to start unless the game supplies an immutable content store. Room creation must successfully pin and validate the active release before a stage capability is issued; a pin failure removes the partial room and returns a visible diagnostic.

The browser stores runtime capabilities only in per-window `sessionStorage`. They must never be copied to shared cookies, `localStorage`, lobby payloads, logs, or another controller identity.

Do not enable `github` or `required` in production until OAuth secrets, callback URLs, asset isolation, room teardown invalidation, and the deployment security checklist are complete.

The revisioned GitHub provider and its routes are separately gated. `PARTY_GAME_CONTENT_STORE=github` constructs the read/pin provider, while `PARTY_GAME_REMOTE_AUTHORING=enabled` exposes authenticated Tool writes, draft preview, validation, publish, and rollback APIs. Production refuses the latter unless GitHub administrator authentication is also enabled. Tool JSON and binary uploads use one compare-and-swap draft bundle; a partial GitHub write is never authoritative. Both settings default to `disabled`.

`PARTY_GAME_AUTHORING_MODE=live-prototype` is an additional explicit opt-in for a
single-author, single-instance service. Its workspace/session, heartbeat,
discard, Tool-draft, binary upload, and Save endpoints remain administrator and
CSRF protected. Unsaved data is process memory only. Save writes the complete
game-owned bundle and makes it authoritative with one final release-ref CAS;
orphaned Git objects from a failed CAS are never readable as the active release.

Public `POST /api/stage/rooms` creation always pins an immutable published
release. Only an authenticated, CSRF-protected
`POST /api/admin/preview-rooms` request may pin the latest complete draft.
Preview rooms receive normal room-scoped runtime capabilities and remain pinned
to that draft revision for their lifetime.

## Authored SVG

SVG uploads currently pass strict active-content rejection and are served with sandbox CSP, same-origin resource policy, and `nosniff`. This is defense in depth for compatibility, not the final publication architecture. Published art must move to the planned cookieless immutable asset origin before remote authoring is enabled.

## Audit events

Administrator authentication and mutation authorization emit structured `pop-party-admin-audit` JSON events with a correlation ID, immutable actor ID, operation, outcome, timestamp, revisions when available, and a safe error code. Production log retention must be kept separate from mutable game content.
