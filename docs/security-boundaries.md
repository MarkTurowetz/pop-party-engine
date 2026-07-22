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

## Public runtime capabilities

`PARTY_GAME_RUNTIME_CAPABILITIES` accepts:

- `legacy`: compatibility mode; credentials are issued but existing uncredentialed runtime routes continue to work.
- `required`: a stage explicitly creates its room and receives a room-scoped capability. Each player receives a separate player-and-room-scoped capability. Stage and player mutations require the matching capability. Stage event streams use short-lived, one-use tickets so capabilities are never put in URLs.

Strict mode refuses to start unless the game supplies an immutable content store. Room creation must successfully pin and validate the active release before a stage capability is issued; a pin failure removes the partial room and returns a visible diagnostic.

The browser stores runtime capabilities only in per-window `sessionStorage`. They must never be copied to shared cookies, `localStorage`, lobby payloads, logs, or another controller identity.

Do not enable `github` or `required` in production until OAuth secrets, callback URLs, asset isolation, room teardown invalidation, and the deployment security checklist are complete.

## Authored SVG

SVG uploads currently pass strict active-content rejection and are served with sandbox CSP, same-origin resource policy, and `nosniff`. This is defense in depth for compatibility, not the final publication architecture. Published art must move to the planned cookieless immutable asset origin before remote authoring is enabled.

## Audit events

Administrator authentication and mutation authorization emit structured `pop-party-admin-audit` JSON events with a correlation ID, immutable actor ID, operation, outcome, timestamp, revisions when available, and a safe error code. Production log retention must be kept separate from mutable game content.
