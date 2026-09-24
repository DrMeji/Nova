# Releasing NOVA (private source → public installer)

## Layout

- **DrMeji/Nova-Source** (private) — all source, CI builds, tags.
- **DrMeji/Nova** (public) — README + GitHub Releases with `.exe` / `latest.yml` only.

In-app **Settings → Updates** reads the **public** repo anonymously. That only works if installers live on `DrMeji/Nova`.

## Safe publish checklist

1. Bump `package.json` version and private changelog.
2. Commit + tag on **Nova-Source** only (`git push origin main` and `git push origin vX.Y.Z`).
3. **Test first (private):** CI Release on a `v*` tag builds the installer and publishes to **Nova-Source** only. Download that build (or use a local bat/dev `electron:build`) and smoke-test before anything goes public.
4. **Then public:** Actions → **Release** → Run workflow → same tag → check **publish_public**. That step needs repo secret `NOVA_PUBLIC_RELEASE_TOKEN`. Or run locally after a good build:

```powershell
pwsh scripts/publish-public-release.ps1 -Tag v0.1.147 -Repos @('DrMeji/Nova')
```

5. Confirm public repo tree is still **only** `README.md` (no `src/`, no `electron/`).

```powershell
gh api repos/DrMeji/Nova/contents --jq "[.[].name]"
```

In-app auto-update can stay off until you are ready to ship public `latest.yml` regularly — private testing does not require it.

## GitHub “Source code (zip)” on public Releases

GitHub **always** attaches Source code (zip) and Source code (tar.gz) to every release. They cannot be removed.

On **DrMeji/Nova** those archives only contain the public README (and guard workflow) — **not** the NOVA app. Real source stays in **Nova-Source**.

When writing public release notes, remind downloaders to use **NOVA-Setup.exe** only.

## CI note

Tag push / default Release run → **Nova-Source only**.  
Public publish is opt-in via workflow_dispatch `publish_public`.
