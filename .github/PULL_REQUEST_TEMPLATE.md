<!--
Base branch is `master`. Open this PR against `master`.
Keep it short and specific. Delete the guidance comments before submitting.
-->

## Summary

<!-- One or two sentences: what does this PR do and why? -->

## Linked issue

<!-- e.g. Closes #123 / Relates to #45. Write "None" if there is no issue. -->

## What changed

<!-- Bullet the meaningful changes. Note any behavior/contract changes. -->

-

## Verification

<!--
List the commands you ACTUALLY ran, in order, with their real results. Do not
claim a command passed if you did not run it. The full gate is:
  npm run lint, npm run typecheck, npm run build, npm test, npm run test:coverage
-->

| Command | Result |
| ------- | ------ |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm run build` | |
| `npm test` | |
| `npm run test:coverage` | |

## Documentation

- [ ] I updated the nearest `AGENTS.md` (and any affected Child DOX Index) if this
      change affects a contract, structure, or user-facing behavior.
- [ ] No `AGENTS.md`/docs update was needed because this change does not alter any contract.

## Chaos test

- [ ] This change touches resilience behavior (cache, circuit breaker, rate limiter,
      retry, or security) and **needs a chaos test** under `tests/chaos/`.
- [ ] No chaos test is needed (this change does not affect a resilience path).
