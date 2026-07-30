# Contributing & release process

Small project, light process — but everything now goes through a branch and a PR
so `master` stays releasable and CI-green.

## Branching

`master` is the always-deployable trunk. Don't commit to it directly — branch off it:

```bash
git switch master && git pull
git switch -c feat/short-description   # or fix/… or chore/…
```

Prefixes: `feat/` (new feature), `fix/` (bug fix), `chore/` (tooling/docs/deps),
`refactor/`, `docs/`. Keep branches short-lived and focused.

## Pull requests

1. Push the branch and open a PR against `master` (`gh pr create --fill`).
2. CI (`.github/workflows/ci.yml`) runs `npm run typecheck` and `npm test` on every
   PR — it must be green to merge.
3. Fill in the PR template, and add a line to **CHANGELOG.md** under `[Unreleased]`
   if the change is user-facing.
4. Merge with **Squash and merge** so `master` keeps one tidy commit per PR.

Recommended: protect `master` so it can only change via a green PR. Easiest in
the GitHub UI — **Settings → Branches → Add branch ruleset**, targeting `master`:
enable *Require a pull request before merging* and *Require status checks to pass*
with the `test` check selected.

Or via the API with a JSON payload (avoids the flaky inline-field escaping):

```bash
gh api -X PUT repos/Squaark/squaark/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```

## Versioning & releases

[Semantic Versioning](https://semver.org). Pre-1.0, treat **minor** as features and
**patch** as fixes. To cut a release from a green `master`:

```bash
git switch master && git pull

# 1. Move the Unreleased notes in CHANGELOG.md under a new version heading, commit.
# 2. Bump the version + create the tag (updates package.json, makes an annotated tag):
npm version minor          # 0.1.0 -> 0.2.0   (use `patch` for a fix-only release)

# 3. Push the commit and the tag:
git push --follow-tags

# 4. Publish the GitHub release with the changelog section as the notes:
gh release create "v$(node -p "require('./package.json').version")" --notes-from-tag
```

CI runs on every push to `master` and every PR, so a tagged commit is already tested.
