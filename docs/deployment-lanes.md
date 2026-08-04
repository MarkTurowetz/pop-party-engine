# Reference deployment lanes

The reference application has two hosted delivery lanes with different jobs.

## Preview: everyday testing

`https://pop-party-preview.onrender.com` is the normal authoring and testing
service. A successful `check` run for a push to `main` triggers
`.github/workflows/preview.yml`, which deploys that exact commit through the
preview service's private Render hook. The workflow verifies `/api/health`
until all of these agree:

- the service identifies itself as `preview`;
- the rendered build reports the requested Git commit;
- the game, runtime, and active content release use the same engine version.

The already-running preview service is the release-coordinate authority for
ordinary same-version preview deploys. Preview reads
`heads/game-releases-preview`, while Production reads
`heads/game-releases`. The protected publication workflow initializes the
Preview ref atomically from Production the first time, then coordinates and
verifies Preview independently. Preview validation never needs to wake or
mutate the sleeping Production service.

Ordinary feature and bug-fix commits do not bump or publish the public npm
packages. They merge with the current engine version and become testable on the
preview URL without an npm release, GitHub release, production approval, or
production Render deployment.

The free preview service intentionally uses the same Git-backed content store as
the production reference app. Use the preview Tools as the single authoring
surface once this lane is active; do not edit in production and preview at the
same time. Browser-local IndexedDB checkpoints are origin-specific, so `Sync
Now` before switching origins if the current browser reports unsynced work.

## Immutable packages: explicit game opt-in

The protected `publish` workflow always runs the full release gate, publishes
or byte-verifies both public packages with npm provenance, creates or verifies
the immutable GitHub release, coordinates the reference Preview release ref,
and deploys that exact commit to Preview. It does not promote Production by
default. Existing games remain on their exact package pins until they opt into
the new version.

## Production: separate explicit promotion

`https://pop-party.onrender.com` remains pinned to an immutable public engine
release. Promote a tested batch by:

1. updating both public package versions and the reference app's exact engine
   dependency/compatibility;
2. merging that release-only commit to `main`;
3. dispatching `publish` with the exact version, `PUBLISH` confirmation, and
   Production promotion enabled;
4. approving the protected `npm-publish` environment.

The Production job advances only the Production release ref, deploys
Production, and verifies the complete tuple. Preview is coordinated separately
at the same immutable commit. The ordinary preview workflow deliberately
defers a version-bump commit until the protected publication workflow has
published the package and advanced Preview's isolated release ref; this is a
successful deferral, not a failed build.

## Render configuration

Both services are represented in `render.yaml` and remain single-instance free
Node services:

- `pop-party`: production channel, automatic deploys off;
- `pop-party-preview`: preview channel, automatic deploys off and deployed only
  after CI through `RENDER_PREVIEW_DEPLOY_HOOK_URL`; the reference app selects
  `PARTY_GAME_PREVIEW_RELEASE_REF` (default `heads/game-releases-preview`).

The preview service is cloned from production so the GitHub App content
credentials remain identical. It uses a separate GitHub OAuth application with
the callback
`https://pop-party-preview.onrender.com/auth/github/callback`.

The health response exposes non-secret deployment identity under
`application.version`, `application.commit`, `application.branch`, and
`application.channel`. Deployment verification relies on these fields instead
of inferring a release from Render timing.

Free Render services can spin down after inactivity. The first preview request
after an idle period can therefore take about a minute while the service wakes.
