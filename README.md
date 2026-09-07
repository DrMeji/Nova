# NOVA

Private **source** repository for the NOVA desktop app.

| Repo | Visibility | What is there |
|------|------------|---------------|
| **[DrMeji/Ark](https://github.com/DrMeji/Ark)** | **Public** | README + Windows installers / Releases only |
| **DrMeji/Ark-Source** (this repo) | **Private** | Full application source |

Current source: **v0.1.197** · Private changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md) · Public downloads: [NOVA Releases](https://github.com/DrMeji/Ark/releases)

## Releasing (do not leak source)

1. Develop and commit **only** to `DrMeji/Ark-Source` (private).
2. Tag / run **Release** CI → installer lands on **NOVA-Source** first (test that build, or a local bat/dev build).
3. Only after it looks good, re-run Release with **publish_public** (or the helper below) so public **DrMeji/Ark** gets:
   - `NOVA-Setup.exe`
   - `NOVA-Setup.exe.blockmap` (optional)
   - `latest.yml` (optional, for differential updates — leave off until auto-update is intentional)
4. **Never** `git push` source trees, `src/`, `electron/`, or docs internals to `DrMeji/Ark`.

Helper (public only, after a local `release/` build):  
`pwsh scripts/publish-public-release.ps1 -Tag v0.1.xxx -Repos @('DrMeji/Ark')`

See [docs/RELEASING.md](docs/RELEASING.md).

## Website (preview)

Marketing + account-help site lives in [`website/`](website/). It is **not** packaged into the desktop installer.

```bash
npm run website:dev
```

Open http://localhost:5180 — details in [website/README.md](website/README.md).
