# Publishing mysecureos-js-sdk

How to release a new version of `mysecureos-js-sdk` to npm from a
maintainer's machine.

- **Package:** https://www.npmjs.com/package/mysecureos-js-sdk
- **Repository:** https://github.com/mysecureos/mysecureos-js-sdk

---

## Before your first release

Do these once per machine.

1. **Use npm 11 or newer.** It is needed for `npm stage`.
   ```bash
   npm install -g npm@11
   npm --version   # should print 11.x
   ```
   npm 12 needs Node 22.22+ or 24.15+. Stay on npm 11 unless your Node meets
   that requirement.

2. **Get publish access.** Ask an existing maintainer to add your npm account.
   Then check that you're on the list:
   ```bash
   npm owner ls mysecureos-js-sdk
   ```

3. **Log in.**
   ```bash
   npm login
   npm whoami      # should print your npm username
   ```
   The account uses a **security key** for 2FA. npm opens the browser, and
   you approve the login with your key. You won't get an emailed code or an
   authenticator-app code.

---

## Releasing a new version

### 1. Start from an up-to-date, clean `main`

```bash
git checkout main
git pull
git status            # must show "nothing to commit, working tree clean"
npm ci
```

### 2. Update the changelog

Add a section for the new version at the top of [CHANGELOG.md](CHANGELOG.md),
then commit it:

```bash
git add CHANGELOG.md
git commit -m "changelog for vX.Y.Z"
```

### 3. Choose the version bump

Follow [semver](https://semver.org). While the SDK is still `0.x`:

| Change | Command | Example |
| --- | --- | --- |
| Bug fix, docs, internal change | `npm version patch` | 0.2.3 → 0.2.4 |
| New feature, or any breaking change | `npm version minor` | 0.2.3 → 0.3.0 |
| First stable release (1.0.0) | `npm version major` | 0.x → 1.0.0 |

```bash
npm version patch     # or minor / major
```

This updates `package.json` and `package-lock.json`. It also creates a commit
named after the version and a `vX.Y.Z` git tag. The `version` script reformats
`package.json` so the release commit passes lint.

### 4. Publish

```bash
npm publish --access public
```

- `prepublishOnly` runs **lint, typecheck, tests and the build** first. If any
  of them fails, nothing is published.
- When npm prints `Authenticate your account at: …`, press **Enter** and
  approve with your security key in the browser.
- **Run it once.** If you see _"You cannot publish over the previously
  published versions"_, the first attempt already succeeded. See
  [Troubleshooting](#troubleshooting).

### 5. Push the release commit and tag

```bash
git push --follow-tags
```

### 6. Verify

```bash
npm view mysecureos-js-sdk version      # the new version
npm view mysecureos-js-sdk dist-tags    # latest should point to it
```

Then open https://www.npmjs.com/package/mysecureos-js-sdk and check that the
version and the README look right.

Optionally, create a **GitHub Release** for the `vX.Y.Z` tag and paste in the
changelog entry. This only adds release notes on GitHub. It doesn't publish
anything.

---

## Quick reference

```bash
git checkout main && git pull && npm ci
# update CHANGELOG.md and commit it
npm version patch                # or minor / major
npm publish --access public      # approve with your security key, once
git push --follow-tags
npm view mysecureos-js-sdk version
```

---

## Staged versions

npm may hold a new version for review instead of publishing it at once. While
it waits, the package page can show a placeholder version `0.0.0-stage`. To
approve the version:

```bash
npm stage list                    # shows the staged version and its stage ID
npm stage approve <stage-id>      # approve with your security key
```

You can also approve it on npmjs.com. To discard a staged version, run
`npm stage reject <stage-id>`.

---

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `403 … cannot publish over the previously published versions: X.Y.Z` | That version is already on npm, often from an earlier attempt that succeeded. | Run `npm view mysecureos-js-sdk versions`. If the version is listed, skip to step 5. To release new changes, bump the version again. npm never accepts the same version twice. |
| `403 … Two-factor authentication … is required` | You aren't logged in, or the login expired. | Run `npm login` and approve with your security key. |
| `ENEEDAUTH` / `401 Unauthorized` | You aren't logged in. | Run `npm login`. |
| `prepublishOnly` fails on **lint**, mentioning `package.json` format | `package.json` was edited by hand or by a tool, and Biome's format differs. | Run `npx biome format --write package.json` and commit. If the version commit hasn't been pushed yet, use `git commit --amend -a --no-edit && git tag -f vX.Y.Z`. |
| `prepublishOnly` fails on typecheck, tests or build | A real problem in the code. | Fix it on `main` and commit. If the version commit hasn't been pushed, amend it and move the tag as above. Then publish again. |
| `npm version` fails with _"Git working directory not clean"_ | There are uncommitted changes. | Commit or stash them first. |
| `Unknown command: "stage"` | Your npm is older than 11.15. | Run `npm install -g npm@11`. |
| `EBADENGINE` when installing npm 12 | npm 12 needs a newer Node. | Install `npm@11` instead. |

### Undoing a bad release

npm doesn't let you replace a published version. Instead:

1. Fix the problem and publish a new patch version.
2. Deprecate the bad version so installers are warned:
   ```bash
   npm deprecate mysecureos-js-sdk@X.Y.Z "broken release, use X.Y.Z+1"
   ```

Avoid `npm unpublish`. It's limited to the first 72 hours, and that version
number can never be reused.

---

## What gets published

Only the `dist/` folder, plus `README.md` and `package.json`, which npm always
includes. This is controlled by `"files"` in `package.json`. To preview the
exact contents before publishing:

```bash
npm pack --dry-run
```

npm takes the README shown on the package page from the published package. To
update it, publish a new version.
