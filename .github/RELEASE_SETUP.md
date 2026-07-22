# Public release setup

The publish workflow is intentionally manual and remains inert until the
external release authorities exist. Before its first use:

1. Rename this repository to `MarkTurowetz/pop-party-engine`, make it public,
   and preserve the GitHub redirect from the old name.
2. Create the public npm scope `@pop-party`.
3. Reserve `@pop-party/engine` and `@pop-party/create-game` if npm requires an
   initial package creation step.
4. Configure npm trusted publishing for both packages. The trusted publisher
   must be this GitHub repository, workflow `.github/workflows/publish.yml`, and
   environment `npm-publish`.
5. Create the GitHub environment `npm-publish`, restrict it to `main`, and add
   Mark as a required reviewer.
6. Protect `main`; require the `check` workflow and disallow force pushes.
7. Confirm the repository history audit, starter-asset inventory, and public
   licensing gate all pass from the renamed public repository.

To release, commit the exact same version to both public package manifests and
the reference app's exact engine dependency, merge that version change to
`main`, then manually dispatch `publish` with the version and confirmation
`PUBLISH`. The workflow uses GitHub OIDC and npm provenance; no long-lived npm
token belongs in repository or environment secrets.
