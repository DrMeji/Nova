# Releasing ARK (private source → public installer)

## Layout

- **DrMeji/Ark-Source** (private) — all source, CI builds, tags.
- **DrMeji/Ark** (public) — README + GitHub Releases with `.exe` / `latest.yml` only.

In-app **Settings → Updates** reads the **public** repo anonymously. That only works if installers live on `DrMeji/Ark`.

## Safe publish checklist

1. Bump `package.json` version and private changelog.
2. Commit + tag on **Ark-Source** only (`git push origin main` and `git push origin vX.Y.Z`).
3. Build: `npm run electron:build` → `release/ARK-Setup.exe`.
4. Upload installers to **public** Ark:

```powershell
pwsh scripts/publish-public-release.ps1 -Tag v0.1.147
```

5. Confirm public repo tree is still **only** `README.md` (no `src/`, no `electron/`).

```powershell
gh api repos/DrMeji/Ark/contents --jq "[.[].name]"
```

## What not to do

- Do not make **Ark-Source** public.
- Do not push this working tree to `DrMeji/Ark`.
- Do not attach source zips to public Releases.
- Do not paste internal docs (`docs/ark-brain-api.md`, etc.) into public release notes.

## CI note

If GitHub Actions builds from Ark-Source, the job must upload assets with a token that can write Releases on **DrMeji/Ark** (cross-repo). Default `GITHUB_TOKEN` only covers Ark-Source.
