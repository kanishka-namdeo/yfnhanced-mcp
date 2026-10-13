# .github

## Purpose

Two workflows: `workflows/ci.yml` validating changes, `workflows/release.yml` publishing the npm package from a version tag.

## Ownership

- This folder owns when checks run, on which Node versions, and in what order. The checks themselves are the root package scripts (`package.json:16-31`) — changing a script changes CI.
- Test layer semantics live in `tests/AGENTS.md`; README swap rules live in the root `AGENTS.md`.

## Local Contracts

- `ci.yml` triggers on push and pull_request to `main` and `develop` only (`:3-11`). This repository's default and working branch is `master`, so no push or PR to it starts any workflow. Treat CI as not running until the branch names in that filter match the branches in use.
- Job `test` (`:14-49`) runs on `ubuntu-latest` over a Node matrix of `18.x` and `20.x` (`:18`) in this order: `actions/checkout@v4`, `actions/setup-node@v4`, `npm ci` (`:30`), `npm run lint` (`:33`), `npm run typecheck` (`:36`), `npm test` (`:39`), `npm run test:coverage` (`:42`), then `codecov/codecov-action@v4` (`:44-49`) uploading `./coverage/lcov.info` with `fail_ci_if_error: false`, so a missing token or failed upload never blocks.
- Job `build` (`:51-75`) is Node `18` only (`:61`), runs `npm run build`, and asserts `dist` exists (`:69-75`). It is a separate job, not a step in `test`.
- Effective gates: lint, typecheck, the full Jest suite, and the 85% coverage threshold inside `test:coverage`. `npm run lint` does not pass `--max-warnings`, so the `complexity`, `max-lines-per-function`, `max-depth`, and `no-console` warnings cannot fail a run.
- Ordering defect: `ci.yml` never runs `npm run build` before `npm test`, and the four `tests/e2e/` plus six `tests/chaos/` suites reject with `Server build not found` when `dist/index.js` is absent. The `build` job runs concurrently rather than as a prerequisite.
- `release.yml` triggers only on a tag push matching `v*` (`:3-6`) and requests `contents: read` plus `id-token: write` (`:8-10`). Sequence: checkout with `fetch-depth: 0` (`:18-20`), Node `18` with `registry-url` (`:22-26`), `npm ci`, `lint`, `typecheck`, `npm test`, `npm run build` (`:41`), `npm run readme:npm` (`:44`), `npm publish --provenance` with `NODE_AUTH_TOKEN` (`:46-49`), `actions/create-release@v1` (`:51-59`), `npm run readme:github` (`:62`), then an inline `git add`/`git commit`/`git push` of `README.md` (`:64-70`).
- Release blockers visible from the config: both README steps call the Windows `copy` command (`package.json:29-30`) on `ubuntu-latest`; the final `git push` has no `contents: write` permission and runs from the detached tag checkout; `npm test` precedes `npm run build`, inheriting the same spawn-order defect as `ci.yml`.
- `actions/create-release@v1` is a third-party composite action pinned by tag, not a GitHub-maintained action.

## Work Guidance

- Any new gate added here must exist as a package script, so a contributor can reproduce it locally with the same command.
- Keep Node versions aligned with `engines` (`package.json:70-73`, Node >= 18) and update the matrix and the Docker base image together (`Dockerfile` uses `node:18-alpine`).
- Secrets referenced here: `secrets.CODECOV_TOKEN`, `secrets.NPM_TOKEN`, and the automatic `secrets.GITHUB_TOKEN`.

## Verification

- `act` is not configured; validate a workflow change by running its commands in order locally: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:coverage`.
- `npm run build` before `npm test` is the local order that CI does not currently use.

## Child DOX Index

None. This folder is a leaf.
