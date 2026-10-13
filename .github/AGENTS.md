# .github

## Purpose

Two workflows — `workflows/ci.yml` validating changes, `workflows/release.yml` publishing the npm package from a version tag — plus the community health surface: `ISSUE_TEMPLATE/` issue forms, `PULL_REQUEST_TEMPLATE.md`, `dependabot.yml`, and `AGENTS.md` itself. `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md` live at the repository root and are owned by the root doc.

## Ownership

- This folder owns when checks run, on which Node versions, and in what order. The checks themselves are the root package scripts (`package.json:16-31`) — changing a script changes CI.
- Test layer semantics live in `tests/AGENTS.md`; README swap rules live in the root `AGENTS.md`.

## Local Contracts

- `ci.yml` triggers on push and pull_request to `master`, `main`, and `develop`. `master` was added on 2026-10-13; until then the filter named only branches this repository does not use, so no push or PR ever started a workflow and no status badge could render.
- Job `test` (`:14-49`) runs on `ubuntu-latest` over a Node matrix of `22.x` and `24.x` (`:20`) in this order: `actions/checkout@v4`, `actions/setup-node@v4`, `npm ci` (`:32`), `npm run lint` (`:35`), `npm run typecheck` (`:38`), `npm run build` (`:41`), `npm test` (`:44`), `npm run test:coverage` (`:47`), then `codecov/codecov-action@v4` (`:49-54`) uploading `./coverage/lcov.info` with `fail_ci_if_error: false`, so a missing token or failed upload never blocks.
- Job `build` (`:56-80`) is Node `24` only (`:66`), runs `npm run build`, and asserts `dist` exists (`:74-80`). It is a separate job, not a step in `test`.
- Effective gates: lint, typecheck, the full Jest suite, and the 85% coverage threshold inside `test:coverage`. `npm run lint` does not pass `--max-warnings`, so the `complexity`, `max-lines-per-function`, `max-depth`, and `no-console` warnings cannot fail a run. The real lint and test baseline in `src/` and `tests/` is red, so the first workflow run on `master` is expected to fail; the README carries no CI shield until that baseline is green.
- Build-before-test is fixed: the `test` job runs `npm run build` after typecheck and before `npm test`, because the four `tests/e2e/` plus six `tests/chaos/` suites spawn `dist/index.js` and reject with `Server build not found` when it is absent. The standalone `build` job remains as a separate Node-18 dist assertion.
- `release.yml` triggers only on a tag push matching `v*` and requests `contents: write` plus `id-token: write`. Sequence: checkout with `fetch-depth: 0`, Node `24` with `registry-url`, `npm ci`, `lint`, `typecheck`, `npm run build`, `npm test`, `npm run readme:npm`, `npm publish --provenance` with `NODE_AUTH_TOKEN`, `gh release create` in a `run:` step, then `npm run readme:github`.
- Release blockers fixed 2026-10-13: the README steps no longer call the Windows `copy` command on `ubuntu-latest`, the build precedes the tests, and the post-publish `git add`/`commit`/`push` of `README.md` was deleted — it lacked `contents: write`, ran from a detached tag checkout so it could never have succeeded, and the runner is discarded regardless.
- `gh` is preinstalled on GitHub runners, so the release step adds no third-party action dependency.
- Publishing still needs its own approval: the repo is now at `2.0.0` (the Node floor break from the 2026-10-13 dependency upgrade) while npm serves `1.0.1`, so a `v2.0.0` tag would publish a major that drops Node 18 and 20 support.

## Work Guidance

- Any new gate added here must exist as a package script, so a contributor can reproduce it locally with the same command.
- Keep Node versions aligned with `engines` (`package.json:71-74`, Node >= 22.13) and update the matrix and the Docker base image together (`Dockerfile` uses `node:22-alpine` in both stages, and its builder must install dev dependencies because `npm run build` runs `tsc` there).
- Secrets referenced here: `secrets.CODECOV_TOKEN`, `secrets.NPM_TOKEN`, and the automatic `secrets.GITHUB_TOKEN`.

## Verification

- `act` is not configured; validate a workflow change by running its commands in order locally: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:coverage`.
- `npm run build` before `npm test` is the local order that CI does not currently use.

## Child DOX Index

None. This folder is a leaf.
