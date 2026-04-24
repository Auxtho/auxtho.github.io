# Auxtho Public Site Update Runbook

> Audience: AI agents and maintainers editing `auxtho.github.io`
> Purpose: prevent stale-branch pushes, verify-page regressions, and accidental edits in the wrong repo
> Last incident reference: 2026-04-24 recovery of `codex/core-shadow` commit `3015b21`

## 1. Repository boundary

The public website is a separate Git repository inside the main workspace:

```powershell
A:\Projects\Auxtho\auxtho.github.io
```

Do not make public-site commits from:

```powershell
A:\Projects\Auxtho
```

The parent workspace has many product, backend, frontend, docs, and worktree changes. Treat it as unrelated unless the user explicitly asks for product-code work.

Always begin site work with:

```powershell
Set-Location A:\Projects\Auxtho\auxtho.github.io
git status --short --branch
git branch --all --verbose --no-abbrev
git log --oneline --decorate --graph --all -n 30
```

## 2. Deployment branch rule

GitHub Pages deploys from `origin/main`.

Before pushing public-site changes, confirm:

```powershell
git show --oneline --decorate --no-patch origin/main
git status --short --branch
```

Never push an old local `main` if it says something like:

```text
main...origin/main [ahead N, behind M]
```

That means local `main` and deployed `origin/main` have diverged. Create a fresh repair branch from `origin/main` instead.

Safe pattern:

```powershell
git switch -c codex/site-update-<short-name> origin/main
```

## 3. Handling changes from another AI branch or commit

If the user gives a branch and commit, such as:

```text
branch: codex/core-shadow
commit: 3015b21
files: index.html, verify.html, custom.css, final-overrides.css, verify.css, verify.js
```

Do not blindly merge or push that branch.

First inspect:

```powershell
git show --stat --oneline --decorate 3015b21
git show --name-status --oneline 3015b21
git diff --name-status origin/main..codex/core-shadow
git merge-base origin/main codex/core-shadow
```

If the branch is stale, create a fresh branch from `origin/main` and cherry-pick:

```powershell
git switch -c codex/site-update-<short-name> origin/main
git cherry-pick 3015b21
```

If there are conflicts, resolve them manually. Preserve newer deployed assets and behavior from `origin/main` unless the user explicitly says to replace them.

## 4. Verify page protection

`verify.html` is sensitive. It may reference versioned verification assets such as:

```html
<script src="/assets/verify-2026-04-24b.js?v=2026-04-24b"></script>
```

Do not replace this with an older:

```html
<script src="/assets/verify.js?..."></script>
```

unless the user explicitly asks and you have checked the current deployed verification flow.

Before finishing, confirm these files exist when referenced:

```powershell
$files=@(
  'assets/style.css',
  'assets/custom.css',
  'assets/final-overrides.css',
  'assets/verify.css',
  'assets/verify-2026-04-24b.js',
  'assets/tw-init.js',
  'assets/logo-white.svg',
  'assets/favicon.svg'
)
$files | ForEach-Object { [pscustomobject]@{ Path=$_; Exists=(Test-Path -LiteralPath $_) } }
```

## 5. Conflict resolution checklist

After any merge or cherry-pick conflict, run:

```powershell
git diff --check
$siteFiles = 'index.html','verify.html','assets\custom.css','assets\final-overrides.css'
Select-String -Path $siteFiles -Pattern '<<<<<<<|=======|>>>>>>>|\?\?'
Select-String -Path $siteFiles -Pattern ([char]0xfffd)
```

Required cleanup:

- remove all `<<<<<<<`, `=======`, `>>>>>>>` markers
- ensure `verify.html` has only one `<!DOCTYPE html>`, one `<html>`, and one `<head>`
- preserve latest `origin/main` verify JS asset unless intentionally changing it
- avoid leaving duplicated CSS blocks, especially media queries
- visible page text must not contain replacement characters

CSS comments may contain old comment artifacts only if they are harmless and not visible, but prefer cleaning them during a dedicated cleanup pass.

## 6. Local static preview

Start a local static server from the site repo:

```powershell
Set-Location A:\Projects\Auxtho\auxtho.github.io
python -m http.server 4173 --bind 127.0.0.1
```

Then check:

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/verify.html
```

Expected local caveat:

- `verify.html` may show a CORS/API error when it tries to call `http://127.0.0.1:8000/api/verify/status`.
- That is acceptable for static-site layout verification if the backend is not running.
- It is not acceptable if layout, scripts, links, or referenced assets are broken.

## 7. Browser verification checklist

Use Playwright or a real browser to check desktop and mobile.

Minimum checks:

- `/` renders with the intended hero, controls, workflow, sample, FAQ, verify, and pilot sections
- `/verify.html` renders the manual verification form and status panels
- no visible conflict markers
- no visible replacement characters
- no broken images
- no horizontal overflow on mobile width around 390px
- CTA mailto links contain the intended subject
- footer links remain company-channel safe

Useful in-browser checks:

```js
({
  title: document.title,
  bodyWidth: document.body.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  hasConflictMarkers: document.documentElement.innerHTML.includes('<<<<<<<') || document.documentElement.innerHTML.includes('>>>>>>>'),
  brokenImages: Array.from(document.images).filter(img => !img.complete || img.naturalWidth === 0).map(img => img.getAttribute('src')),
  visibleTextHasReplacement: document.body.innerText.includes(String.fromCharCode(0xfffd)),
  horizontalOverflow: document.body.scrollWidth > document.documentElement.clientWidth + 1
})
```

## 8. Push process

Only push after:

- `git diff --check` passes
- conflict marker search is clean
- local browser verification is acceptable
- `git status --short --branch` shows the intended site branch only

Preferred push for a verified fast-forward site deploy:

```powershell
git push origin HEAD:main
```

Then confirm:

```powershell
git show --oneline --decorate --no-patch HEAD
git show --oneline --decorate --no-patch origin/main
git status --short --branch
```

`HEAD` and `origin/main` should point to the same deployed commit after a successful push.

## 9. What happened on 2026-04-24

The user reported:

```text
branch: codex/core-shadow
commit: 3015b21
files: index.html, verify.html, custom.css, final-overrides.css, verify.css, verify.js
```

Findings:

- `3015b21` contained the intended homepage v1.5 governance copy patch.
- `codex/core-shadow` was stale relative to `origin/main`.
- Applying it directly would have removed the current deployed `assets/verify-2026-04-24b.js` path.
- `verify.html` in the patch also duplicated the document head.

Correct recovery:

```powershell
git switch -c codex/homepage-core-shadow-fix origin/main
git cherry-pick 3015b21
# manually resolve verify.html conflict
# preserve assets/verify-2026-04-24b.js
# remove duplicate doctype/head
# clean CSS media-query duplication
git add assets/custom.css assets/final-overrides.css index.html verify.html
git cherry-pick --continue
git diff --check
# browser verification
git push origin HEAD:main
```

Final deployed commit:

```text
0a74369 feat(homepage): v1.5 governance copy patch
```

Actual final changed files:

- `index.html`
- `verify.html`
- `assets/custom.css`
- `assets/final-overrides.css`

`assets/verify.css` and `assets/verify.js` were already current on `origin/main`, so no new final changes were needed there.

## 10. Safety rules

- Do not force-push `main`.
- Do not reset, checkout, or delete user work without explicit approval.
- Do not push from the parent `A:\Projects\Auxtho` repo when working on the public website.
- Do not deploy a branch just because it has the requested commit; compare it to `origin/main` first.
- Do not remove versioned assets referenced by deployed HTML.
- Do not broaden Auxtho public positioning unless the user explicitly asks. Current public framing stays narrow: approval-gated, evidence-linked release boundary for AI-assisted internal artifacts.
