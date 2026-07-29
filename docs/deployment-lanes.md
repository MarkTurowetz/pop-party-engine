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

Ordinary feature and bug-fix commits do not bump or publish the public npm
packages. They merge with the current engine version and become testable on the
preview URL without an npm release, GitHub release, production approval, or
production Render deployment.

The free preview service intentionally uses the same Git-backed content store as
the production reference app. Use the preview Tools as the single authoring
surface once this lane is active; do not edit in production and preview at the
same time. Browser-local IndexedDB checkpoints are origin-specific, so `Sync
Now` before switching origins if the current browser reports unsynced work.

## Production: explicit promotion

`https://pop-party.onrender.com` remains pinned to an immutable public engine
release. Promote a tested batch by:

1. updating both public package versions and the reference app's exact engine
   dependency/compatibility;
2. merging that release-only commit to `main`;
3. dispatching `publish` with the exact version and `PUBLISH` confirmation;
4. approving the protected `npm-publish` environment.

The production workflow publishes or verifies the npm packages, creates the
GitHub release, advances the coordinated content release, deploys production,
and verifies the complete tuple. It then refreshes the preview service at the
same release commit. The ordinary preview workflow deliberately defers a
version-bump commit while production still advertises the older engine; this is
a successful deferral, not a failed build.

## Render configuration

Both services are represented in `render.yaml` and remain single-instance free
Node services:

- `pop-party`: production channel, automatic deploys off;
- `pop-party-preview`: preview channel, automatic deploys off and deployed only
  after CI through `RENDER_PREVIEW_DEPLOY_HOOK_URL`.

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
