# Revisioned content publication runbook

Remote authoring remains disabled until the GitHub OAuth App, repository-scoped writer GitHub App, protected refs, and isolated asset delivery are provisioned.

## 1. Export and validate

```bash
npm run content:export-legacy -- --output tmp/content-bundle
npm run content:validate -- tmp/content-bundle
```

Record the reported game ID and root content revision. Do not substitute a newer export during later steps.

## 2. Dry-run the bootstrap

```bash
npm run content:bootstrap-github -- \
  --bundle tmp/content-bundle \
  --game-build 1.0.17.1057 \
  --engine-version 1.0.0 \
  --plugin-version 1.0.0
```

The default is validation-only and performs no network writes. Review the exact bundle root and release tuple printed by the command.

## 3. Provision secrets and refs

Set these only in the deployment/operator environment:

- `PARTY_GAME_CONTENT_STORE=github`
- `PARTY_GAME_CONTENT_GITHUB_REPO=owner/game`
- `PARTY_GAME_CONTENT_GITHUB_APP_ID`
- `PARTY_GAME_CONTENT_GITHUB_INSTALLATION_ID`
- `PARTY_GAME_CONTENT_GITHUB_PRIVATE_KEY`
- optionally `PARTY_GAME_CONTENT_REF`, `PARTY_GAME_CONTENT_DRAFT_REF_PREFIX`, and `PARTY_GAME_RELEASE_REF`

Protect `main` and every non-content ref so the writer App cannot bypass review. The App must be installed only on the game repository and granted only the repository contents permission required for the designated content, draft, and release refs.

## 4. Apply once

Repeat the reviewed command with `--apply`. It creates the initial immutable content commit and then the active release record. The command refuses an already initialized store rather than overwriting it.

## 5. Enable in stages

First enable `PARTY_GAME_CONTENT_STORE=github` with remote authoring disabled and verify health/readiness plus room revision pinning. Enable `PARTY_GAME_RUNTIME_CAPABILITIES=required` only after this passes. Enable `PARTY_GAME_REMOTE_AUTHORING=enabled` only after GitHub admin OAuth, CSRF, isolated assets, backups, and rollback checks pass.

Never enable these gates as a workaround for missing refs or invalid content. Fix the reported bootstrap/readiness diagnostic instead.
