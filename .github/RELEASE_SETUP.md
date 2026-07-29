# Public release setup

The publish workflow is intentionally manual and remains inert until all
external release authorities exist. Current setup status:

- [x] Rename this repository to `MarkTurowetz/pop-party-engine`, make it
  public, and preserve the GitHub redirect from the old name.
- [x] Create the public npm scope `@pop-party`.
- [x] Reserve `@pop-party/engine` and `@pop-party/create-game` if npm requires an
   initial package creation step.
   The latter is the package npm resolves for the public command
   `npm create @pop-party/game`.
- [x] Configure npm trusted publishing for both packages. The trusted publisher
   must be this GitHub repository, workflow `.github/workflows/publish.yml`, and
   environment `npm-publish`.
- [x] Create the GitHub environment `npm-publish`, restrict it to protected
   branches, and add
   Mark as a required reviewer.
- [x] Protect `main`; require the `check` workflow and disallow force pushes.
- [x] Confirm the repository history audit, starter-asset inventory, and public
   licensing gate all pass from the renamed public repository.
- [x] Add the reference service's secret Render deploy hook as the repository
   Actions secret `RENDER_DEPLOY_HOOK_URL`. The hook is a credential and must
   never be committed or printed.
- [x] Set the reference service to Auto-Deploy `Off` and keep the Render
   Blueprint aligned with `autoDeployTrigger: off`.
- [x] Clone the production reference service as the free
   `pop-party-preview` service, set `PARTY_GAME_DEPLOYMENT_CHANNEL=preview`,
   and keep Auto-Deploy `Off`.
- [x] Create a separate GitHub OAuth application for Preview with callback
   `https://pop-party-preview.onrender.com/auth/github/callback`.
- [x] Add the Preview service's private Render hook as the repository Actions
   secret `RENDER_PREVIEW_DEPLOY_HOOK_URL`.

Both CI workflows are self-contained on the checked-out engine repository.
They must not fetch a game-specific `game-data` branch; the reference app owns
its tracked authoring seed and immutable content bundle under `apps/reference`.

To release, commit the exact same version to both public package manifests and
the reference app's exact engine dependency, merge that version change to
`main`, then manually dispatch `publish` with the version and confirmation
`PUBLISH`.

The protected workflow owns the complete sequence:

1. run release checks and the complete validation suite;
2. publish both immutable npm packages, or verify byte-for-byte package content
   when an interrupted workflow is rerun;
3. create or verify the immutable GitHub release;
4. advance only the reference release coordinates on `game-releases`, retaining
   the exact active content revision through a compare-and-swap update;
5. trigger Render for the exact released commit; and
6. verify production health, engine version, release revision, and rendered
   application build.

If Render cannot be triggered or production does not converge, the workflow
writes a compensating release record that restores the previous engine
coordinates. It never rewinds `game-releases` and refuses to overwrite a
concurrent Tool save or release mutation.

The workflow uses GitHub OIDC and npm provenance; no long-lived npm token
belongs in repository or environment secrets. Render no longer reacts directly
to merges because a merged engine commit is not deployable until npm and the
release tuple are ready.

Ordinary non-release merges are deployed to
`https://pop-party-preview.onrender.com` by the `preview` workflow after the
`check` workflow succeeds. They keep the current package version and do not run
the npm/GitHub/production release sequence. See `docs/deployment-lanes.md`.
